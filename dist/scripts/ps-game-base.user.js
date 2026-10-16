// ==UserScript==
// @name         PS Game Base 遊戲庫
// @namespace    personal.ps-game-base
// @version      0.2.0
// @description  在官方遊戲庫同步、搜尋、篩選及匯出自己的數位遊戲授權。
// @match        https://library.playstation.com/*
// @match        https://store.playstation.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @license      MIT
// ==/UserScript==

/* Library query/pagination adapted from psn-mcp, Copyright (c) 2026 TMRP.
 * MIT license: see LICENSE in this script's distribution directory.
 */
(() => {
  'use strict';
  const LIBRARY = 'https://library.playstation.com/recently-purchased';
  const ENDPOINT = 'https://web.np.playstation.com/api/graphql/v1/op';
  const OPERATION = 'getPurchasedGameList';
  // Add a deployed manager origin here only after you explicitly trust it.
  const MANAGER_ORIGINS = new Set(['http://127.0.0.1:4175', 'http://localhost:4175']);
  // Only library data crosses the bridge; bearer tokens stay in this tab.
  let bridge = null, bridgeStarted = false;
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const origin = params.get('psgbOrigin'), session = params.get('psgbSession');
    if (origin && session && /^[a-f0-9-]{36}$/i.test(session) && window.opener && location.hostname === 'library.playstation.com') {
      const target = new URL(origin);
      if (target.origin === origin && MANAGER_ORIGINS.has(origin)) bridge = { origin, session };
    }
  } catch {}
  function sendBridge(type, payload) {
    if (!bridge) return;
    try { window.opener?.postMessage({type, session:bridge.session, ...payload}, bridge.origin); } catch {}
  }
  const networkFetch = window.fetch.bind(window);
  const diagnostics = { fetch: 0, xhr: 0, graphql: 0, purchased: 0, noBearer: 0, noHash: 0, parseError: 0 };
  let authorization = '', queryHash = '', generation = 0, pending = null;
  let games = [], complete = false, syncedAt = '', busy = false, message = '等待官方遊戲庫請求。請登入並切換到「已購買」，再開啟面板。';
  let host, root;

  function inspect(rawUrl, headers, body) {
    try {
      const url = new URL(String(rawUrl), location.href);
      if (url.origin !== 'https://web.np.playstation.com' || url.pathname !== '/api/graphql/v1/op') return;
      diagnostics.graphql++;
      let payload;
      if (body) {
        try { payload = JSON.parse(body); }
        catch { const form = new URLSearchParams(body); if (!form.has('operationName')) throw new Error('Unknown body'); payload = Object.fromEntries(form); }
      } else payload = Object.fromEntries(url.searchParams);
      if (Array.isArray(payload)) {
        for (const operation of payload) inspect(rawUrl, headers, JSON.stringify(operation));
        return;
      }
      if (payload.operationName !== OPERATION) return;
      diagnostics.purchased++;
      const extensions = typeof payload.extensions === 'string' ? JSON.parse(payload.extensions) : payload.extensions;
      const hash = extensions?.persistedQuery?.sha256Hash;
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
      if (!busy) message = '已取得官方查詢碼，可以同步。有 Bearer 時沿用，否則使用目前瀏覽器登入工作階段。';
      render();
    } catch { diagnostics.parseError++; }
    finally { render(); }
  }

  // Read only the headers of the official purchased-library request.
  // Credentials never enter DOM, console, persistent storage or exports.
  if (location.hostname === 'library.playstation.com') {
    const page = window;
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
          copy.text().then(body => inspect(url, headers, body)).catch(() => { diagnostics.parseError++; render(); });
        } else inspect(url, headers, typeof init?.body === 'string' ? init.body : undefined);
      } catch { diagnostics.parseError++; }
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
  function exportData(format) {
    if (!games.length || busy) return;
    const fields = ['name', 'platform', 'membership', 'productId', 'titleId', 'entitlementId', 'isActive', 'isDownloadable', 'isPreOrder'];
    const body = format === 'json'
      ? JSON.stringify({ schemaVersion: 1, scope: 'active-ps4-ps5-digital-entitlements', complete, syncedAt: syncedAt || null, exportedAt: new Date().toISOString(), games }, null, 2)
      : '\uFEFF' + [['complete', 'syncedAt', ...fields], ...games.map(g => [complete, syncedAt, ...fields.map(k => g[k])])].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `ps-game-base-${complete ? 'complete' : 'partial'}-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function el(tag, text, parent) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; parent?.append(node); return node; }
  function render() {
    if (!root) return;
    root.querySelector('#status').textContent = message;
    root.querySelector('#diagnostics').textContent = `v0.2.0 · fetch ${diagnostics.fetch} / XHR ${diagnostics.xhr} / GraphQL ${diagnostics.graphql} / 已購買 ${diagnostics.purchased} / 缺授權 ${diagnostics.noBearer} / 缺查詢碼 ${diagnostics.noHash} / 格式錯誤 ${diagnostics.parseError}`;
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
    launch.onclick = () => { panel.hidden = !panel.hidden; render(); };
    el('h2', 'PS Game Base · 遊戲庫 v0.2.0', panel);
    if (bridge) el('p', `由 ${bridge.origin} 開啟：完整同步後，遊戲資料將自動回傳該管理頁供確認。登入憑證不會回傳。`, panel);
    el('p', '僅查詢有效的 PS4／PS5 數位授權，包含免費與 PS Plus。未包含付款紀錄、實體收藏及遊玩時數。權杖與資料僅暫存本分頁，重新整理即清除。', panel);
    const library = el('a', '開啟官方遊戲庫（登入後選「已購買」）', panel); library.href = LIBRARY; library.target = '_blank'; library.rel = 'noopener noreferrer';
    const status = el('p', message, panel); status.id = 'status'; status.setAttribute('role', 'status');
    el('small', undefined, panel).id = 'diagnostics';
    const controls = el('div', undefined, panel); controls.className = 'controls';
    const syncButton = el('button', '同步遊戲庫', controls); syncButton.id = 'sync'; syncButton.onclick = sync;
    const stop = el('button', '停止', controls); stop.id = 'stop'; stop.onclick = () => { generation++; pending?.abort(); };
    for (const format of ['json', 'csv']) { const b = el('button', `匯出 ${format.toUpperCase()}`, controls); b.dataset.export = format; b.onclick = () => exportData(format); }
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
