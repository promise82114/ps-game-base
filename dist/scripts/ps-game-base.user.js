// ==UserScript==
// @name         PS Game Base 遊戲庫
// @namespace    personal.ps-game-base
// @version      0.4.5
// @description  同步數位遊戲庫與已取得白金標記，提供 JSON 備份及選用的獎盃研究工具。
// @match        https://library.playstation.com/*
// @match        https://store.playstation.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      ca.account.sony.com
// @connect      m.np.playstation.com
// @connect      127.0.0.1
// @license      MIT
// ==/UserScript==


(() => {
 const psgbTools = {};
// PSGB_LIBRARY_START
/* Library query/pagination adapted from psn-mcp, Copyright (c) 2026 TMRP.
 * MIT license: see LICENSE in this script's distribution directory.
 */
(() => {
  'use strict';
  const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  if (new URLSearchParams(location.hash.slice(1)).has('psgbPlatinumSession')) return;
  const LIBRARY = 'https://library.playstation.com/recently-purchased';
  const ENDPOINT = 'https://web.np.playstation.com/api/graphql/v1/op';
  const OPERATION = 'getPurchasedGameList';
  // Add a deployed manager origin here only after you explicitly trust it.
  const MANAGER_ORIGINS = new Set(['http://127.0.0.1:4175', 'http://localhost:4175', 'https://promise82114.github.io']);
  // Only library data crosses the bridge; bearer tokens stay in this tab.
  let bridge = null, bridgeStarted = false;
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const origin = params.get('psgbOrigin'), session = params.get('psgbSession');
    if (origin && session && /^[a-f0-9-]{36}$/i.test(session) && pageWindow.opener && location.hostname === 'library.playstation.com') {
      const target = new URL(origin);
      if (target.origin === origin && MANAGER_ORIGINS.has(origin)) bridge = { origin, session };
    }
  } catch {}
  function sendBridge(type, payload) {
    if (!bridge) return;
    try { pageWindow.opener?.postMessage({type, session:bridge.session, ...payload}, bridge.origin); } catch {}
  }
  const networkFetch = pageWindow.fetch.bind(pageWindow);
  const diagnostics = { fetch: 0, xhr: 0, graphql: 0, purchased: 0, noBearer: 0, noHash: 0, parseError: 0 };
  const operations = new Set();
  let parseStage = '', lastParseError = '';
  let authorization = '', queryHash = '', generation = 0, pending = null;
  let games = [], complete = false, syncedAt = '', busy = false, message = '等待官方遊戲庫請求。請登入並切換到「已購買」，再開啟面板。';
  let host, root;

  function parsePayload(body, url) {
    const query = Object.fromEntries(url.searchParams);
    if (body === undefined || body === null || body === '') return query;
    const text = String(body).trim();
    if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text);
    const form = Object.fromEntries(new URLSearchParams(text));
    if (typeof form.operationName === 'string' || typeof form.extensions === 'string') return { ...query, ...form };
    throw new Error('unrecognized-body');
  }

  function inspect(rawUrl, headers, body) {
    try {
      const url = new URL(String(rawUrl), location.href);
      if (url.origin !== 'https://web.np.playstation.com' || url.pathname !== '/api/graphql/v1/op') return;
      diagnostics.graphql++;
      parseStage = '請求本文（JSON／表單）';
      const payload = parsePayload(body, url);
      if (Array.isArray(payload)) {
        for (const operation of payload) inspect(rawUrl, headers, JSON.stringify(operation));
        return;
      }
      if (typeof payload?.operationName === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(payload.operationName) && operations.size < 6) operations.add(payload.operationName);
      if (payload?.operationName !== OPERATION) return;
      diagnostics.purchased++;
      parseStage = 'extensions JSON';
      const extensions = typeof payload.extensions === 'string' ? JSON.parse(payload.extensions) : payload.extensions;
      const hash = extensions?.persistedQuery?.sha256Hash;
      parseStage = '請求標頭';
      const header = new Headers(headers).get('authorization');
      const token = /^Bearer\s+\S+$/i.test(header || '') ? header : '';
      if (!token) diagnostics.noBearer++;
      if (!/^[a-f0-9]{64}$/i.test(hash || '')) { diagnostics.noHash++; return; }
      if (queryHash && authorization !== token) {
        generation++;
        pending?.abort();
        games = []; complete = false; syncedAt = '';
      }
      authorization = token; queryHash = hash;
      if (bridge && !bridgeStarted) {
        bridgeStarted = true;
        sendBridge('PSGB_STATUS', {message:'已取得官方查詢，正在同步遊戲庫…'});
        queueMicrotask(sync);
      }
      if (!busy) message = token
        ? '已取得官方查詢碼與 Bearer，可以同步。登入憑證僅保留於本分頁。'
        : '已取得官方查詢碼，該請求未帶 Bearer。可以使用目前網頁登入工作階段嘗試同步。';
      render();
    } catch { diagnostics.parseError++; lastParseError = parseStage; }
    finally { render(); }
  }

  // Read only the headers of the official purchased-library request.
  // Credentials never enter DOM, console, persistent storage or exports.
  if (location.hostname === 'library.playstation.com') {
    const page = pageWindow;
    const originalFetch = page.fetch;
    page.fetch = function (input, init) {
      diagnostics.fetch++;
      try {
        const url = typeof input === 'string' || input instanceof URL ? input : input.url;
        const headers = init?.headers ?? input?.headers;
        // Clone before forwarding; reading the clone must not consume the real request.
        const hasBody = init?.body !== undefined || (input?.body && input?.clone);
        if (hasBody && typeof init?.body !== 'string' && typeof Request !== 'undefined') {
          const copy = new Request(typeof input?.clone === 'function' ? input.clone() : input, init);
          copy.text().then(body => inspect(url, headers, body)).catch(() => { diagnostics.parseError++; lastParseError = 'Request 本文複本'; render(); });
        } else inspect(url, headers, typeof init?.body === 'string' ? init.body : undefined);
      } catch { diagnostics.parseError++; lastParseError = 'fetch 請求複本'; }
      render();
      return Reflect.apply(originalFetch, this, arguments);
    };
    const proto = page.XMLHttpRequest.prototype;
    const originalOpen = proto.open, originalHeader = proto.setRequestHeader, originalSend = proto.send;
    const requests = new WeakMap();
    proto.open = function (_method, url) {
      requests.set(this, { url, headers: {} });
      return Reflect.apply(originalOpen, this, arguments);
    };
    proto.setRequestHeader = function (name, value) {
      const req = requests.get(this);
      if (req) {
        const key = String(name).toLowerCase();
        req.headers[key] = req.headers[key] ? `${req.headers[key]}, ${value}` : String(value);
      }
      return Reflect.apply(originalHeader, this, arguments);
    };
    proto.send = function (body) {
      diagnostics.xhr++;
      const req = requests.get(this);
      if (req) inspect(req.url, req.headers, typeof body === 'string' || body instanceof URLSearchParams ? String(body) : undefined);
      return Reflect.apply(originalSend, this, arguments);
    };
  }

  async function request(url, token) {
    const controller = new AbortController(); pending = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 25000);
    try {
      const r = await networkFetch(url, {
        method: 'GET', credentials: 'include', signal: controller.signal,
        headers: { ...(token ? {Authorization: token} : {}), 'Content-Type': 'application/json', 'Accept-Language': 'zh-Hant-TW' },
      });
      if (r.status === 401 || r.status === 403) throw new Error(`授權失效或無權存取（HTTP ${r.status}）。請重新登入／重新整理官方遊戲庫。`);
      if (r.status !== 200) throw new Error(`查詢失敗（HTTP ${r.status}）。請稍後手動重試。`);
      const data = await r.json();
      if (data.errors?.length) throw new Error('官方 GraphQL 回報錯誤；查詢可能已變更或授權失效。');
      let result; resolvePage(data, value => { result = value; }); return result;
    } catch (e) {
      if (controller.signal.aborted) throw new Error(timedOut ? '查詢逾時，請手動重試。' : '已停止同步。');
      if (e instanceof TypeError) throw new Error('網頁原生查詢連線失敗，可能為網路或 CORS 限制。請回報此提示。');
      throw e;
    } finally { clearTimeout(timer); if (pending === controller) pending = null; }
  }

  function resolvePage(data, resolve) {
    const page = data?.data?.purchasedTitlesRetrieve;
    if (!page || !Array.isArray(page.games)) throw new Error('無法辨識官方遊戲庫格式，沒有當成空遊戲庫。');
    for (const g of page.games) {
      if (!g || typeof g.name !== 'string' || typeof g.entitlementId !== 'string' || !g.entitlementId) throw new Error('遊戲授權資料格式已變更。');
    }
    resolve(page);
  }

  function nextOffset(page, offset, size) {
    const p = page.pageInfo;
    if (p) {
      if (typeof p.isLast !== 'boolean' || p.offset !== offset || !Number.isSafeInteger(p.size) || p.size < 0 || !Number.isSafeInteger(p.totalCount) || p.totalCount < 0) throw new Error('官方分頁資訊不正確。');
      if (p.isLast) return null;
      const next = p.offset + p.size;
      if (!page.games.length || next <= offset || next >= p.totalCount) throw new Error('官方分頁未前進，已停止。');
      return next;
    }
    return page.games.length < size ? null : offset + page.games.length;
  }

  async function sync() {
    if (busy) return;
    if (!queryHash) { message = '尚未取得官方查詢碼。請在官方遊戲庫登入，切到其他分類再切回「已購買」。仍無反應時重新整理該頁。'; render(); return; }
    busy = true; complete = false; syncedAt = ''; games = [];
    const run = ++generation, token = authorization, hash = queryHash;
    const seen = new Map(); let offset = 0;
    try {
      for (let count = 0; count < 1000; count++) {
        if (run !== generation) throw new Error('已停止同步。');
        message = `同步中：已讀取 ${games.length} 筆授權，起點 ${offset}…`; render();
        const url = new URL(ENDPOINT);
        url.searchParams.set('operationName', OPERATION);
        url.searchParams.set('variables', JSON.stringify({ isActive: true, platform: ['ps4', 'ps5'], size: 100, start: offset, sortBy: 'ACTIVE_DATE', sortDirection: 'desc' }));
        url.searchParams.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }));
        const page = await request(url.href, token);
        if (run !== generation) throw new Error('登入授權已變更或同步已停止，請重新同步。');
        const next = nextOffset(page, offset, 100);
        let added = 0;
        for (const game of page.games) {
          if (!seen.has(game.entitlementId)) added++;
          seen.set(game.entitlementId, normalize(game));
        }
        games = [...seen.values()];
        if (next === null) {
          complete = true; syncedAt = new Date().toISOString();
          message = `同步完成：${games.length} 筆有效數位授權（不是付款紀錄）。`; break;
        }
        if (!added) throw new Error('官方重複回傳同一批授權，已停止，結果尚未完整。');
        offset = next;
        if (count === 999) throw new Error('已達分頁上限，結果尚未完整。');
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    } catch (e) { message = `${e.message} 目前 ${games.length} 筆為部分結果。`; }
    finally {
      busy = false; render();
      if (complete) sendBridge('PSGB_RESULT', {payload:{schemaVersion:1, scope:'active-ps4-ps5-digital-entitlements', complete, syncedAt, games}});
      else sendBridge('PSGB_STATUS', {message:'官方同步未完整完成，請查看官方分頁提示；可手動重試或匯出部分 JSON。'});
    }
  }

  function normalize(g) {
    const out = {};
    for (const key of ['name', 'platform', 'productId', 'titleId', 'entitlementId', 'conceptId', 'membership']) {
      if (typeof g[key] === 'string') out[key] = g[key];
    }
    for (const key of ['isActive', 'isDownloadable', 'isPreOrder']) if (typeof g[key] === 'boolean') out[key] = g[key];
    if (typeof g.image?.url === 'string' && /^https:\/\//i.test(g.image.url)) out.imageUrl = g.image.url;
    return out;
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
  function exportTimestamp(date=new Date()){
    const pad=value=>String(value).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  }
  function exportData(format) {
    if (!games.length || busy) return;
    const fields = ['name', 'platform', 'membership', 'productId', 'titleId', 'entitlementId', 'isActive', 'isDownloadable', 'isPreOrder'];
    const body = format === 'json'
      ? JSON.stringify({ schemaVersion: 1, scope: 'active-ps4-ps5-digital-entitlements', complete, syncedAt: syncedAt || null, exportedAt: new Date().toISOString(), games }, null, 2)
      : '\uFEFF' + [['complete', 'syncedAt', ...fields], ...games.map(g => [complete, syncedAt, ...fields.map(k => g[k])])].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `ps-game-base-${complete ? 'complete' : 'partial'}-${exportTimestamp()}.${format}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function el(tag, text, parent) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; parent?.append(node); return node; }
  function render() {
    if (!root) return;
    root.querySelector('#status').textContent = message;
    root.querySelector('#diagnostics').textContent = `v0.4.5 · fetch ${diagnostics.fetch} / XHR ${diagnostics.xhr} / GraphQL ${diagnostics.graphql} / 已購買 ${diagnostics.purchased} / 無 Bearer ${diagnostics.noBearer} / 缺查詢碼 ${diagnostics.noHash} / 格式錯誤 ${diagnostics.parseError} · 操作：${[...operations].join(', ') || '尚未辨識'}${lastParseError ? ` · 最近解析失敗：${lastParseError}` : ''}`;
    root.querySelector('#sync').disabled = busy || !queryHash;
    root.querySelector('#stop').disabled = !busy;
    for (const button of root.querySelectorAll('[data-export]')) button.disabled = busy || !games.length;
    const search = root.querySelector('#search').value.trim().toLocaleLowerCase();
    const platform = root.querySelector('#platform').value, membership = root.querySelector('#membership').value;
    const filtered = games.filter(g => (!search || g.name.toLocaleLowerCase().includes(search)) && (!platform || g.platform?.toUpperCase() === platform) && (!membership || g.membership === membership)).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    root.querySelector('#count').textContent = `顯示 ${filtered.length} / ${games.length} 筆授權${complete ? '（完整）' : '（尚未完整）'}；匯出包含全部已讀取授權。`;
    const list = root.querySelector('#list'); list.replaceChildren();
    // Render a bounded list; search/filter still apply to every fetched entitlement.
    for (const g of filtered.slice(0, 200)) {
      const row = el('article', undefined, list);
      if (g.imageUrl) { const img = el('img', undefined, row); img.src = g.imageUrl; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; }
      const details = el('div', undefined, row);
      el('strong', g.name, details);
      el('p', `${g.platform || '平台未提供'} · ${g.membership === 'PS_PLUS' ? 'PS Plus 授權' : g.membership === 'NONE' ? '非 PS Plus（可能包含免費）' : '來源未分類'}${g.isPreOrder ? ' · 預購' : ''}`, details);
      el('small', g.productId || g.titleId || '商品 ID 未提供', details);
      if (/^[A-Z0-9_-]+$/i.test(g.productId || '')) {
        const a = el('a', '查看商店', details); a.href = `https://store.playstation.com/zh-hant-tw/product/${encodeURIComponent(g.productId)}`; a.target = '_blank'; a.rel = 'noopener noreferrer';
      }
    }
    if (filtered.length > 200) el('p', '目前呈現前 200 筆，請搜尋或篩選；匯出不受此上限影響。', list);
  }
  function mount() {
    host = document.createElement('div'); host.id = 'ps-game-base'; document.documentElement.append(host);
    root = host.attachShadow({ mode: 'closed' });
    const style = el('style', undefined, root);
    style.textContent = ':host{all:initial;color-scheme:dark;font:14px/1.6 system-ui;color:#eef3ff}button,input,select{font:inherit;padding:7px 10px;border:1px solid #586680;border-radius:7px;color:#eef3ff;background:#24324c}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}#launch{position:fixed;right:20px;bottom:20px;z-index:2147483646;background:#164ca5}#panel{position:fixed;right:16px;bottom:72px;z-index:2147483647;width:min(760px,calc(100vw - 32px));max-height:80vh;overflow:auto;background:#121e33;border:1px solid #60789d;border-radius:14px;padding:18px;box-sizing:border-box;box-shadow:0 10px 60px #0008}#panel[hidden]{display:none}h2{margin:0 0 8px}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#status{white-space:pre-wrap;color:#bcd3ff}article{display:flex;gap:12px;border-top:1px solid #34425b;padding:12px 0}article img{width:62px;height:62px;object-fit:cover}p{margin:4px 0}small{display:block;overflow-wrap:anywhere;color:#aab9d2}a{color:#8fc5ff}input{min-width:150px;flex:1}';
    const launch = el('button', 'PS Game Base', root); launch.id = 'launch';
    const panel = el('section', undefined, root); panel.id = 'panel'; panel.hidden = true; panel.setAttribute('aria-label', 'PS Game Base 遊戲庫');
    launch.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) psgbTools.hideTrophies?.(); render(); };
    el('h2', 'PS Game Base · 遊戲庫 v0.4.5', panel);
    if (bridge) el('p', `由 ${bridge.origin} 開啟：完整同步後，遊戲資料將自動回傳該管理頁供確認。登入憑證不會回傳。`, panel);
    el('p', '僅查詢有效的 PS4／PS5 數位授權，包含免費與 PS Plus。未包含付款紀錄、實體收藏及遊玩時數。權杖與資料僅暫存本分頁，重新整理即清除。', panel);
    const library = el('a', '開啟官方遊戲庫（登入後選「已購買」）', panel); library.href = LIBRARY; library.target = '_blank'; library.rel = 'noopener noreferrer';
    const status = el('p', message, panel); status.id = 'status'; status.setAttribute('role', 'status');
    el('small', undefined, panel).id = 'diagnostics';
    const controls = el('div', undefined, panel); controls.className = 'controls';
    const syncButton = el('button', '同步遊戲庫', controls); syncButton.id = 'sync'; syncButton.onclick = sync;
    const stop = el('button', '停止', controls); stop.id = 'stop'; stop.onclick = () => { generation++; pending?.abort(); };
    for (const format of ['json', 'csv']) { const b = el('button', `匯出 ${format.toUpperCase()}`, controls); b.dataset.export = format; b.onclick = () => exportData(format); }
    if (location.hostname === 'library.playstation.com') {
      const research = el('button', '獎盃研究工具', controls);
      research.onclick = () => { panel.hidden = true; psgbTools.openTrophies?.(() => { panel.hidden = false; render(); }); };
    }
    const clear = el('button', '清除本分頁資料', controls); clear.onclick = () => { generation++; pending?.abort(); authorization = ''; queryHash = ''; games = []; complete = false; syncedAt = ''; message = '已清除。請切換官方分類再回「已購買」以重新取得授權。'; render(); };
    const filters = el('div', undefined, panel); filters.className = 'controls';
    const search = el('input', undefined, filters); search.id = 'search'; search.placeholder = '搜尋遊戲名稱'; search.setAttribute('aria-label', '搜尋遊戲名稱'); search.oninput = render;
    for (const [id, options] of [['platform', [['', '全部平台'], ['PS4', 'PS4'], ['PS5', 'PS5']]], ['membership', [['', '全部來源'], ['PS_PLUS', 'PS Plus'], ['NONE', '非 PS Plus']]]]) {
      const select = el('select', undefined, filters); select.id = id; select.setAttribute('aria-label', id === 'platform' ? '平台' : '授權來源');
      for (const [value, label] of options) { const option = el('option', label, select); option.value = value; }
      select.onchange = render;
    }
    el('p', undefined, panel).id = 'count'; el('div', undefined, panel).id = 'list';
    render();
    document.addEventListener('keydown', event => { if (event.key === 'Escape') panel.hidden = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();

// PSGB_LIBRARY_END
// PSGB_TROPHY_START
// Protocol references (community maintained, not a Sony public API contract):
// https://psn-api.achievements.app/api-docs/user-trophies
// https://psn-api.achievements.app/api-docs/title-trophies
// https://psn-api.achievements.app/authentication/authenticating-manually
// OAuth public application parameters documented by achievements-app/psn-api.
(() => {
 'use strict';
 const BASE='https://m.np.playstation.com/api/trophy/v1';
 const AUTH='https://ca.account.sony.com/api/authz/v3/oauth';
 const LOCAL='http://127.0.0.1:4176';
 const REDIRECT='com.scee.psxandroid.scecompcall://redirect';
 const CLIENT='09515159-7237-4370-9b40-3806e67c0891';
 const CLIENT_AUTH='Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
 const page=typeof unsafeWindow==='undefined'?window:unsafeWindow;
 if(location.hostname && location.hostname!=='library.playstation.com')return;
 let managerBridge=null,platinumStarted=false,platinumRunning=false;
 try{
  const params=new URLSearchParams(location.hash?.slice(1)||''),origin=params.get('psgbPlatinumOrigin'),session=params.get('psgbPlatinumSession');
  if(['http://127.0.0.1:4175','http://localhost:4175','https://promise82114.github.io'].includes(origin)&&/^[a-f0-9-]{36}$/i.test(session||'')&&page.opener)managerBridge={origin,session};
 }catch{}
 function sendPlatinum(type,data={}){try{if(managerBridge)page.opener?.postMessage({type,session:managerBridge.session,...data},managerBridge.origin);}catch{}}
 let token='',expires=0,busy=false,result=null,root,host,selected=new Set(),samples=new Map();
 let message='請登入官方遊戲庫並切到「已購買」。也可載入原腳本匯出的遊戲庫 JSON。';
 const handles=new Set();let requests=[],authRequests=[],generation=0;
 const capture={fetchHook:'pending',xhrHook:'pending',jsonHook:'pending',textHook:'pending',fetch:0,xhr:0,graphql:0,readerReads:0,decodedResponses:0,unrecognizedResponses:0,purchasedResponses:0,gameRows:0,parseErrors:0,lastStatus:null};
 const captureFailures=[];
 const grades=['bronze','silver','gold','platinum'];
 function counts(value){
  if(!value||grades.some(k=>!Number.isSafeInteger(value[k])||value[k]<0))return null;
  return Object.fromEntries(grades.map(k=>[k,value[k]]));
 }
 function summarize(t){
  const defined=counts(t.definedTrophies),earned=counts(t.earnedTrophies);
  return {npCommunicationId:typeof t.npCommunicationId==='string'?t.npCommunicationId:null,
   npServiceName:['trophy','trophy2'].includes(t.npServiceName)?t.npServiceName:null,
   name:typeof t.trophyTitleName==='string'?t.trophyTitleName:null,
   platform:typeof t.trophyTitlePlatform==='string'?t.trophyTitlePlatform:null,
   trophySetVersion:typeof t.trophySetVersion==='string'?t.trophySetVersion:null,
   definedTrophies:defined,totalTrophies:defined?grades.reduce((n,k)=>n+defined[k],0):null,
   hasPlatinum:defined?defined.platinum>0:null,earnedTrophies:earned,
   earnedCount:earned?grades.reduce((n,k)=>n+earned[k],0):null,
   platinumEarned:earned?earned.platinum>0:null,
   progress:typeof t.progress==='number'&&t.progress>=0&&t.progress<=100?t.progress:null,
   lastUpdatedDateTime:typeof t.lastUpdatedDateTime==='string'?t.lastUpdatedDateTime:null};
 }
 function sampleGames(input){
  const games=input?.library?.games||input?.games||(['ps-game-base-trophy-probe','ps-game-base-trophy-benchmark'].includes(input?.kind)?input.samples:null);
  if(!Array.isArray(games))throw Error('找不到遊戲陣列。請選遊戲庫 JSON、完整備份或先前測試 JSON。');
  const out=new Map();
  for(const g of games){
   if(typeof g?.titleId!=='string'||!(/^(CUSA|PPSA)\d{5}_\d{2}$/i.test(g.titleId)))continue;
   const id=g.titleId.toUpperCase();if(!out.has(id))out.set(id,{titleId:id,name:typeof g.name==='string'?g.name:id,platform:typeof g.platform==='string'?g.platform:null});
  }
  return [...out.values()];
 }
 function libraryResponse(data){
  if(Array.isArray(data)){for(const item of data)libraryResponse(item);return;}
  const games=data?.data?.purchasedTitlesRetrieve?.games;if(!Array.isArray(games))return;
  capture.purchasedResponses++;capture.gameRows+=games.length;
  const list=sampleGames({games});for(const g of list)if(samples.size<200)samples.set(g.titleId,g);
  if(!selected.size)for(const g of list.slice(0,5))selected.add(g.titleId);
  if(!busy){message=list.length?`已取得 ${samples.size} 個可測試版本，請選最多 5 個；不會自動查獎盃。`:`收到 ${games.length} 筆遊戲，但沒有符合格式的 PS4／PS5 titleId。可載入既有遊戲庫 JSON。`;render();}
 }
 function isLibrary(raw){try{const u=new URL(String(raw),location.href);return u.origin==='https://web.np.playstation.com'&&u.pathname==='/api/graphql/v1/op';}catch{return false;}}
 function requestUrl(input){if(typeof input==='string')return input;if(typeof input?.url==='string')return input.url;if(typeof input?.href==='string')return input.href;return '';}
 function updateCapture(){const n=root?.getElementById('capture'),last=captureFailures.at(-1);if(n)n.textContent=`攔截：Fetch ${capture.fetchHook} / XHR ${capture.xhrHook}；讀取器 JSON ${capture.jsonHook} / Text ${capture.textHook}；請求 ${capture.fetch} / ${capture.xhr}；GraphQL ${capture.graphql}；已解碼 ${capture.decodedResponses}；已購買回應 ${capture.purchasedResponses}；原始遊戲 ${capture.gameRows}；候選 ${samples.size}；解析錯誤 ${capture.parseErrors}${capture.lastStatus!==null?'；HTTP '+capture.lastStatus:''}${last?'；最近錯誤 '+last.stage+' / '+last.errorName+' / '+last.reason:''}。`;
 }
 function responseMeta(response){
  const meta={};try{meta.bodyUsed=!!response.bodyUsed;const type=response.headers?.get('content-type')||'';meta.contentType=type.includes('json')?'json':type.includes('html')?'html':type.includes('text')?'text':'unknown';}catch{}
  return meta;
 }
 function captureFailure(stage,error,meta={}){
  const name=['TypeError','SyntaxError','SecurityError','InvalidStateError','ReferenceError','RangeError','Error'].includes(error?.name)?error.name:'unknown';
  const message=typeof error?.message==='string'?error.message.toLowerCase():'';
  const reason=meta.bodyUsed&&stage==='fetch-clone'?'body-already-used':message.includes('illegal invocation')?'illegal-invocation':message.includes('permission')||message.includes('denied')?'access-denied':message.includes('not a function')?'method-unavailable':name==='SyntaxError'?'invalid-json':'unclassified';
  capture.parseErrors++;captureFailures.push({stage,errorName:name,reason,...meta});if(captureFailures.length>10)captureFailures.shift();updateCapture();
 }
 function decodeResponse(value,meta={}){
  let data=value;
  if(typeof value==='string'){
   try{data=JSON.parse(value.replace(/^\uFEFF/,''));}catch(e){captureFailure('parse-json',e,{...meta,bodyLength:value.length,bodyKind:/^\s*</.test(value)?'html':value.trim()?'other':'empty'});return;}
  }
  capture.decodedResponses++;const before=capture.purchasedResponses;
  try{libraryResponse(data);if(capture.purchasedResponses===before)capture.unrecognizedResponses++;}catch(e){captureFailure('process-library',e,meta);}
  updateCapture();
 }
 // Observe the page's own body reader when available. Cloning an already-read
 // Response fails; this also avoids consuming any extra response body stream.
 for(const method of ['json','text']){
  try{
   const proto=page.Response?.prototype,original=proto?.[method];if(typeof original!=='function'){capture[method+'Hook']='unavailable';continue;}
   const wrapped=function(){
    const response=Reflect.apply(original,this,arguments);
    try{if(isLibrary(this.url)){capture.readerReads++;const meta=responseMeta(this);response.then(value=>decodeResponse(value,meta)).catch(e=>captureFailure('reader-'+method,e,meta));}}catch(e){captureFailure('reader-observe',e);}
    return response;
   };
   proto[method]=wrapped;capture[method+'Hook']=proto[method]===wrapped?'installed':'unavailable';
  }catch{capture[method+'Hook']='failed';}
 }
 async function observeFetch(response){
  capture.lastStatus=response.status??null;const meta=responseMeta(response);
  if(capture.jsonHook==='installed'&&capture.textHook==='installed'){updateCapture();return;}
  let clone;try{clone=response.clone();}catch(e){captureFailure('fetch-clone',e,meta);return;}
  let value;try{value=await (typeof clone.text==='function'?clone.text():clone.json());}catch(e){captureFailure('fetch-read',e,meta);return;}
  decodeResponse(value,meta);
 }
 // Observe responses only. No header interception or browser credential export.
 try{
  const originalFetch=page.fetch;
  if(typeof originalFetch!=='function')throw Error('Fetch unavailable');
  const wrapped=function(input,init){
   const response=Reflect.apply(originalFetch,this,arguments);capture.fetch++;
   if(isLibrary(requestUrl(input))){capture.graphql++;response.then(observeFetch).catch(e=>captureFailure('fetch-response',e));}
   updateCapture();return response;
  };
  page.fetch=wrapped;capture.fetchHook=page.fetch===wrapped?'installed':'unavailable';
 }catch{capture.fetchHook='failed';}
 try{
  const proto=page.XMLHttpRequest.prototype,originalOpen=proto.open,originalSend=proto.send,urls=new WeakMap();
  const open=function(method,url){urls.set(this,isLibrary(url));return Reflect.apply(originalOpen,this,arguments);};
  const send=function(){capture.xhr++;if(urls.get(this)){capture.graphql++;this.addEventListener('load',()=>{try{capture.lastStatus=this.status??null;decodeResponse(this.responseType==='json'?this.response:this.responseText,{responseType:['json','text',''].includes(this.responseType)?this.responseType:'other'});}catch(e){captureFailure('xhr-read',e);}updateCapture();},{once:true});}updateCapture();return Reflect.apply(originalSend,this,arguments);};
  proto.open=open;proto.send=send;capture.xhrHook=proto.open===open&&proto.send===send?'installed':'unavailable';
 }catch{capture.xhrHook='failed';}
 function accessCode(response){
  const location=/^location:\s*(.+)$/im.exec(response?.responseHeaders||'')?.[1]?.trim();
  for(const [source,target] of [['location',location],['final-url',response?.finalUrl]]){
   if(typeof target!=='string')continue;
   try{
    const u=new URL(target),expected=new URL(REDIRECT);
    if(u.protocol!==expected.protocol||u.host!==expected.host||!['','/'].includes(u.pathname)||u.username||u.password||u.hash||u.searchParams.has('error'))continue;
    const values=u.searchParams.getAll('code');if(values.length===1&&/^[A-Za-z0-9._~-]{1,4096}$/.test(values[0]))return {code:values[0],source};
   }catch{}
  }
  return null;
 }
 function request(url,options={}){
  const u=new URL(url);
  if(options.cookie!==undefined&&(u.origin!=='https://ca.account.sony.com'||!(u.pathname==='/api/authz/v3/oauth/authorize'||u.pathname==='/api/v1/ssocookie'&&options.anonymous===true)||options.redirect!=='manual'||!/^npsso=[A-Za-z0-9_-]{64}$/.test(options.cookie)))throw Error('拒絕向非預期的授權端點傳送 Sony 登入資料。');
  const local=u.origin===LOCAL&&['/session','/authorize'].includes(u.pathname);
  if(!local&&!((u.origin==='https://ca.account.sony.com'&&(u.pathname==='/api/v1/ssocookie'||u.pathname.startsWith('/api/authz/v3/oauth/')))||(u.origin==='https://m.np.playstation.com'&&u.pathname.startsWith('/api/trophy/v1/'))))throw Error('測試腳本拒絕非預期的請求目的地。');
  const start=Date.now(),isAuth=local||u.origin==='https://ca.account.sony.com',path=u.pathname;
  const stage=local?(path==='/session'?'local-session':'local-access-token'):path==='/api/v1/ssocookie'?'sony-session':path.endsWith('/authorize')?'sony-access-code':path.endsWith('/token')?'sony-access-token':'trophy';
  const stageLabel={'local-session':'本機助手連線','local-access-token':'本機助手授權','sony-session':'Sony 登入工作階段','sony-access-code':'Sony 授權碼','sony-access-token':'Sony 獎盃權杖',trophy:'獎盃 API'}[stage];
  return new Promise((resolve,reject)=>{
   let handle,finished=false;
   const finish=(response,outcome='http')=>{
    if(finished)return;finished=true;clearTimeout(timer);handles.delete(handle);
    const entry={stage,host:u.hostname,path,method:options.method||'GET',transport:options.redirect==='manual'?'manual-redirect':options.fetch?'fetch':options.anonymous?'anonymous':'default',outcome,status:Number.isInteger(response?.status)?response.status:null,elapsedMs:Date.now()-start};
    if(isAuth){
     entry.explicitSessionCookie=typeof options.cookie==='string';
     entry.anonymous=options.anonymous===true;
     if(stage==='sony-access-token'){
      const grant=new URLSearchParams(typeof options.data==='string'?options.data:'').get('grant_type');
      entry.grantType=['sso_token','authorization_code'].includes(grant)?grant:'other';
      if(outcome==='http'&&response?.status!==200){try{const code=JSON.parse(response.responseText).error;entry.oauthError=['invalid_grant','unauthorized_client','unsupported_grant_type','invalid_client','invalid_request','invalid_scope','access_denied','server_error','temporarily_unavailable'].includes(code)?code:'other';}catch{entry.oauthError='other';}}
     }
     const target=/^location:\s*(.+)$/im.exec(response?.responseHeaders||'')?.[1]?.trim();
     entry.hasRedirect=!!target;entry.redirectTarget=target?.startsWith(REDIRECT)?'psn-app':target?.startsWith('https://ca.account.sony.com/')||target?.startsWith('https://my.account.sony.com/')?'sony-web':target?'other':'none';
     const code=stage==='sony-access-code'?accessCode(response):null;
     entry.hasAccessCode=!!code;entry.codeSource=code?.source||null;
     const hint=String(response?.statusText||'')+' '+String(response?.error||'');
     entry.networkReason=hint.includes('ERR_CERT_')?'certificate-error':hint.includes('ERR_UNKNOWN_URL_SCHEME')||hint.includes('ERR_UNSAFE_REDIRECT')?'unsupported-redirect':/failed to fetch/i.test(hint)?'failed-to-fetch':outcome==='network'?'unknown':null;
     if(local&&response?.status!==200){try{const code=JSON.parse(response?.responseText||'').error;entry.helperError=['access_code','token','network','host','origin','client','route','content_type','size','json','nonce','session','busy','rate'].includes(code)?code:'unknown';}catch{entry.helperError='unknown';}}
     authRequests.push(entry);
    }else requests.push(entry);
    if(outcome==='http'||(outcome==='network'&&stage==='sony-access-code'&&accessCode(response)))resolve(response);
    else reject(Error(`${stageLabel}：${{network:'連線未完成，尚不能區分網路或 Tampermonkey 權限問題',timeout:'請求逾時',aborted:'已停止',exception:'Tampermonkey 無法啟動請求'}[outcome]}。請查看 authRequests／requests 診斷。`));
   };
   const timer=setTimeout(()=>{finish(null,'timeout');handle?.abort();},20000);
   try{handle=GM_xmlhttpRequest({method:'GET',url,...options,
    onload:r=>finish(r),onerror:r=>finish(r,'network'),ontimeout:r=>finish(r,'timeout'),onabort:r=>finish(r,'aborted')});}
   catch{finish(null,'exception');}
   if(!finished)handles.add(handle);
  });
 }
 function json(response,stage){
  if(response.status!==200)throw Error(`${stage}失敗（HTTP ${response.status}）；沒有當成無獎盃。`);
  try{return JSON.parse(response.responseText);}catch{throw Error(`${stage}回傳非 JSON；沒有當成空結果。`);}
 }
 async function authorize(run,mode='browser'){
  if(token&&Date.now()<expires)return;
  message='正在使用此 Chrome 的 Sony 登入工作階段取得暫存授權…';render();
  const cookie=json(await request('https://ca.account.sony.com/api/v1/ssocookie'),'Sony 登入');
  if(run!==generation)throw Error('已停止。');
  if(typeof cookie?.npsso!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(cookie.npsso))throw Error('沒有可用的 Sony 登入。請先在同一個 Chrome 登入 PlayStation，再重試。');
  if(result?.authMethod==='browser-sso-token')result.sessionReadVerified=true;
  let auth;
  if(mode==='browser-sso-token'){
   // Documented by andshrew/PlayStation-Stars: direct grant avoids app redirects.
   message='直接向 Sony 交換暫存獎盃權杖，不經過 App 授權碼轉址…';render();
   const payload=new URLSearchParams({grant_type:'sso_token',npsso:cookie.npsso,scope:'psn:mobile.v2.core psn:clientapp',token_format:'jwt'});
   const response=await request(AUTH+'/token',{method:'POST',anonymous:true,redirect:'manual',headers:{Authorization:CLIENT_AUTH,'Content-Type':'application/x-www-form-urlencoded'},data:payload.toString()});
   if(run!==generation)throw Error('已停止。');
   if(response.status!==200){
    const explanation={invalid_grant:'Sony 未接受本次登入授權',unauthorized_client:'Sony 未允許此客戶端直接交換',unsupported_grant_type:'Sony 未接受此直接交換方式',invalid_client:'Sony 未接受客戶端識別',invalid_request:'Sony 未接受交換參數',invalid_scope:'Sony 未接受要求的權限'}[authRequests.at(-1)?.oauthError]||'未取得有效授權';
    throw Error(`Sony 直接權杖交換失敗（HTTP ${response.status}）：${explanation}。未重試。`);
   }
   auth=json(response,'Sony 直接權杖交換');
  }else if(mode==='helper'){
   message='正在使用此電腦的 127.0.0.1 本機助手交換授權；不保存憑證…';render();
   const headers={'X-PSGB-Client':'trophy-probe'};
   const session=json(await request(LOCAL+'/session',{headers}),'本機助手連線');
   if(run!==generation)throw Error('已停止。');
   if(session.kind!=='ps-game-base-local-trophy-auth'||typeof session.nonce!=='string'||!/^[a-f0-9]{48}$/.test(session.nonce))throw Error('本機助手工作階段格式不符，未傳送 Sony 登入資料。');
   const value=json(await request(LOCAL+'/authorize',{method:'POST',headers:{...headers,'Content-Type':'application/json'},data:JSON.stringify({nonce:session.nonce,npsso:cookie.npsso})}),'本機助手授權');
   auth={access_token:value.accessToken,expires_in:value.expiresIn};
  }else{
  const isolated=mode==='browser-isolated';
  if(isolated){
   // TM maintainer recommendation: anonymous excludes the ambient cookie jar.
   // Verify the one explicitly supplied NPSSO with Sony before testing OAuth.
   message='驗證只帶本次登入 Cookie 的 Sony 工作階段…';render();
   const verified=json(await request('https://ca.account.sony.com/api/v1/ssocookie',{redirect:'manual',anonymous:true,cookie:'npsso='+cookie.npsso}),'獨立 Cookie 驗證');
   if(run!==generation)throw Error('已停止。');
   if(verified?.npsso!==cookie.npsso)throw Error('獨立 Cookie 驗證未通過；未繼續授權或查詢獎盃。');
   if(result?.authMethod==='browser-isolated-cookie')result.sessionCookieVerified=true;
  }
  const params=new URLSearchParams({access_type:'offline',client_id:CLIENT,redirect_uri:REDIRECT,response_type:'code',scope:'psn:mobile.v2.core psn:clientapp'});
  // Explicit GM cookie option bridges the XHR session read and fetch-mode manual redirect.
  // Only Sony receives this credential; never follow the app URI.
  message=isolated?'以獨立 Cookie 測試 Sony 授權碼回傳…':'正在取得 Sony 授權碼…';render();
  const response=await request(AUTH+'/authorize?'+params,{redirect:'manual',cookie:'npsso='+cookie.npsso,...(isolated?{anonymous:true}:{})});
  if(run!==generation)throw Error('已停止。');
  const accepted=accessCode(response);
  if(!accepted)throw Error('Sony 未回傳可驗證的授權碼；可能需要重新登入，或 Tampermonkey 未提供重新導向資訊。未匯出授權內容。');
  const {code}=accepted;
  const payload=new URLSearchParams({code,redirect_uri:REDIRECT,grant_type:'authorization_code',token_format:'jwt'});
  auth=json(await request(AUTH+'/token',{method:'POST',redirect:'manual',...(isolated?{anonymous:true}:{}),headers:{Authorization:CLIENT_AUTH,'Content-Type':'application/x-www-form-urlencoded'},data:payload.toString()}),'獎盃授權');
  }
  if(run!==generation)throw Error('已停止。');
  if(typeof auth?.access_token!=='string'||!Number.isFinite(Number(auth.expires_in))||Number(auth.expires_in)<=0)throw Error('Sony 授權格式不正確。');
  token=auth.access_token;expires=Date.now()+Math.max(0,Number(auth.expires_in)-60)*1000;
  if(result?.authMethod==='browser-sso-token')result.tokenExchangeVerified=true;
  // NPSSO, access code and refresh token are never displayed or persisted.
 }
 async function trophyRequest(path,run){
  if(run!==generation)throw Error('已停止。');
  const r=await request(BASE+path,{anonymous:true,headers:{Authorization:'Bearer '+token,'Accept-Language':'zh-Hant-TW'}});
  if(r.status===401||r.status===403){token='';expires=0;throw Error(`獎盃 API 無有效授權（HTTP ${r.status}）。請重新登入後再測試。`);}
  return json(r,'獎盃查詢');
 }
 function benchmarkSnapshot(data,ids){
  if(!Array.isArray(data?.titles))throw Error('獎盃效能回應格式不正確。');
  const found=new Map();
  for(const entry of data.titles){
   if(!ids.includes(entry?.npTitleId)||!Array.isArray(entry.trophyTitles)||found.has(entry.npTitleId))throw Error('獎盃效能回應格式不正確。');
   const sets=entry.trophyTitles.map(t=>{
    if(!/^NPWR\d+_\d{2}$/.test(t?.npCommunicationId||'')||!['trophy','trophy2'].includes(t.npServiceName))throw Error('獎盃效能回應缺少可比較的獎盃組。');
    const platinum=t?.earnedTrophies?.platinum;
    return [t.npServiceName,t.npCommunicationId,Number.isSafeInteger(platinum)&&platinum>=0?platinum:null];
   }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   found.set(entry.npTitleId,{present:true,matched:sets.length>0,signature:JSON.stringify(sets)});
  }
  return new Map(ids.map(id=>[id,found.get(id)||{present:false,matched:false,signature:'absent'}]));
 }
 async function benchmarkProfile(ids,spec,run,control){
  const batches=[];for(let offset=0;offset<ids.length;offset+=spec.batchSize)batches.push(ids.slice(offset,offset+spec.batchSize));
  const rows=[],snapshots=new Map(),start=Date.now();let cursor=0,inFlight=0,maxInFlight=0,halt=false;
  async function worker(){
   while(!halt&&!control.reason&&run===generation&&cursor<batches.length){
    const batch=batches[cursor++],entry={requestedCount:batch.length,status:null,outcome:'pending',elapsedMs:0,returnedCount:0,matchedCount:0},began=Date.now();rows.push(entry);
    inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
    try{
     const params=new URLSearchParams({npTitleIds:batch.join(','),includeNotEarnedTrophyIds:'false'});
     const response=await request(BASE+'/users/me/titles/trophyTitles?'+params,{anonymous:true,headers:{Authorization:'Bearer '+token}});
     entry.status=response.status;entry.outcome='http';
     if([401,403,429].includes(response.status)){
      control.reason=response.status===429?'rate-limit':'auth';halt=true;token='';expires=0;
      const retry=/^retry-after:\s*(\d{1,6})\s*$/im.exec(response.responseHeaders||'');if(retry)entry.retryAfterSeconds=Number(retry[1]);
     }
     if(response.status!==200){halt=true;continue;}
     try{
      const values=benchmarkSnapshot(json(response,'效能查詢'),batch);
      for(const [id,value] of values)snapshots.set(id,value);
      entry.returnedCount=[...values.values()].filter(v=>v.present).length;entry.matchedCount=[...values.values()].filter(v=>v.matched).length;
      entry.valid=true;
     }catch{entry.outcome='invalid-response';halt=true;}
    }catch{entry.outcome=run===generation?'network':'cancelled';control.reason=entry.outcome;halt=true;}
    finally{entry.elapsedMs=Math.max(0,Date.now()-began);inFlight--;}
    if(!halt&&!control.reason&&run===generation&&cursor<batches.length&&spec.intervalMs)await new Promise(resolve=>setTimeout(resolve,spec.intervalMs));
   }
  }
  await Promise.all(Array.from({length:spec.concurrency},worker));
  const elapsedMs=Math.max(0,Date.now()-start),success=rows.filter(row=>row.status===200&&row.valid),statusCounts={};
  for(const row of rows){const key=row.outcome==='http'?String(row.status):row.outcome;statusCounts[key]=(statusCounts[key]||0)+1;}
  const meanRequestMs=success.length?success.reduce((sum,row)=>sum+row.elapsedMs,0)/success.length:null;
  const complete=run===generation&&!control.reason&&rows.length===batches.length&&success.length===rows.length;
  const totalBatches=Math.ceil(1800/spec.batchSize);
  return {snapshots,summary:{...spec,sampleCount:ids.length,plannedRequests:batches.length,requestCount:rows.length,successCount:success.length,complete,elapsedMs,meanRequestMs,maxInFlight,statusCounts,requests:rows,
   projected1800Ms:complete?Math.round(Math.ceil(totalBatches/spec.concurrency)*meanRequestMs+Math.max(0,Math.ceil(totalBatches/spec.concurrency)-1)*spec.intervalMs):null}};
 }
 function compareBenchmark(actual,baseline,ids){return ids.every(id=>actual.get(id)?.signature===baseline.get(id)?.signature);}
 async function runBenchmark(){
  if(busy||managerBridge)return;
  const chosen=[...samples.values()].slice(0,30);if(chosen.length<15){message='效能測試至少需要 15 個不同版本。請載入遊戲庫 JSON，或在官方已購買頁取得更多候選。';render();return;}
  busy=true;token='';expires=0;requests=[];authRequests=[];const run=++generation,start=Date.now(),ids=chosen.map(g=>g.titleId),control={reason:null};
  result={schemaVersion:1,kind:'ps-game-base-trophy-benchmark',probeVersion:'0.4.5',testedAt:new Date().toISOString(),authMethod:'local-helper',complete:false,samples:chosen,sampleCount:ids.length,projectionTargetVersions:1800,limitTests:[],profiles:[],authRequests,requests};
  try{
   await authorize(run,'helper');
   message=`效能測試：建立 ${ids.length} 個版本的每批 5 個基準（350ms 間隔）…`;render();
   const baseline=await benchmarkProfile(ids,{id:'sequential-350',label:'5 個／循序／間隔 350ms',batchSize:5,concurrency:1,intervalMs:350},run,control);
   baseline.summary.sameResultAsBaseline=baseline.summary.complete;result.profiles.push(baseline.summary);
   if(!baseline.summary.complete)throw Error('每批 5 個的基準未完成，已停止效能測試。');
   result.limitTests.push({requestedCount:5,source:'baseline-first-request',...baseline.summary.requests[0],sameResultAsBaseline:true,verdict:'baseline'});
   for(const count of [10,15]){
    if(run!==generation)throw Error('效能測試已停止。');await new Promise(resolve=>setTimeout(resolve,1000));
    message=`效能測試：單次送 ${count} 個不同版本…`;render();
    const subset=ids.slice(0,count),marker=ids.find(id=>baseline.snapshots.get(id)?.matched);
    // Put a known matched title at the tail so silent truncation is observable.
    if(marker){const position=subset.indexOf(marker);if(position>=0)[subset[position],subset[count-1]]=[subset[count-1],subset[position]];else subset[count-1]=marker;}
    const test=await benchmarkProfile(subset,{batchSize:count,concurrency:1,intervalMs:0},run,control),matches=test.summary.complete&&compareBenchmark(test.snapshots,baseline.snapshots,subset);
    const tailEvidence=from=>subset.slice(from).filter(id=>baseline.snapshots.get(id)?.matched&&test.snapshots.get(id)?.signature===baseline.snapshots.get(id).signature).length;
    const beyondFive=tailEvidence(5),beyondTen=tailEvidence(10);
    result.limitTests.push({requestedCount:count,titleIds:subset,...test.summary.requests[0],sameResultAsBaseline:matches,matchedBeyondFive:beyondFive,matchedBeyondTen:beyondTen,
     verdict:!test.summary.complete?'rejected-or-failed':!matches?'response-differs':!beyondFive||(count===15&&!beyondTen)?'insufficient-tail-evidence':'matches-baseline'});
    if(control.reason)throw Error('授權、連線或限流中止效能測試。');
   }
   for(const spec of [
    {id:'sequential-0',label:'5 個／循序／零間隔',batchSize:5,concurrency:1,intervalMs:0},
    {id:'parallel-2',label:'5 個／2 批並行／零間隔',batchSize:5,concurrency:2,intervalMs:0},
    {id:'parallel-3',label:'5 個／3 批並行／零間隔',batchSize:5,concurrency:3,intervalMs:0}
   ]){
    if(run!==generation)throw Error('效能測試已停止。');await new Promise(resolve=>setTimeout(resolve,1000));
    message='效能測試：'+spec.label+'…';render();
    const profile=await benchmarkProfile(ids,spec,run,control);
    profile.summary.sameResultAsBaseline=profile.summary.complete&&compareBenchmark(profile.snapshots,baseline.snapshots,ids);result.profiles.push(profile.summary);
    if(!profile.summary.complete)throw Error('分批效能測試未完成，已停止後續測試。');
   }
   if(run!==generation)throw Error('效能測試已停止。');
   const candidates=result.profiles.filter(p=>p.complete&&p.sameResultAsBaseline).sort((a,b)=>a.elapsedMs-b.elapsedMs);
   result.fastestMatchingProfile=candidates[0]?.id||null;result.complete=true;
   message='效能測試完成，可匯出結果比較。正式白金同步速度與所有存檔均未變更。';
  }catch{
   const last=authRequests.at(-1);
   result.stopReason=run!==generation?'cancelled':control.reason||(last?.stage==='local-session'&&last.status!==200?'helper':requests.length===0?'auth':'baseline-or-profile-failed');
   message=result.stopReason==='rate-limit'?'Sony 回傳 HTTP 429，已停止，不自動重試；可匯出已完成的部分結果。':result.stopReason==='cancelled'?'效能測試已停止，可匯出部分結果。':result.stopReason==='helper'?'本機獎盃助手未連線，請啟動 node tools/trophy-auth-helper.mjs（15 分鐘後停止接收連線）再重新測試。':'效能測試未完成，請查看診斷並匯出部分結果；未變更分類或存檔。';
  }finally{result.elapsedMs=Math.max(0,Date.now()-start);busy=false;token='';expires=0;render();}
 }
 async function syncPlatinum(titleIds){
  if(busy||platinumStarted)return;
  if(!Array.isArray(titleIds)||!titleIds.length||titleIds.length>20000||titleIds.some(id=>typeof id!=='string'||!/^(CUSA|PPSA)\d{5}_\d{2}$/.test(id))){sendPlatinum('PSGB_PLATINUM_ERROR',{code:'input'});return;}
  platinumStarted=true;platinumRunning=true;busy=true;token='';expires=0;requests=[];authRequests=[];
  const run=++generation,ids=[...new Set(titleIds)],earned=new Set();
  try{
   await authorize(run,'browser-sso-token');
   // Real 2026-10-19 benchmark: 10/15 IDs rejected; two 5-ID workers gave the best measured time.
   let cursor=0,checked=0,failure=null;
   async function worker(){
    while(!failure&&run===generation&&cursor<ids.length){
     const offset=cursor;cursor+=5;
     const batch=ids.slice(offset,offset+5),params=new URLSearchParams({npTitleIds:batch.join(','),includeNotEarnedTrophyIds:'false'});
     try{
      const r=await request(BASE+'/users/me/titles/trophyTitles?'+params,{anonymous:true,headers:{Authorization:'Bearer '+token}});
      if(run!==generation)throw Error('已停止。');
      if(failure)return;
      // Unknown/nonexistent title IDs never remove any local classification.
      if(r.status!==404){
       const data=json(r,'白金查詢');if(!Array.isArray(data.titles))throw Error('白金查詢格式不正確，未套用。');
       for(const entry of data.titles){
        if(!batch.includes(entry?.npTitleId)||!Array.isArray(entry.trophyTitles))continue;
        if(entry.trophyTitles.some(t=>Number.isSafeInteger(t?.earnedTrophies?.platinum)&&t.earnedTrophies.platinum>0))earned.add(entry.npTitleId);
       }
      }
      checked+=batch.length;
      message=`同步白金標記：已檢查 ${checked} / ${ids.length} 個版本（兩批並行）…`;render();
      sendPlatinum('PSGB_PLATINUM_PROGRESS',{checked});
     }catch(e){failure??=e;}
    }
   }
   await Promise.all([worker(),worker()]);
   if(failure)throw failure;
   if(run!==generation)throw Error('已停止。');
   sendPlatinum('PSGB_PLATINUM_RESULT',{complete:true,earnedTitleIds:ids.filter(id=>earned.has(id))});
   message='白金查詢完成，已將確認取得白金的版本回傳遊戲庫；請回管理頁查看儲存結果。';
  }catch(e){
   const code=run!==generation?'cancelled':requests.length===0?'auth':'query';
   sendPlatinum('PSGB_PLATINUM_ERROR',{code});
   message=code==='cancelled'?'已取消白金同步，未變更標記。':e.message+(code==='auth'?' 可匯出授權診斷，不含登入憑證。':'')+' 本次未套用白金標記，請回遊戲庫重新點擊重試。';
  }finally{busy=false;platinumRunning=false;token='';expires=0;render();}
 }
 page.addEventListener?.('message',event=>{
  if(!managerBridge||event.source!==page.opener||event.origin!==managerBridge.origin||event.data?.session!==managerBridge.session)return;
  if(event.data.type==='PSGB_PLATINUM_START')void syncPlatinum(event.data.titleIds);
  if(event.data.type==='PSGB_PLATINUM_CANCEL')stop();
 });
 // Opt-in, bounded transport controls: no OAuth token exchange or trophy request.
 async function runAuthChecks(){
  if(busy)return;
  busy=true;token='';expires=0;requests=[];authRequests=[];const run=++generation;
  result={schemaVersion:1,kind:'ps-game-base-trophy-probe',authMethod:'browser-transport-check',testedAt:new Date().toISOString(),complete:false,samples:[],byTitle:[],catalogExample:null,recentSample:[],checks:[],authRequests,requests,
   manager:typeof GM_info==='object'?{name:GM_info.scriptHandler,version:GM_info.version}:null};
  const sessionUrl='https://ca.account.sony.com/api/v1/ssocookie';
  const params=new URLSearchParams({access_type:'offline',client_id:CLIENT,redirect_uri:REDIRECT,response_type:'code',scope:'psn:mobile.v2.core psn:clientapp'});
  const checks=[
   {id:'session-default',label:'一般請求',url:sessionUrl,options:{}},
   {id:'session-fetch',label:'Fetch 請求',url:sessionUrl,options:{fetch:true}},
   {id:'session-manual',label:'手動重新導向請求',url:sessionUrl,options:{redirect:'manual'}},
   {id:'authorize-anonymous',label:'不帶登入資料的授權對照',url:AUTH+'/authorize?'+params,options:{redirect:'manual',anonymous:true}}
  ];
  try{
   for(const check of checks){
    if(run!==generation)throw Error('cancelled');
    message=`瀏覽器連線檢查 ${result.checks.length+1} / 4：${check.label}…`;render();
    let response;try{response=await request(check.url,check.options);}catch{}
    if(run!==generation)throw Error('cancelled');
    const diagnostic=authRequests.at(-1);
    let hasSession=null;
    if(check.url===sessionUrl&&response?.status===200){try{hasSession=/^[A-Za-z0-9_-]{64}$/.test(JSON.parse(response.responseText).npsso||'');}catch{}}
    result.checks.push({id:check.id,label:check.label,outcome:diagnostic.outcome,status:diagnostic.status,transport:diagnostic.transport,elapsedMs:diagnostic.elapsedMs,hasSession,redirectTarget:diagnostic.redirectTarget,hasAccessCode:diagnostic.hasAccessCode});
    // Permission failures and throttling are not transport controls to work around.
    if([401,403,429].includes(diagnostic.status)){result.stopReason='http-'+diagnostic.status;break;}
   }
   result.complete=result.checks.length===checks.length;
   message=(result.complete?'瀏覽器連線檢查完成。':'瀏覽器連線檢查已停止。')+'只記錄狀態與計數，沒有查詢獎盃、交換權杖或修改標記；請匯出授權診斷。';
  }catch{result.stopReason=run!==generation?'cancelled':'diagnostic';message='瀏覽器連線檢查已停止，未變更標記；可匯出部分診斷。';}
  finally{token='';expires=0;busy=false;render();}
 }
 // Candidate browser-only flow. Never sends manager results or changes marks.
 async function runBrowserAuthProbe(mode='browser-sso-token'){
  if(busy||!['browser-sso-token','browser-isolated'].includes(mode))return;
  busy=true;token='';expires=0;requests=[];authRequests=[];const run=++generation;
  result={schemaVersion:1,kind:'ps-game-base-trophy-probe',authMethod:mode==='browser-sso-token'?'browser-sso-token':'browser-isolated-cookie',testedAt:new Date().toISOString(),complete:false,...(mode==='browser-sso-token'?{sessionReadVerified:false,tokenExchangeVerified:false}:{sessionCookieVerified:false}),trophyAccessVerified:false,samples:[],byTitle:[],catalogExample:null,recentSample:[],authRequests,requests,
   manager:typeof GM_info==='object'?{name:GM_info.scriptHandler,version:GM_info.version}:null};
  try{
   await authorize(run,mode);
   message='授權交換完成，只查最近 1 筆獎盃摘要驗證讀取權限…';render();
   const data=await trophyRequest('/users/me/trophyTitles?limit=1&offset=0',run);
   if(run!==generation)throw Error('已停止。');
   if(!Array.isArray(data.trophyTitles)||data.trophyTitles.length>1||data.trophyTitles.some(t=>!/^NPWR\d+_\d{2}$/.test(t?.npCommunicationId||'')))throw Error('單筆獎盃驗證回應格式不符，未當成授權成功。');
   result.recentSample=data.trophyTitles.map(summarize);result.trophyAccessVerified=true;result.complete=true;
   message=`免助手授權測試成功：已讀取 ${result.recentSample.length} 筆獎盃摘要。沒有變更任何標記；可回管理頁使用「同步白金標記」，或匯出結果 JSON。`;
  }catch(e){result.stopReason=run!==generation?'cancelled':'failed';result.error=e.message;message='免助手授權測試未完成：'+e.message+' 未變更標記；請匯出本次結果。';}
  finally{token='';expires=0;busy=false;render();}
 }
 async function runProbe(mode='browser'){
  if(busy||managerBridge)return;
  const chosen=[...selected].map(id=>samples.get(id)).filter(Boolean);
  if(!chosen.length||chosen.length>5){message='請選 1–5 個不同的 titleId。';render();return;}
  busy=true;requests=[];authRequests=[];const run=++generation;
  const manager=typeof GM_info==='object'&&GM_info?{name:typeof GM_info.scriptHandler==='string'?GM_info.scriptHandler:null,version:typeof GM_info.version==='string'?GM_info.version:null}:null;
  result={schemaVersion:1,kind:'ps-game-base-trophy-probe',probeVersion:'0.4.5',authMethod:mode==='helper'?'local-helper':mode==='browser-sso-token'?'browser-sso-token-summary':'browser',manager,testedAt:new Date().toISOString(),complete:false,samples:chosen,byTitle:[],catalogExample:null,recentSample:[],authRequests,requests};
  const catalog=root.getElementById('catalog').checked;
  try{
   await authorize(run,mode);
   message='查詢選定版本的獎盃摘要…';render();
   const params=new URLSearchParams({npTitleIds:chosen.map(g=>g.titleId).join(','),includeNotEarnedTrophyIds:'false'});
   const data=await trophyRequest('/users/me/titles/trophyTitles?'+params,run);
   if(!Array.isArray(data.titles))throw Error('獎盃回傳缺少 titles 陣列。');
   result.byTitle=chosen.map(g=>{
    const entry=data.titles.find(t=>t.npTitleId===g.titleId);
    if(entry&&!Array.isArray(entry.trophyTitles))throw Error('獎盃組格式不正確。');
    const sets=(entry?.trophyTitles||[]).map(summarize);
    return {...g,status:sets.length?'matched':'unknown',trophySets:sets,
     explanation:sets.length?null:'此帳號查詢未提供獎盃組，可能未啟動／未同步／ID 未對應；不能判定沒有白金。'};
   });
   // A separate account-list sample shows available fields, not a name-based match.
   message='另取最近 5 筆帳號獎盃摘要作格式對照…';render();
   const recent=await trophyRequest('/users/me/trophyTitles?limit=5&offset=0',run);
   if(!Array.isArray(recent.trophyTitles))throw Error('最近獎盃清單格式不正確。');
   result.recentSample=recent.trophyTitles.map(summarize);
   if(catalog){
    message='查詢已知 ASTRO’s PLAYROOM 獎盃組規格（獨立範例，不代表選定遊戲）…';render();
    const catalogData=await trophyRequest('/npCommunicationIds/NPWR20188_00/trophyGroups?npServiceName=trophy2',run);
    result.catalogExample={...summarize({...catalogData,npCommunicationId:'NPWR20188_00',npServiceName:'trophy2'}),explanation:'已知獎盃組的規格，不依是否玩過查詢；不代表選定遊戲有相同獎盃。'};
   }
   if(run!==generation)throw Error('已停止。');
   result.complete=true;message=`測試完成：選定 ${chosen.length} 個版本，成功對應 ${result.byTitle.filter(g=>g.status==='matched').length} 個。可匯出結果 JSON。`;
  }catch(e){if(result)result.error=e.message;message=e.message+' 已取得的部分結果仍可匯出。';}
  finally{busy=false;render();}
 }
 function stop(){generation++;if(platinumRunning)sendPlatinum('PSGB_PLATINUM_ERROR',{code:'cancelled'});for(const h of handles)h?.abort();handles.clear();token='';expires=0;message='已停止並清除記憶體授權。重新整理可清除本分頁測試結果。';render();}
 function element(tag,text,parent){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;}
 function report(){return {...(result||{schemaVersion:1,kind:'ps-game-base-trophy-probe',testedAt:new Date().toISOString(),complete:false,authMethod:managerBridge?'browser-sso-token':'not-started',manager:typeof GM_info==='object'?{name:GM_info.scriptHandler,version:GM_info.version}:null,samples:[...selected].map(id=>samples.get(id)).filter(Boolean),byTitle:[],catalogExample:null,recentSample:[],authRequests,requests}),probeVersion:'0.4.5',capture:{...capture},captureFailures:captureFailures.map(item=>({...item}))};}
 function exportTimestamp(date=new Date()){
  const pad=value=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
 }
 function download(){const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));const a=element('a');a.href=url;a.download=(['browser-isolated-cookie','browser-sso-token'].includes(result?.authMethod)?'ps-game-base-browser-auth-':result?.authMethod==='browser-transport-check'?'ps-game-base-auth-checks-':result?.kind==='ps-game-base-trophy-benchmark'?'ps-game-base-trophy-benchmark-':'ps-game-base-trophy-probe-')+exportTimestamp()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function renderBenchmark(value,output){
  element('strong','單次請求容量',output);
  for(const row of value.limitTests)element('p',`${row.requestedCount} 個：HTTP ${row.status??'未完成'} · ${row.elapsedMs??0}ms · ${{baseline:'5 個基準','rejected-or-failed':'拒絕或失敗','response-differs':'與 5 個基準不一致','insufficient-tail-evidence':'結果相符，但缺少第 6／11 個以後的有效對應，尚無法證明完整處理','matches-baseline':'與基準一致，包含超過 5 個的有效對應'}[row.verdict]}`,output);
  element('strong',`同一批 ${value.sampleCount} 個版本的速度對照`,output);
  for(const row of value.profiles)element('p',`${row.label}\n耗時 ${(row.elapsedMs/1000).toFixed(2)} 秒 · 成功 ${row.successCount}/${row.plannedRequests} 請求 · 同時最多 ${row.maxInFlight} 批\n結果與基準：${row.sameResultAsBaseline?'一致':'未完成或不同'}；1,800 個版本粗估：${row.projected1800Ms===null||!row.sameResultAsBaseline?'不估算':(row.projected1800Ms/60000).toFixed(1)+' 分鐘'}`,output);
  element('small','估算僅依小樣本的平均請求耗時與批次設定，不含授權、分頁及測試間冷卻；長時間限流及網路波動尚未驗證。不自動變更正式同步速度。',output);
 }
 function render(){
  if(!root)return;root.getElementById('message').textContent=message;updateCapture();
  const list=root.getElementById('games');list.replaceChildren();
  for(const g of samples.values()){
   const label=element('label',undefined,list),check=element('input');check.type='checkbox';check.checked=selected.has(g.titleId);check.disabled=busy;
   check.onchange=()=>{if(check.checked){if(selected.size>=5){check.checked=false;message='每輪最多選 5 個不同版本。';}else selected.add(g.titleId);}else selected.delete(g.titleId);render();};
   label.append(check,document.createTextNode(`${g.name} · ${g.platform||''} · ${g.titleId}`));
  }
  root.getElementById('run').disabled=busy||!selected.size;root.getElementById('load').disabled=busy;root.getElementById('export').disabled=busy;root.getElementById('catalog').disabled=busy;
  root.getElementById('auth-checks').disabled=busy;
  root.getElementById('browser-auth-probe').disabled=busy;
  root.getElementById('helper-run').disabled=busy||!selected.size;
  root.getElementById('benchmark-run').disabled=busy||samples.size<15;
  const output=root.getElementById('output');output.replaceChildren();
  if(result){
   if(['browser-isolated-cookie','browser-sso-token'].includes(result.authMethod)){
    element('p',result.authMethod==='browser-sso-token'?`登入資料：${result.sessionReadVerified?'讀取成功':'未確認'}；直接權杖交換：${result.tokenExchangeVerified?'驗證通過':'未確認'}；獎盃讀取權限：${result.trophyAccessVerified?'驗證通過':'未確認'}；未變更標記。`:`獨立登入 Cookie：${result.sessionCookieVerified?'驗證通過':'未確認'}；獎盃讀取權限：${result.trophyAccessVerified?'驗證通過':'未確認'}；未變更標記。`,output);
    for(const t of result.recentSample)element('p',`${t.name||'獎盃樣本'} · ${t.platform||''}\n已取得白金：${t.platinumEarned===null?'未知':t.platinumEarned?'是':'否'}；已取得獎盃 ${t.earnedCount??'未知'}`,output);
   }
   if(result.authMethod==='browser-transport-check')for(const check of result.checks)element('p',`${check.label}：${check.outcome} / ${check.status??'未知'} · ${check.elapsedMs}ms${check.hasSession===null?'':check.hasSession?' · 有登入資料':' · 未取得登入資料'}`,output);
   if(result.kind==='ps-game-base-trophy-benchmark')renderBenchmark(result,output);
   for(const g of result.byTitle||[]){const row=element('div',undefined,output);element('strong',`${g.name} · ${g.titleId}`,row);if(!g.trophySets.length)element('p',g.explanation,row);for(const t of g.trophySets)element('p',`${t.name||''} · ${t.platform||''}\n獎盃總數 ${t.totalTrophies??'未知'}；有白金：${t.hasPlatinum===null?'未知':t.hasPlatinum?'有':'沒有'}\n已取得 ${t.earnedCount??'未知'}；個人進度 ${t.progress??'未知'}%；已白金：${t.platinumEarned===null?'未知':t.platinumEarned?'是':'否'}\n${t.npCommunicationId||'無獎盃組 ID'}`,row);}
   const detail=element('details',undefined,output);element('summary','查看完整測試結果與額外範例',detail);element('pre',JSON.stringify(result,null,2),detail);
  }
 }
 let researchBox,returnToLibrary;
 function mount(){
  host=element('div');host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483646;width:min(650px,95vw);';document.body.append(host);root=host.attachShadow({mode:'closed'});
  const style=element('style',undefined,root);style.textContent=':host{font:13px/1.7 system-ui;color:#e8eef8}section{background:#142037;border:1px solid #6881a4;border-radius:12px;padding:18px;max-height:80vh;overflow:auto;box-shadow:0 10px 50px #0009}h2{margin:0;font-size:19px}p{white-space:pre-wrap}button{background:#293f5f;color:#e8eef8;border:1px solid #6881a4;border-radius:6px;padding:7px 10px;margin:4px;cursor:pointer}button:disabled{opacity:.5}label{display:block;margin:7px 0;overflow-wrap:anywhere}input{margin-right:8px}#games{max-height:190px;overflow:auto;border-block:1px solid #435675;margin-block:12px}#message{background:#223752;padding:10px;position:sticky;top:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}#output>div{border-top:1px solid #435675;padding-top:10px}small{color:#b8c8dd}a{color:#b8d6ff}[hidden]{display:none!important}';
  const box=element('section',undefined,root);researchBox=box;element('h2',managerBridge?'PS Game Base · 白金標記同步 v0.4.5':'PS Game Base · 獎盃小範圍測試 v0.4.5',box);
  element('p',managerBridge?'由遊戲庫手動啟動，只回傳帳號已取得白金的版本，不清除任何標記。':'每輪最多 5 個版本。重點：獎盃總數、有沒有白金，以及個人是否取得。未對應不代表沒有白金。',box);
  element('small',managerBridge?'整合腳本直接向 Sony 取得本次暫存授權；不連線本機助手。憑證不回傳管理頁、不寫入備份或雲端。':'憑證不寫入 DOM、匯出 JSON、localStorage 或 Drive。本機助手模式會把暫存 Sony 登入資料傳到你電腦的 127.0.0.1:4176，再由助手只向 Sony 交換授權；白金同步由管理頁點擊啟動，獨立測試須按下方測試按鈕。',box);
  const messageNode=element('p',message,box);messageNode.id='message';messageNode.setAttribute('role','status');
  const diagnostics=element('p',undefined,box);diagnostics.id='capture';
  const load=element('button','載入遊戲庫／測試 JSON',box);load.id='load';const file=element('input');file.type='file';file.accept='.json,application/json';file.hidden=true;box.append(file);load.onclick=()=>file.click();
  file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>5*1024*1024)throw Error('JSON 上限 5 MB。');const list=sampleGames(JSON.parse(await f.text()));if(!list.length)throw Error('資料沒有可用的 PS4／PS5 titleId。');samples=new Map(list.slice(0,200).map(g=>[g.titleId,g]));selected=new Set(list.slice(0,5).map(g=>g.titleId));message=`載入 ${samples.size} 個候選版本（最多顯示 200 個），請選 1–5 個。`;}catch(e){message=e.message;}finally{file.value='';render();}};
  const list=element('div',undefined,box);list.id='games';
  const label=element('label',undefined,box),catalog=element('input');catalog.type='checkbox';catalog.checked=true;catalog.id='catalog';label.append(catalog,document.createTextNode('額外查 ASTRO’s PLAYROOM 已知獎盃組規格（可測試不依個人遊玩紀錄取規格）'));
  const helperRun=element('button','本機助手測試（備用）',box);helperRun.id='helper-run';helperRun.onclick=()=>runProbe('helper');
  const run=element('button','獎盃摘要測試（免助手）',box);run.id='run';run.onclick=()=>runProbe('browser-sso-token');const clear=element('button','停止／清除授權',box);clear.onclick=stop;
  const benchmarkNote=element('p','效能測試使用前 30 個候選（至少 15 個，不受上方勾選影響）：比較單次 5／10／15 個，以及零間隔、2／3 批並行。最多 26 個獎盃請求，另有授權步驟；不改分類或存檔。',box);
  const benchmarkRun=element('button','測試容量與分批速度（本機助手）',box);benchmarkRun.id='benchmark-run';benchmarkRun.onclick=runBenchmark;
  const authCheck=element('button','檢查瀏覽器連線（不改資料）',box);authCheck.id='auth-checks';authCheck.onclick=runAuthChecks;
  const browserAuth=element('button','測試直接交換權杖（只查 1 筆）',box);browserAuth.id='browser-auth-probe';browserAuth.onclick=()=>runBrowserAuthProbe();
  const exp=element('button','匯出結果／診斷 JSON',box);exp.id='export';exp.onclick=download;const close=element('button',managerBridge?'收合':'返回遊戲庫',box);close.onclick=()=>{if(managerBridge){box.hidden=true;opener.hidden=false;}else{host.hidden=true;returnToLibrary?.();}};
  const output=element('div',undefined,box);output.id='output';const opener=element('button',managerBridge?'白金同步':'獎盃測試',root);opener.hidden=true;opener.onclick=()=>{box.hidden=false;opener.hidden=true;};render();
  if(managerBridge){for(const n of [load,list,label,helperRun,run,diagnostics,benchmarkNote,benchmarkRun])n.hidden=true;exp.textContent='匯出授權診斷';message='等待遊戲庫指定本次白金查詢範圍…';render();sendPlatinum('PSGB_PLATINUM_READY');}
 }
 psgbTools.openTrophies=back=>{returnToLibrary=back;if(!host)mount();host.hidden=false;researchBox.hidden=false;render();};
 psgbTools.hideTrophies=()=>{if(host)host.hidden=true;};
 if(managerBridge){if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});}
})();

// PSGB_TROPHY_END
})();
