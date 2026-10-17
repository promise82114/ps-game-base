// ==UserScript==
// @name         PS Game Base 獎盃小範圍測試
// @namespace    personal.ps-game-base.trophy-probe
// @version      0.1.5
// @description  僅測試最多 5 個遊戲版本的獎盃摘要，另查已知獎盃組的規格；不改分類、不同步存檔。
// @match        https://library.playstation.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      ca.account.sony.com
// @connect      m.np.playstation.com
// @connect      127.0.0.1
// @license      MIT
// ==/UserScript==

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
  const games=input?.library?.games||input?.games||(input?.kind==='ps-game-base-trophy-probe'?input.samples:null);
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
  const local=u.origin===LOCAL&&['/session','/authorize'].includes(u.pathname);
  if(!local&&!((u.origin==='https://ca.account.sony.com'&&(u.pathname==='/api/v1/ssocookie'||u.pathname.startsWith('/api/authz/v3/oauth/')))||(u.origin==='https://m.np.playstation.com'&&u.pathname.startsWith('/api/trophy/v1/'))))throw Error('測試腳本拒絕非預期的請求目的地。');
  const start=Date.now(),isAuth=local||u.origin==='https://ca.account.sony.com',path=u.pathname;
  const stage=local?(path==='/session'?'local-session':'local-access-token'):path==='/api/v1/ssocookie'?'sony-session':path.endsWith('/authorize')?'sony-access-code':path.endsWith('/token')?'sony-access-token':'trophy';
  const stageLabel={'local-session':'本機助手連線','local-access-token':'本機助手授權','sony-session':'Sony 登入工作階段','sony-access-code':'Sony 授權碼','sony-access-token':'Sony 獎盃權杖',trophy:'獎盃 API'}[stage];
  return new Promise((resolve,reject)=>{
   let handle,finished=false;
   const finish=(response,outcome='http')=>{
    if(finished)return;finished=true;clearTimeout(timer);handles.delete(handle);
    const entry={stage,host:u.hostname,path,method:options.method||'GET',transport:options.redirect==='manual'?'manual-redirect':options.anonymous?'anonymous':'default',outcome,status:Number.isInteger(response?.status)?response.status:null,elapsedMs:Date.now()-start};
    if(isAuth){
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
  if(typeof cookie.npsso!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(cookie.npsso))throw Error('沒有可用的 Sony 登入。請先在同一個 Chrome 登入 PlayStation，再重試。');
  let auth;
  if(mode==='helper'){
   message='正在使用此電腦的 127.0.0.1 本機助手交換授權；不保存憑證…';render();
   const headers={'X-PSGB-Client':'trophy-probe'};
   const session=json(await request(LOCAL+'/session',{headers}),'本機助手連線');
   if(run!==generation)throw Error('已停止。');
   if(session.kind!=='ps-game-base-local-trophy-auth'||typeof session.nonce!=='string'||!/^[a-f0-9]{48}$/.test(session.nonce))throw Error('本機助手工作階段格式不符，未傳送 Sony 登入資料。');
   const value=json(await request(LOCAL+'/authorize',{method:'POST',headers:{...headers,'Content-Type':'application/json'},data:JSON.stringify({nonce:session.nonce,npsso:cookie.npsso})}),'本機助手授權');
   auth={access_token:value.accessToken,expires_in:value.expiresIn};
  }else{
  const params=new URLSearchParams({access_type:'offline',client_id:CLIENT,redirect_uri:REDIRECT,response_type:'code',scope:'psn:mobile.v2.core psn:clientapp'});
  // Same Sony origin as the successful session request. Keep the browser's
  // authenticated cookie jar; avoid overriding Cookie when manual redirect forces fetch.
  const response=await request(AUTH+'/authorize?'+params,{redirect:'manual'});
  if(run!==generation)throw Error('已停止。');
  const accepted=accessCode(response);
  if(!accepted)throw Error('Sony 未回傳可驗證的授權碼；可能需要重新登入，或 Tampermonkey 未提供重新導向資訊。未匯出授權內容。');
  const {code}=accepted;
  const payload=new URLSearchParams({code,redirect_uri:REDIRECT,grant_type:'authorization_code',token_format:'jwt'});
  auth=json(await request(AUTH+'/token',{method:'POST',headers:{Authorization:CLIENT_AUTH,'Content-Type':'application/x-www-form-urlencoded'},data:payload.toString()}),'獎盃授權');
  }
  if(run!==generation)throw Error('已停止。');
  if(typeof auth.access_token!=='string'||!Number.isFinite(Number(auth.expires_in))||Number(auth.expires_in)<=0)throw Error('Sony 授權格式不正確。');
  token=auth.access_token;expires=Date.now()+Math.max(0,Number(auth.expires_in)-60)*1000;
  // NPSSO, access code and refresh token are never displayed or persisted.
 }
 async function trophyRequest(path,run){
  if(run!==generation)throw Error('已停止。');
  const r=await request(BASE+path,{anonymous:true,headers:{Authorization:'Bearer '+token,'Accept-Language':'zh-Hant-TW'}});
  if(r.status===401||r.status===403){token='';expires=0;throw Error(`獎盃 API 無有效授權（HTTP ${r.status}）。請重新登入後再測試。`);}
  return json(r,'獎盃查詢');
 }
 async function runProbe(mode='browser'){
  if(busy)return;
  const chosen=[...selected].map(id=>samples.get(id)).filter(Boolean);
  if(!chosen.length||chosen.length>5){message='請選 1–5 個不同的 titleId。';render();return;}
  busy=true;requests=[];authRequests=[];const run=++generation;
  const manager=typeof GM_info==='object'&&GM_info?{name:typeof GM_info.scriptHandler==='string'?GM_info.scriptHandler:null,version:typeof GM_info.version==='string'?GM_info.version:null}:null;
  result={schemaVersion:1,kind:'ps-game-base-trophy-probe',probeVersion:'0.1.5',authMethod:mode==='helper'?'local-helper':'browser',manager,testedAt:new Date().toISOString(),complete:false,samples:chosen,byTitle:[],catalogExample:null,recentSample:[],authRequests,requests};
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
 function stop(){generation++;for(const h of handles)h?.abort();handles.clear();token='';expires=0;message='已停止並清除記憶體授權。重新整理可清除本分頁測試結果。';render();}
 function element(tag,text,parent){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;}
 function report(){return {...(result||{schemaVersion:1,kind:'ps-game-base-trophy-probe',testedAt:new Date().toISOString(),complete:false,samples:[...selected].map(id=>samples.get(id)).filter(Boolean),byTitle:[],catalogExample:null,recentSample:[],authRequests,requests}),probeVersion:'0.1.5',capture:{...capture},captureFailures:captureFailures.map(item=>({...item}))};}
 function download(){const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));const a=element('a');a.href=url;a.download='ps-game-base-trophy-probe-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function render(){
  if(!root)return;root.getElementById('message').textContent=message;updateCapture();
  const list=root.getElementById('games');list.replaceChildren();
  for(const g of samples.values()){
   const label=element('label',undefined,list),check=element('input');check.type='checkbox';check.checked=selected.has(g.titleId);check.disabled=busy;
   check.onchange=()=>{if(check.checked){if(selected.size>=5){check.checked=false;message='每輪最多選 5 個不同版本。';}else selected.add(g.titleId);}else selected.delete(g.titleId);render();};
   label.append(check,document.createTextNode(`${g.name} · ${g.platform||''} · ${g.titleId}`));
  }
  root.getElementById('run').disabled=busy||!selected.size;root.getElementById('load').disabled=busy;root.getElementById('export').disabled=busy;root.getElementById('catalog').disabled=busy;
  root.getElementById('helper-run').disabled=busy||!selected.size;
  const output=root.getElementById('output');output.replaceChildren();
  if(result){
   for(const g of result.byTitle){const row=element('div',undefined,output);element('strong',`${g.name} · ${g.titleId}`,row);if(!g.trophySets.length)element('p',g.explanation,row);for(const t of g.trophySets)element('p',`${t.name||''} · ${t.platform||''}\n獎盃總數 ${t.totalTrophies??'未知'}；有白金：${t.hasPlatinum===null?'未知':t.hasPlatinum?'有':'沒有'}\n已取得 ${t.earnedCount??'未知'}；個人進度 ${t.progress??'未知'}%；已白金：${t.platinumEarned===null?'未知':t.platinumEarned?'是':'否'}\n${t.npCommunicationId||'無獎盃組 ID'}`,row);}
   const detail=element('details',undefined,output);element('summary','查看完整測試結果與額外範例',detail);element('pre',JSON.stringify(result,null,2),detail);
  }
 }
 function mount(){
  host=element('div');host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483646;width:min(650px,95vw);';document.body.append(host);root=host.attachShadow({mode:'closed'});
  const style=element('style',undefined,root);style.textContent=':host{font:13px/1.7 system-ui;color:#e8eef8}section{background:#142037;border:1px solid #6881a4;border-radius:12px;padding:18px;max-height:80vh;overflow:auto;box-shadow:0 10px 50px #0009}h2{margin:0;font-size:19px}p{white-space:pre-wrap}button{background:#293f5f;color:#e8eef8;border:1px solid #6881a4;border-radius:6px;padding:7px 10px;margin:4px;cursor:pointer}button:disabled{opacity:.5}label{display:block;margin:7px 0;overflow-wrap:anywhere}input{margin-right:8px}#games{max-height:190px;overflow:auto;border-block:1px solid #435675;margin-block:12px}#message{background:#223752;padding:10px;position:sticky;top:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}#output>div{border-top:1px solid #435675;padding-top:10px}small{color:#b8c8dd}a{color:#b8d6ff}';
  const box=element('section',undefined,root);element('h2','PS Game Base · 獎盃小範圍測試 v0.1.5',box);
  element('p','每輪最多 5 個版本。重點：獎盃總數、有沒有白金，以及個人是否取得。未對應不代表沒有白金。',box);
  element('small','憑證不寫入 DOM、匯出 JSON、localStorage 或 Drive。本機助手模式會把暫存 Sony 登入資料傳到你電腦的 127.0.0.1:4176，再由助手只向 Sony 交換授權；只有按該按鈕才會傳送。本測試不改現有分類。',box);
  const messageNode=element('p',message,box);messageNode.id='message';messageNode.setAttribute('role','status');
  const diagnostics=element('p',undefined,box);diagnostics.id='capture';
  const load=element('button','載入遊戲庫／測試 JSON',box);load.id='load';const file=element('input');file.type='file';file.accept='.json,application/json';file.hidden=true;box.append(file);load.onclick=()=>file.click();
  file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>5*1024*1024)throw Error('JSON 上限 5 MB。');const list=sampleGames(JSON.parse(await f.text()));if(!list.length)throw Error('資料沒有可用的 PS4／PS5 titleId。');samples=new Map(list.slice(0,200).map(g=>[g.titleId,g]));selected=new Set(list.slice(0,5).map(g=>g.titleId));message=`載入 ${samples.size} 個候選版本（最多顯示 200 個），請選 1–5 個。`;}catch(e){message=e.message;}finally{file.value='';render();}};
  const list=element('div',undefined,box);list.id='games';
  const label=element('label',undefined,box),catalog=element('input');catalog.type='checkbox';catalog.checked=true;catalog.id='catalog';label.append(catalog,document.createTextNode('額外查 ASTRO’s PLAYROOM 已知獎盃組規格（可測試不依個人遊玩紀錄取規格）'));
  const helperRun=element('button','本機助手測試（建議）',box);helperRun.id='helper-run';helperRun.onclick=()=>runProbe('helper');
  const run=element('button','瀏覽器直接測試',box);run.id='run';run.onclick=()=>runProbe('browser');const clear=element('button','停止／清除授權',box);clear.onclick=stop;
  const exp=element('button','匯出結果／診斷 JSON',box);exp.id='export';exp.onclick=download;const close=element('button','收合',box);close.onclick=()=>{box.hidden=true;opener.hidden=false;};
  const output=element('div',undefined,box);output.id='output';const opener=element('button','獎盃測試',root);opener.hidden=true;opener.onclick=()=>{box.hidden=false;opener.hidden=true;};render();
 }
 if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
})();
