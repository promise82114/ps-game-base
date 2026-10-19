const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'scripts', 'ps-game-base.user.js'), 'utf8').replace(/\r/g,'');
const source=bundle.split('// PSGB_LIBRARY_START\n')[1].split('// PSGB_LIBRARY_END')[0];
const HASH = 'a'.repeat(64);
const endpoint = 'https://web.np.playstation.com/api/graphql/v1/op';
function officialUrl() {
  const url = new URL(endpoint);
  url.searchParams.set('operationName', 'getPurchasedGameList');
  url.searchParams.set('extensions', JSON.stringify({ persistedQuery: { sha256Hash: HASH } }));
  return url.href;
}
function game(id) { return { name: `Game ${id}`, entitlementId: String(id), titleId: `PPSA${id}`, productId: `UP0000-PPSA${id}_00-TEST`, platform: 'PS5', membership: 'NONE', isActive: true, secret: 'must-not-export' }; }
function setup(responses = [], bridgeOrigin = '') {
  const calls = [];
  const messages = [];
  function XHR() {}
  XHR.prototype.open = function () {};
  XHR.prototype.setRequestHeader = function () {};
  XHR.prototype.send = function () {};
  const page = { fetch: (url, options) => {
    if (!options?.signal) return Promise.resolve('original');
    calls.push({ url, ...options });
    const next = responses.shift();
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('abort')), { once: true });
      queueMicrotask(() => {
        if (options.signal.aborted || next === 'hold') return;
        if (!next) return reject(new TypeError('network'));
        resolve(Response.json(next.body || { data: { purchasedTitlesRetrieve: next } }, { status: next.status || 200 }));
      });
    });
  }, XMLHttpRequest: XHR, opener: bridgeOrigin ? {postMessage:(value,origin)=>messages.push({value,origin})} : null };
  const context = vm.createContext({ URL, URLSearchParams, Headers, Request, AbortController, console, Blob, queueMicrotask, location: { href: 'https://library.playstation.com/recently-purchased', hostname: 'library.playstation.com', hash: bridgeOrigin ? '#'+new URLSearchParams({psgbOrigin:bridgeOrigin,psgbSession:'11111111-1111-4111-8111-111111111111'}) : '' }, window: page,
    document: { readyState: 'loading', addEventListener() {} },
    setTimeout(fn, ms) { return ms <= 350 ? setTimeout(fn, 0) : setTimeout(fn, ms); }, clearTimeout,
  });
  // Test-only access to the closure; no debug API exists in the installed script.
  vm.runInContext('const psgbTools={};\n'+source.replace(/\}\)\(\);\s*$/, 'globalThis.testApi = { inspect, sync, nextOffset, normalize, csvCell, state: () => ({authorization, queryHash, games, complete, busy, message, diagnostics, operations: [...operations], lastParseError}), stop: () => { generation++; pending?.abort(); } }; })();'), context);
  return { api: context.testApi, page, calls, messages };
}
function authorize(api) { api.inspect(officialUrl(), { Authorization: 'Bearer test-only' }); }

test('only the exact official purchased operation can supply authorization', () => {
  const { api } = setup();
  for (const url of [officialUrl().replace('web.np.playstation.com', 'evil.example'), officialUrl().replace('getPurchasedGameList', 'anotherOperation'), officialUrl().replace('/api/graphql/v1/op', '/other')]) api.inspect(url, { Authorization: 'Bearer rejected' });
  assert.equal(api.state().authorization, '');
  authorize(api); assert.equal(api.state().authorization, 'Bearer test-only');
  assert.equal(api.state().queryHash, HASH);
});
test('official fetch/XHR continue and capture headers case-insensitively', async () => {
  const { api, page } = setup();
  assert.equal(await page.fetch(officialUrl(), { headers: { authorization: 'Bearer fetch-token' } }), 'original');
  assert.equal(api.state().authorization, 'Bearer fetch-token');
  const xhr = new page.XMLHttpRequest(); xhr.open('GET', officialUrl()); xhr.setRequestHeader('Authorization', 'Bearer xhr-token'); xhr.send();
  assert.equal(api.state().authorization, 'Bearer xhr-token');
});
test('sync advances using server size, deduplicates entitlements and whitelists output', async () => {
  const { api, calls } = setup([
    { games: [game(1), game(2)], pageInfo: { offset: 0, size: 2, totalCount: 3, isLast: false } },
    { games: [game(2), game(3)], pageInfo: { offset: 2, size: 1, totalCount: 3, isLast: true } },
  ]);
  authorize(api); await api.sync();
  assert.equal(api.state().complete, true); assert.equal(api.state().games.length, 3);
  assert.equal(JSON.parse(new URL(calls[1].url).searchParams.get('variables')).start, 2);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-only');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.ok(!JSON.stringify(api.state().games).includes('secret'));
  assert.ok(!JSON.stringify(api.state().games).includes('test-only'));
});
test('unknown totals require a short/empty final page', () => {
  const { api } = setup();
  assert.equal(api.nextOffset({ games: [game(1), game(2)] }, 0, 2), 2);
  assert.equal(api.nextOffset({ games: [] }, 2, 2), null);
});
test('broken paging fails rather than marking complete', async () => {
  const { api } = setup([{ games: [game(1)], pageInfo: { offset: 0, size: 0, totalCount: 20, isLast: false } }]);
  authorize(api); await api.sync(); assert.equal(api.state().complete, false); assert.match(api.state().message, /分頁/);
});
test('GraphQL/HTTP/format errors never become a complete empty library', async () => {
  for (const response of [{ body: { errors: [{ message: 'private upstream detail' }] } }, { status: 401 }, { body: {} }]) {
    const { api } = setup([response]); authorize(api); await api.sync();
    assert.equal(api.state().complete, false); assert.equal(api.state().busy, false);
    assert.ok(!api.state().message.includes('private upstream detail'));
  }
});
test('legitimate empty library is complete', async () => {
  const { api } = setup([{ games: [] }]); authorize(api); await api.sync();
  assert.equal(api.state().complete, true); assert.equal(api.state().games.length, 0);
});
test('stop aborts an active request and leaves partial state', async () => {
  const { api } = setup(['hold']); authorize(api); const work = api.sync(); api.stop(); await work;
  assert.equal(api.state().complete, false); assert.equal(api.state().busy, false);
});
test('new official bearer clears the prior results', async () => {
  const { api } = setup([{ games: [game(1)] }]); authorize(api); await api.sync();
  api.inspect(officialUrl(), { Authorization: 'Bearer another-account' });
  assert.equal(api.state().games.length, 0); assert.equal(api.state().complete, false);
});
test('CSV escapes quotes and neutralizes formula cells', () => {
  const { api } = setup();
  assert.equal(api.csvCell('a,"b'), '"a,""b"');
  assert.equal(api.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(api.csvCell(' @SUM(1)'), '"\' @SUM(1)"');
});
test('fetch Request POST body is cloned and captured without consuming the original', async () => {
  const { api, page } = setup();
  const payload = { operationName: 'getPurchasedGameList', extensions: { persistedQuery: { sha256Hash: HASH } } };
  const original = new Request(endpoint, { method: 'POST', headers: { Authorization: 'Bearer request-object' }, body: JSON.stringify(payload) });
  await page.fetch(original);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(original.bodyUsed, false);
  assert.equal(api.state().authorization, 'Bearer request-object');
});
test('batched GraphQL captures only the purchased operation', async () => {
  const { api, page } = setup();
  const payload = [{ operationName: 'unrelated' }, { operationName: 'getPurchasedGameList', extensions: { persistedQuery: { sha256Hash: HASH } } }];
  await page.fetch(endpoint, { method: 'POST', headers: new Headers({ Authorization: 'Bearer batch-token' }), body: JSON.stringify(payload) });
  assert.equal(api.state().authorization, 'Bearer batch-token');
  assert.equal(api.state().diagnostics.purchased, 1);
  assert.ok(!JSON.stringify(api.state().diagnostics).includes('batch-token'));
});
test('diagnostics distinguish missing bearer, hash and unrelated traffic', () => {
  const { api, page } = setup();
  page.fetch('https://example.com/');
  api.inspect(officialUrl(), {});
  api.inspect(officialUrl().replace(HASH, 'bad'), { Authorization: 'Bearer test' });
  assert.equal(api.state().diagnostics.fetch, 1);
  assert.equal(api.state().diagnostics.noBearer, 1);
  assert.equal(api.state().diagnostics.noHash, 1);
});
test('official purchased request without bearer can sync using browser session', async () => {
  const { api, calls } = setup([{ games: [game(1)] }]);
  api.inspect(officialUrl(), {});
  assert.equal(api.state().authorization, '');
  assert.equal(api.state().queryHash, HASH);
  await api.sync();
  assert.equal(api.state().complete, true);
  assert.equal(api.state().games.length, 1);
  assert.equal(calls[0].credentials, 'include');
  assert.equal(Object.hasOwn(calls[0].headers, 'Authorization'), false);
});
test('no bearer does not permit syncing without a valid purchased query hash', async () => {
  const { api, calls } = setup();
  api.inspect(officialUrl().replace(HASH, 'invalid'), {});
  await api.sync();
  assert.equal(calls.length, 0);
  assert.equal(api.state().complete, false);
});
test('session mode still reports authorization errors without claiming complete', async () => {
  const { api } = setup([{ status: 403 }]);
  api.inspect(officialUrl(), {}); await api.sync();
  assert.equal(api.state().complete, false);
  assert.match(api.state().message, /HTTP 403/);
});
test('switching from bearer to browser session clears prior results', async () => {
  const { api } = setup([{ games: [game(1)] }]);
  authorize(api); await api.sync();
  api.inspect(officialUrl(), {});
  assert.equal(api.state().authorization, '');
  assert.equal(api.state().games.length, 0);
  assert.equal(api.state().complete, false);
});
test('URL-encoded GraphQL body works for fetch and XHR', async () => {
  const form = new URL(officialUrl()).searchParams;
  const { api, page } = setup();
  await page.fetch(endpoint, { method: 'POST', body: form.toString() });
  assert.equal(api.state().queryHash, HASH);
  assert.equal(api.state().diagnostics.parseError, 0);
  const second = setup();
  const xhr = new second.page.XMLHttpRequest(); xhr.open('POST', endpoint); xhr.send(form);
  assert.equal(second.api.state().queryHash, HASH);
  assert.equal(second.api.state().diagnostics.parseError, 0);
});
test('fetch URLSearchParams body is read as form data', async () => {
  const { api, page } = setup();
  await page.fetch(endpoint, { method: 'POST', body: new URL(officialUrl()).searchParams });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(api.state().queryHash, HASH);
});
test('unrecognized bodies are counted and never enable sync', async () => {
  const { api, calls } = setup();
  api.inspect(endpoint, {}, 'unrecognized-body');
  await api.sync();
  assert.equal(api.state().diagnostics.parseError, 1);
  assert.equal(calls.length, 0);
});

test('mixed URL and form fields preserve the official operation and hash', () => {
  const extensions = JSON.stringify({persistedQuery:{sha256Hash:HASH}});
  const cases = [
    [endpoint+'?operationName=getPurchasedGameList', new URLSearchParams({extensions}).toString()],
    [endpoint+'?'+new URLSearchParams({extensions}), 'operationName=getPurchasedGameList'],
  ];
  for (const [url,body] of cases) {
    const {api}=setup();api.inspect(url,{},body);
    assert.equal(api.state().queryHash,HASH);
    assert.equal(api.state().diagnostics.purchased,1);
    assert.equal(api.state().diagnostics.parseError,0);
  }
});

test('mixed URL and form fields work through fetch and XHR without consuming request body', async () => {
  const url=endpoint+'?operationName=getPurchasedGameList';
  const body=new URLSearchParams({extensions:JSON.stringify({persistedQuery:{sha256Hash:HASH}})});
  const first=setup();const original=new Request(url,{method:'POST',body});
  await first.page.fetch(original);await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(first.api.state().queryHash,HASH);assert.equal(original.bodyUsed,false);
  const second=setup();const xhr=new second.page.XMLHttpRequest();xhr.open('POST',url);xhr.send(body);
  assert.equal(second.api.state().queryHash,HASH);
});

test('diagnostics identify fixed parsing stages and bound public operation names without secrets', async () => {
  const {api,page}=setup();
  api.inspect(endpoint,{},'private-body');assert.equal(api.state().lastParseError,'請求本文（JSON／表單）');
  api.inspect(endpoint,{},JSON.stringify({operationName:'getPurchasedGameList',extensions:'private-invalid-json'}));
  assert.equal(api.state().lastParseError,'extensions JSON');
  api.inspect(officialUrl(),{'invalid\nheader':'private-header'});assert.equal(api.state().lastParseError,'請求標頭');
  await page.fetch('not a URL',{method:'POST',body:new URLSearchParams('a=b')});
  assert.equal(api.state().lastParseError,'fetch 請求複本');
  for(const operationName of ['bad operation!', 'a'.repeat(65), ...Array.from({length:10},(_,i)=>'PublicOperation'+i)]) api.inspect(endpoint,{},JSON.stringify({operationName}));
  assert.equal(api.state().operations.length,6);assert.ok(!api.state().operations.includes('bad operation!'));
  const diagnostic=JSON.stringify({counts:api.state().diagnostics,operations:api.state().operations,lastParseError:api.state().lastParseError});
  for(const secret of ['private-body','private-invalid-json','private-header','test-only'])assert.ok(!diagnostic.includes(secret));
});

test('mixed form parsing triggers exactly one complete result on the existing bridge', async () => {
  const {api,messages,calls}=setup([{games:[game(1)]}],'https://promise82114.github.io');
  const url=endpoint+'?operationName=getPurchasedGameList';
  const body=new URLSearchParams({extensions:JSON.stringify({persistedQuery:{sha256Hash:HASH}})}).toString();
  api.inspect(url,{},body);api.inspect(url,{},body);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(calls.length,1);assert.equal(messages.filter(m=>m.value.type==='PSGB_RESULT').length,1);
  assert.equal(messages.find(m=>m.value.type==='PSGB_RESULT').value.payload.complete,true);
});
test('entry uses recently-purchased while metadata supports the entire library host', () => {
  assert.match(source, /const LIBRARY = 'https:\/\/library\.playstation\.com\/recently-purchased'/);
  assert.match(bundle, /@match\s+https:\/\/library\.playstation\.com\/\*/);
});

test('bridge auto-sync returns whitelisted complete data only to the exact origin', async () => {
  for (const origin of ['http://127.0.0.1:4175', 'https://promise82114.github.io']) {
  const {api,messages,calls}=setup([{games:[game(1)]}], origin);
  authorize(api);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(calls.length,1);
  const result=messages.find(m=>m.value.type==='PSGB_RESULT');
  assert.ok(result);assert.equal(result.origin,origin);
  assert.equal(result.value.session,'11111111-1111-4111-8111-111111111111');
  assert.equal(result.value.payload.complete,true);
  assert.ok(!JSON.stringify(messages).includes('test-only'));
  assert.ok(!JSON.stringify(messages).includes('must-not-export'));
  }
});
test('bridge rejects insecure remote origins and never returns partial results', async () => {
  const invalid=setup([{games:[game(1)]}],'http://unsafe.example');authorize(invalid.api);
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(invalid.calls.length,0);
  const unknown=setup([{games:[game(1)]}],'https://unknown.example');authorize(unknown.api);
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(unknown.calls.length,0);
  const partial=setup([{status:401}],'http://127.0.0.1:4175');authorize(partial.api);
  await new Promise(resolve=>setTimeout(resolve,30));assert.ok(!partial.messages.some(m=>m.value.type==='PSGB_RESULT'));
});
