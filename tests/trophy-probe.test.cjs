const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/scripts/ps-game-base.user.js'),'utf8').replace(/\r/g,'').split('// PSGB_TROPHY_START\n')[1].split('// PSGB_TROPHY_END')[0];
const counts={bronze:30,silver:10,gold:3,platinum:1};
const trophy={npCommunicationId:'NPWR00001_00',npServiceName:'trophy2',trophyTitleName:'Test game',trophyTitlePlatform:'PS5',definedTrophies:counts,earnedTrophies:{bronze:3,silver:0,gold:0,platinum:0},progress:4,lastUpdatedDateTime:'2026-10-17T00:00:00Z'};
function setup(responses=[],browser={},hash='',fastTiming=false){
 const calls=[],nodes=new Map();
 const node=()=>({children:[],checked:true,disabled:false,append(...n){this.children.push(...n);},replaceChildren(...n){this.children=n;},setAttribute(){}});
 const root={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
 function XHR(){}XHR.prototype.open=function(){};XHR.prototype.send=function(){};
 const testTimeout=(cb,ms)=>fastTiming&&[350,1000].includes(ms)?{immediate:setImmediate(cb)}:setTimeout(cb,ms);
 const testClear=handle=>handle?.immediate?clearImmediate(handle.immediate):clearTimeout(handle);
 const context={URL,URLSearchParams,Map,Set,WeakMap,Date,Headers,Blob,Number,Error,Promise,setTimeout:testTimeout,clearTimeout:testClear,
  location:{href:'https://library.playstation.com/recently-purchased',hash},
  window:{fetch:async()=>({clone:()=>({json:async()=>({})})}),XMLHttpRequest:XHR},
  document:{body:null,addEventListener(){},createElement:node,createTextNode:text=>text},
  GM_info:{scriptHandler:'Tampermonkey',version:'test-version'},
  GM_xmlhttpRequest(options){calls.push(options);const next=typeof responses==='function'?responses(options,calls.length):responses.shift();if(next?.event==='throw')throw Error('PRIVATE_EXCEPTION');let aborted=false;const handle={abort(){aborted=true;options.onabort();}};const deliver=()=>{if(aborted)return;if(!next||next.event==='error')options.onerror(next);else options.onload({status:200,responseHeaders:'',...next});};if(next?.delayMs)setTimeout(deliver,next.delayMs);else setImmediate(deliver);return handle;}};
 Object.defineProperties(context.window,Object.getOwnPropertyDescriptors(browser));
 vm.createContext(context);
 const exposed=source.replace(/\}\)\(\);\s*$/,'globalThis.probe={runBenchmark,syncPlatinum,getBusy:()=>busy,accessCode,requestUrl,report,getCapture:()=>capture,getPage:()=>page,summarize,sampleGames,libraryResponse,runProbe,stop,authorize,request,setRoot(v){root=v;},setToken(v){token=v;expires=Date.now()+60000;},setSamples(games){samples=new Map(games.map(g=>[g.titleId,g]));selected=new Set(games.map(g=>g.titleId));},getResult:()=>result,getToken:()=>token,getSamples:()=>[...samples.values()]};})();');
 vm.runInContext('const psgbTools={};\n'+exposed,context);context.probe.setRoot(root);return {api:context.probe,calls,nodes};
}
const sample={titleId:'PPSA12345_00',name:'Test game',platform:'PS5'};
test('summary distinguishes platinum availability from personal platinum earned',()=>{
 const {api}=setup();const row=api.summarize(trophy);assert.equal(row.totalTrophies,44);assert.equal(row.earnedCount,3);assert.equal(row.hasPlatinum,true);assert.equal(row.platinumEarned,false);
 assert.equal(api.summarize({...trophy,earnedTrophies:{...counts}}).platinumEarned,true);
 assert.equal(api.summarize({...trophy,definedTrophies:{...counts,platinum:0}}).hasPlatinum,false);
});
test('missing or invalid counts remain unknown rather than zero or no platinum',()=>{
 const {api}=setup();for(const value of [undefined,{}, {...counts,platinum:'1'},{...counts,bronze:-1}]){const row=api.summarize({...trophy,definedTrophies:value,earnedTrophies:undefined});assert.equal(row.hasPlatinum,null);assert.equal(row.totalTrophies,null);assert.equal(row.platinumEarned,null);}
 const row=api.summarize({npCommunicationId:'NPWR00001_00',definedTrophies:counts});assert.equal(row.hasPlatinum,true);assert.equal(row.platinumEarned,null);
});
test('library versions deduplicate by title ID, retain distinct PS4/PS5, ignore malformed IDs',()=>{
 const {api}=setup();const rows=api.sampleGames({library:{games:[sample,sample,{...sample,titleId:'CUSA12345_00',platform:'PS4'},{name:'bad',titleId:'../../wrong'}]}});assert.equal(rows.length,2);assert.equal(rows[1].platform,'PS4');assert.throws(()=>api.sampleGames({}));
});
test('previous probe exports supply candidates without requiring another library request',()=>{
 const {api,calls}=setup();const games=api.sampleGames({schemaVersion:1,kind:'ps-game-base-trophy-probe',samples:[sample],complete:false,authRequests:[]});api.setSamples(games);assert.equal(api.report().samples[0].titleId,sample.titleId);assert.equal(calls.length,0);assert.throws(()=>api.sampleGames({kind:'unrelated',samples:[sample]}));
});
test('small probe is bounded to five titles and makes no requests automatically',async()=>{
 const {api,calls}=setup();api.libraryResponse({data:{purchasedTitlesRetrieve:{games:[sample]}}});assert.equal(calls.length,0);
 api.setSamples(Array.from({length:6},(_,i)=>({...sample,titleId:'PPSA1234'+i+'_00'})));await api.runProbe();assert.equal(calls.length,0);
});
test('matched and unmatched titles preserve unknown states; exported report excludes raw secrets',async()=>{
 const secrets={accessToken:'PRIVATE_ACCESS',refreshToken:'PRIVATE_REFRESH',authorization:'PRIVATE_HEADER'};
 const {api,calls}=setup([
  {responseText:JSON.stringify({titles:[{npTitleId:sample.titleId,trophyTitles:[{...trophy,...secrets}]}],...secrets})},
  {responseText:JSON.stringify({trophyTitles:[trophy]})},
  {responseText:JSON.stringify({...trophy,earnedTrophies:undefined,progress:undefined})}
 ]);api.setToken(secrets.accessToken);api.setSamples([sample,{...sample,titleId:'CUSA12345_00'}]);await api.runProbe();
 const result=api.getResult();assert.equal(result.complete,true);assert.equal(result.byTitle[0].trophySets[0].hasPlatinum,true);assert.equal(result.byTitle[1].status,'unknown');assert.equal(result.byTitle[1].trophySets.length,0);assert.equal(result.catalogExample.platinumEarned,null);assert.equal(calls.length,3);
 const report=JSON.stringify(result);for(const secret of Object.values(secrets))assert.equal(report.includes(secret),false);assert.equal(report.includes('PRIVATE_ACCESS'),false);assert.equal(result.requests.length,3);
});
test('unauthorized request stops without retrying and removes the access token',async()=>{
 const {api,calls}=setup([{status:401,responseText:'private upstream details'}]);api.setToken('PRIVATE_ACCESS');api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.complete,false);assert.match(result.error,/401/);assert.equal(calls.length,1);assert.equal(api.getToken(),'');assert.equal(JSON.stringify(result).includes('private upstream'),false);
});
test('Sony auth flow stores only short-lived access token and keeps secrets out of the report',async()=>{
 const npsso='a'.repeat(64);const {api,calls}=setup([
  {responseText:JSON.stringify({npsso})},
  {status:302,responseHeaders:'Location: com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE\r\n'},
  {responseText:JSON.stringify({access_token:'PRIVATE_ACCESS',expires_in:3600,refresh_token:'PRIVATE_REFRESH'})},
  {responseText:JSON.stringify({titles:[]})},{responseText:JSON.stringify({trophyTitles:[]})},{responseText:JSON.stringify({definedTrophies:counts})}
 ]);api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.complete,true);assert.equal(calls.length,6);assert.equal(api.getToken(),'PRIVATE_ACCESS');assert.equal(calls[1].redirect,'manual');assert.equal(calls[2].method,'POST');assert.equal(calls[0].redirect,undefined);assert.equal(calls[2].redirect,'manual');assert.equal(result.authRequests.length,3);assert.equal(result.authRequests[1].redirectTarget,'psn-app');assert.equal(result.authRequests[0].stage,'sony-session');
 const report=JSON.stringify(result);for(const secret of [npsso,'PRIVATE_CODE','PRIVATE_ACCESS','PRIVATE_REFRESH'])assert.equal(report.includes(secret),false);assert.equal(result.requests.length,3);api.stop();assert.equal(api.getToken(),'');
});
test('request allowlist rejects non-Sony endpoints before any network request',()=>{
 const {api,calls}=setup();for(const url of ['https://example.com/','https://ca.account.sony.com.evil.invalid/api/v1/ssocookie','https://m.np.playstation.com/api/other'])assert.throws(()=>api.request(url));assert.equal(calls.length,0);
});
test('HTML response is an error and cannot be interpreted as an empty trophy list',async()=>{
 const {api}=setup([{responseText:'<html>sign in</html>'}]);api.setToken('PRIVATE_ACCESS');api.setSamples([sample]);await api.runProbe();assert.equal(api.getResult().complete,false);assert.match(api.getResult().error,/非 JSON/);
});

test('initial session network failure records the previously missing diagnostic without leaking callback details',async()=>{
 const {api}=setup([{event:'error',status:0,finalUrl:'https://ca.account.sony.com/api/v1/ssocookie?token=PRIVATE_TOKEN',responseText:'PRIVATE_COOKIE',error:'PRIVATE_ERROR'}]);api.setSamples([sample]);await api.runProbe();
 const result=api.getResult();assert.equal(result.probeVersion,'0.4.1');assert.equal(result.manager.version,'test-version');assert.equal(result.requests.length,0);assert.equal(result.authRequests.length,1);assert.equal(result.authRequests[0].stage,'sony-session');assert.equal(result.authRequests[0].outcome,'network');assert.equal(result.authRequests[0].status,0);assert.equal(result.authRequests[0].transport,'default');assert.match(result.error,/Sony 登入工作階段/);assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
});
test('access code and access token transport failures identify the exact step',async()=>{
 const session={responseText:JSON.stringify({npsso:'a'.repeat(64)})},code={status:302,responseHeaders:'Location: com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE\r\n'};
 for(const [responses,stage] of [[[session,{event:'error'}],'sony-access-code'],[[session,code,{event:'error'}],'sony-access-token']]){
  const {api}=setup(responses);api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.authRequests.at(-1).stage,stage);assert.equal(result.authRequests.at(-1).outcome,'network');assert.equal(result.requests.length,0);assert.equal(JSON.stringify(result).includes('PRIVATE_CODE'),false);
 }
});
test('synchronous GM failure is recorded and sanitized rather than leaving an unreported timer',async()=>{
 const {api}=setup([{event:'throw'}]);api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.authRequests[0].outcome,'exception');assert.match(result.error,/無法啟動請求/);assert.equal(JSON.stringify(result).includes('PRIVATE_EXCEPTION'),false);
});
test('redirect diagnostics expose only a category, never query parameters or a location URL',async()=>{
 const {api}=setup([{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{status:302,responseHeaders:'Location: https://my.account.sony.com/signin?code=PRIVATE_CODE&token=PRIVATE_TOKEN\r\n'}]);api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.authRequests[1].redirectTarget,'sony-web');assert.equal(result.authRequests[1].hasRedirect,true);assert.equal(result.complete,false);assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
});

test('batch GraphQL responses populate candidates without triggering trophy requests',()=>{
 const {api,calls}=setup();api.libraryResponse([{data:{other:{}}},{data:{purchasedTitlesRetrieve:{games:[sample]}}}]);assert.equal(api.getSamples().length,1);assert.equal(api.getCapture().purchasedResponses,1);assert.equal(api.getCapture().gameRows,1);assert.equal(calls.length,0);
});
test('fetch observer accepts cross-realm URL-like inputs and preserves the native response',async()=>{
 const native={status:200,clone:()=>({json:async()=>({data:{purchasedTitlesRetrieve:{games:[sample]}}})})};
 const {api}=setup([],{fetch:()=>Promise.resolve(native)});const url={href:'https://web.np.playstation.com/api/graphql/v1/op?private=PRIVATE_QUERY'};const response=await api.getPage().fetch(url);assert.equal(response,native);await new Promise(setImmediate);assert.equal(api.getSamples().length,1);assert.equal(api.getCapture().fetch,1);assert.equal(api.getCapture().graphql,1);assert.equal(JSON.stringify(api.report()).includes('PRIVATE_QUERY'),false);
});
test('XHR response observer parses the purchased response and retains request arguments',()=>{
 function XHR(){this.listeners={};this.status=200;this.responseType='json';this.response={data:{purchasedTitlesRetrieve:{games:[sample]}}};}XHR.prototype.open=function(method,url){this.opened=[method,url];};XHR.prototype.addEventListener=function(name,fn){this.listeners[name]=fn;};XHR.prototype.send=function(body){this.body=body;this.listeners.load?.();};
 const {api}=setup([],{XMLHttpRequest:XHR});const xhr=new (api.getPage().XMLHttpRequest)();xhr.open('POST','https://web.np.playstation.com/api/graphql/v1/op');xhr.send('PRIVATE_REQUEST_BODY');assert.equal(xhr.body,'PRIVATE_REQUEST_BODY');assert.equal(api.getSamples().length,1);assert.equal(api.getCapture().xhr,1);assert.equal(api.getCapture().graphql,1);assert.equal(JSON.stringify(api.report()).includes('PRIVATE_REQUEST_BODY'),false);
});
test('unavailable hooks remain diagnosable and permit manual library JSON candidates',()=>{
 const page={XMLHttpRequest:null};Object.defineProperty(page,'fetch',{get(){throw Error('PRIVATE_HOOK_ERROR');},enumerable:true});
 const {api}=setup([],page);assert.equal(api.getCapture().xhrHook,'failed');api.setSamples(api.sampleGames({games:[sample]}));assert.equal(api.report().samples.length,1);assert.equal(api.report().complete,false);assert.equal(JSON.stringify(api.report()).includes('PRIVATE_HOOK_ERROR'),false);
});
test('parse failure produces counters and exportable diagnostics even without candidates',async()=>{
 const {api}=setup([],{fetch:async()=>({status:200,clone:()=>({json:async()=>{throw Error('PRIVATE_RESPONSE');}})})});await api.getPage().fetch('https://web.np.playstation.com/api/graphql/v1/op');await new Promise(setImmediate);const report=api.report();assert.equal(report.capture.parseErrors,1);assert.equal(report.capture.graphql,1);assert.equal(report.samples.length,0);assert.equal(report.complete,false);assert.equal(JSON.stringify(report).includes('PRIVATE_RESPONSE'),false);
});

test('native body readers capture games even when the app consumes the response before fetch observers',async()=>{
 let clones=0;const data={data:{purchasedTitlesRetrieve:{games:[sample]}}};
 class PageResponse{constructor(){this.url='https://web.np.playstation.com/api/graphql/v1/op';this.status=200;this.bodyUsed=false;}json(){this.bodyUsed=true;return Promise.resolve(data);}text(){this.bodyUsed=true;return Promise.resolve(JSON.stringify(data));}clone(){clones++;throw TypeError('Body has already been consumed');}}
 const response=new PageResponse();let nativePromise;
 const {api}=setup([],{Response:PageResponse,fetch:()=>{nativePromise=Promise.resolve(response);nativePromise.then(r=>r.json());return nativePromise;}});
 const returned=api.getPage().fetch(response.url);assert.equal(returned,nativePromise);await returned;await new Promise(setImmediate);assert.equal(clones,0);assert.equal(api.getSamples().length,1);assert.equal(api.getCapture().readerReads,1);assert.equal(api.getCapture().parseErrors,0);
});
test('text reader accepts BOM-prefixed batch JSON and preserves its original return value',async()=>{
 const text='\uFEFF'+JSON.stringify([{data:{purchasedTitlesRetrieve:{games:[sample]}}}]);
 class PageResponse{constructor(){this.url='https://web.np.playstation.com/api/graphql/v1/op';}json(){return Promise.resolve({});}text(){return Promise.resolve(text);}}
 const {api}=setup([],{Response:PageResponse});const response=new PageResponse();assert.equal(await response.text(),text);await new Promise(setImmediate);assert.equal(api.getSamples().length,1);assert.equal(api.getCapture().decodedResponses,1);
});
test('clone, body-read and JSON-parse failures have distinct sanitized diagnostics',async()=>{
 const cases=[
  [{bodyUsed:true,clone(){throw TypeError('PRIVATE_ACCESS body already used');}},'fetch-clone','body-already-used'],
  [{clone:()=>({text:async()=>{throw TypeError('Illegal invocation PRIVATE_ACCESS');}})},'fetch-read','illegal-invocation'],
  [{clone:()=>({text:async()=>'<html>PRIVATE_ACCESS</html>'})},'parse-json','invalid-json']
 ];
 for(const [response,stage,reason] of cases){const {api}=setup([],{fetch:async()=>({status:200,...response})});await api.getPage().fetch('https://web.np.playstation.com/api/graphql/v1/op');await new Promise(setImmediate);const report=api.report();assert.equal(report.captureFailures[0].stage,stage);assert.equal(report.captureFailures[0].reason,reason);assert.equal(report.capture.parseErrors,1);assert.equal(JSON.stringify(report).includes('PRIVATE_ACCESS'),false);}
});
test('valid unrelated GraphQL data is counted separately from a parse failure',async()=>{
 const {api}=setup([],{fetch:async()=>({status:200,clone:()=>({text:async()=>JSON.stringify({data:{otherQuery:{value:'PRIVATE_VALUE'}}})})})});await api.getPage().fetch('https://web.np.playstation.com/api/graphql/v1/op');await new Promise(setImmediate);const report=api.report();assert.equal(report.capture.decodedResponses,1);assert.equal(report.capture.unrecognizedResponses,1);assert.equal(report.capture.parseErrors,0);assert.equal(report.capture.purchasedResponses,0);assert.equal(JSON.stringify(report).includes('PRIVATE_VALUE'),false);
});

test('authorize explicitly supplies the Sony session using the GM cookie option in manual mode',async()=>{
 const {api,calls}=setup([{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{status:302,responseHeaders:'Location: com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE\r\n'},{responseText:JSON.stringify({access_token:'PRIVATE_ACCESS',expires_in:3600})},{responseText:JSON.stringify({titles:[]})},{responseText:JSON.stringify({trophyTitles:[]})},{responseText:JSON.stringify({definedTrophies:counts})}]);api.setSamples([sample]);await api.runProbe();assert.equal(api.getResult().complete,true);assert.equal(calls[1].redirect,'manual');assert.equal(calls[1].headers?.Cookie,undefined);assert.equal(calls[1].cookie,'npsso='+'a'.repeat(64));assert.equal(api.getResult().authRequests[1].explicitSessionCookie,true);assert.notEqual(calls[0].anonymous,true);assert.notEqual(calls[1].anonymous,true);
});
test('a validated app redirect code survives a network error and continues the token exchange',async()=>{
 const {api,calls}=setup([{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{event:'error',status:408,statusText:'Failed to fetch',finalUrl:'com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE'},{responseText:JSON.stringify({access_token:'PRIVATE_ACCESS',expires_in:3600,refresh_token:'PRIVATE_REFRESH'})},{responseText:JSON.stringify({titles:[]})},{responseText:JSON.stringify({trophyTitles:[]})},{responseText:JSON.stringify({definedTrophies:counts})}]);api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.complete,true);assert.equal(calls.length,6);assert.equal(new URLSearchParams(calls[2].data).get('code'),'PRIVATE_CODE');const entry=result.authRequests[1];assert.equal(entry.outcome,'network');assert.equal(entry.status,408);assert.equal(entry.hasAccessCode,true);assert.equal(entry.codeSource,'final-url');assert.equal(entry.networkReason,'failed-to-fetch');assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
});
test('redirect codes require the exact expected app origin, safe path and one code without OAuth errors',()=>{
 const {api}=setup();for(const finalUrl of ['https://my.account.sony.com/signin?code=PRIVATE_CODE','com.scee.psxandroid.scecompcall://redirect.evil/?code=PRIVATE_CODE','com.scee.psxandroid.scecompcall://redirect/other?code=PRIVATE_CODE','com.scee.psxandroid.scecompcall://user@redirect/?code=PRIVATE_CODE','com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE&error=denied','com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE&code=second','com.scee.psxandroid.scecompcall://redirect/?code=%0APRIVATE_CODE'])assert.equal(api.accessCode({finalUrl}),null);assert.equal(api.accessCode({finalUrl:'com.scee.psxandroid.scecompcall://redirect/?code=v3.PRIVATE_CODE'}).source,'final-url');
});
test('the reported fast 408 failure remains a failure when no validated code is available',async()=>{
 const {api,calls}=setup([{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{event:'error',status:408,statusText:'Failed to fetch PRIVATE_STATUS',finalUrl:'https://ca.account.sony.com/api/authz/v3/oauth/authorize?code=PRIVATE_CODE'}]);api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.complete,false);assert.equal(result.requests.length,0);assert.equal(calls.length,2);assert.equal(api.getToken(),'');assert.equal(result.authRequests[1].hasAccessCode,false);assert.equal(result.authRequests[1].networkReason,'failed-to-fetch');assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
});

test('opt-in helper mode exchanges only with the fixed loopback service and exports no session data',async()=>{
 const npsso='a'.repeat(64),nonce='b'.repeat(48);const {api,calls}=setup([{responseText:JSON.stringify({npsso})},{responseText:JSON.stringify({kind:'ps-game-base-local-trophy-auth',nonce})},{responseText:JSON.stringify({accessToken:'PRIVATE_ACCESS',expiresIn:3600})},{responseText:JSON.stringify({titles:[]})},{responseText:JSON.stringify({trophyTitles:[]})},{responseText:JSON.stringify({definedTrophies:counts})}]);api.setSamples([sample]);await api.runProbe('helper');const result=api.getResult();assert.equal(result.complete,true);assert.equal(result.authMethod,'local-helper');assert.equal(calls.length,6);assert.equal(calls[1].url,'http://127.0.0.1:4176/session');assert.equal(calls[2].url,'http://127.0.0.1:4176/authorize');assert.equal(JSON.parse(calls[2].data).npsso,npsso);assert.equal(JSON.stringify(api.report()).includes(npsso),false);assert.equal(JSON.stringify(api.report()).includes(nonce),false);assert.equal(JSON.stringify(api.report()).includes('PRIVATE_ACCESS'),false);assert.equal(result.authRequests[1].stage,'local-session');assert.equal(result.authRequests[2].stage,'local-access-token');
});
test('invalid helper handshake stops before sending Sony credentials to loopback',async()=>{
 const {api,calls}=setup([{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{responseText:JSON.stringify({kind:'wrong',nonce:'b'.repeat(48)})}]);api.setSamples([sample]);await api.runProbe('helper');assert.equal(calls.length,2);assert.equal(api.getResult().complete,false);assert.equal(calls.some(c=>c.url==='http://127.0.0.1:4176/authorize'),false);
});
test('helper upstream failure records a whitelisted reason without copying response text',async()=>{
 const {api}=setup([{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{responseText:JSON.stringify({kind:'ps-game-base-local-trophy-auth',nonce:'b'.repeat(48)})},{status:502,responseText:JSON.stringify({error:'access_code',message:'PRIVATE_ERROR'})}]);api.setSamples([sample]);await api.runProbe('helper');const result=api.getResult();assert.equal(result.complete,false);assert.equal(result.authRequests[2].helperError,'access_code');assert.equal(JSON.stringify(result).includes('PRIVATE_ERROR'),false);
});

const bridgeSession='00000000-0000-4000-8000-000000000001';
function platinumSetup(responses){
 let finish;const done=new Promise(resolve=>{finish=resolve;});
 const messages=[],opener={postMessage(message,origin){messages.push({message,origin});if(['PSGB_PLATINUM_RESULT','PSGB_PLATINUM_ERROR'].includes(message.type))finish();}},events={};
 const env=setup(responses,{opener,addEventListener:(name,cb)=>{events[name]=cb;}},'#'+new URLSearchParams({psgbPlatinumOrigin:'http://127.0.0.1:4175',psgbPlatinumSession:bridgeSession}));
 return {...env,messages,opener,events,done};
}
const helperResponses=()=>[{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{responseText:JSON.stringify({kind:'ps-game-base-local-trophy-auth',nonce:'b'.repeat(48)})},{responseText:JSON.stringify({accessToken:'PRIVATE_ACCESS',expiresIn:3600})}];
const directResponses=()=>[{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{status:302,responseHeaders:'Location: com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE\r\n'},{responseText:JSON.stringify({access_token:'PRIVATE_ACCESS',expires_in:3600})}];
test('production platinum uses two five-ID workers, handles out-of-order completion and reports completed counts',async()=>{
 const auth=directResponses(),ids=Array.from({length:23},(_,i)=>`PPSA${String(i).padStart(5,'0')}_00`);
 let active=0,maxActive=0,trophyCalls=0;
 const env=platinumSetup(options=>{
  if(auth.length)return auth.shift();
  const batch=new URL(options.url).searchParams.get('npTitleIds').split(',');assert.ok(batch.length<=5);
  active++;maxActive=Math.max(maxActive,active);trophyCalls++;
  const load=options.onload;options.onload=r=>{active--;load(r);};
  return {delayMs:trophyCalls===1?25:3,responseText:JSON.stringify({titles:batch.map(npTitleId=>({npTitleId,trophyTitles:[{earnedTrophies:{platinum:1}}]}))})};
 });
 await env.api.syncPlatinum(ids);
 assert.equal(maxActive,2);assert.equal(active,0);assert.equal(trophyCalls,5);
 const progress=env.messages.filter(m=>m.message.type==='PSGB_PLATINUM_PROGRESS').map(m=>m.message.checked);
 assert.equal(progress.at(-1),23);assert.ok(progress.every((n,i)=>n>=(progress[i-1]||0)&&n<=23));
 assert.deepEqual(Array.from(env.messages.at(-1).message.earnedTitleIds),ids);assert.equal(env.api.getToken(),'');
});

test('production parallel errors stop queued batches and never return partial marks',async()=>{
 for(const failure of [{status:429},{status:401},{status:403},{event:'error'},{responseText:'{}'}]){
  const auth=directResponses(),ids=Array.from({length:30},(_,i)=>`PPSA${String(i).padStart(5,'0')}_00`);let count=0;
  const env=platinumSetup(()=>auth.length?auth.shift():++count===1?{delayMs:2,...failure}:{delayMs:20,responseText:'{"titles":[]}'});
  await env.api.syncPlatinum(ids);
  assert.equal(count,2);assert.equal(env.messages.some(m=>m.message.type==='PSGB_PLATINUM_RESULT'),false);
  assert.equal(env.messages.at(-1).message.type,'PSGB_PLATINUM_ERROR');assert.equal(env.api.getToken(),'');
 }
});

test('cancelling in-flight production workers aborts requests and prevents further dispatch or marks',async()=>{
 const auth=directResponses(),ids=Array.from({length:30},(_,i)=>`PPSA${String(i).padStart(5,'0')}_00`);let count=0;
 const env=platinumSetup(()=>{
  if(auth.length)return auth.shift();
  if(++count===1)setTimeout(()=>env.api.stop(),2);
  return {delayMs:20,responseText:'{"titles":[]}'};
 });
 await env.api.syncPlatinum(ids);assert.equal(count,2);assert.equal(env.api.getToken(),'');
 assert.equal(env.messages.at(-1).message.code,'cancelled');assert.equal(env.messages.some(m=>m.message.type==='PSGB_PLATINUM_RESULT'),false);
});
test('manager platinum sync is dormant, batches by five and returns only earned IDs without credentials',async()=>{
 const ids=Array.from({length:7},(_,i)=>'PPSA0000'+i+'_00'),env=platinumSetup([...directResponses(),{responseText:JSON.stringify({titles:[
  {npTitleId:ids[0],trophyTitles:[{definedTrophies:{platinum:1},earnedTrophies:{platinum:0}}]},
  {npTitleId:ids[1],trophyTitles:[{earnedTrophies:{platinum:1}}]},
  {npTitleId:ids[2],trophyTitles:[{earnedTrophies:{platinum:'1'}}]},
  {npTitleId:'PPSA99999_00',trophyTitles:[{earnedTrophies:{platinum:1},private:'PRIVATE_ACCESS'}]}
 ]})},{responseText:JSON.stringify({titles:[{npTitleId:ids[6],trophyTitles:[{earnedTrophies:{platinum:1}}]}]})}]);
 assert.equal(env.calls.length,0);env.events.message({origin:'http://127.0.0.1:4175',source:env.opener,data:{type:'PSGB_PLATINUM_START',session:bridgeSession,titleIds:ids}});await env.done;assert.equal(env.calls.length,5);
 assert.equal(new URL(env.calls[3].url).searchParams.get('npTitleIds').split(',').length,5);assert.equal(new URL(env.calls[4].url).searchParams.get('npTitleIds').split(',').length,2);
 const result=env.messages.at(-1);assert.equal(result.origin,'http://127.0.0.1:4175');assert.deepEqual(JSON.parse(JSON.stringify(result.message.earnedTitleIds)),[ids[1],ids[6]]);assert.equal(result.message.complete,true);
 for(const secret of ['PRIVATE_ACCESS','a'.repeat(64),'b'.repeat(48),'Authorization','earnedTrophies'])assert.equal(JSON.stringify(env.messages).includes(secret),false);
 assert.equal(env.api.getToken(),'');await env.api.syncPlatinum(ids);assert.equal(env.calls.length,5);
});
test('manager sync ignores untrusted messages and does not query through standalone probe buttons',async()=>{
 const env=platinumSetup([]),data={type:'PSGB_PLATINUM_START',session:bridgeSession,titleIds:[sample.titleId]};
 for(const change of [{origin:'https://untrusted.invalid'},{source:{}},{data:{...data,session:'wrong'}}])env.events.message({origin:'http://127.0.0.1:4175',source:env.opener,data,...change});
 env.api.setSamples([sample]);await env.api.runProbe('helper');assert.equal(env.calls.length,0);
 await env.api.syncPlatinum(['invalid']);assert.equal(env.calls.length,0);assert.equal(env.messages.at(-1).message.code,'input');
});
test('manager sync cannot authorize from an untrusted launch origin',()=>{
 let callback;const opener={postMessage(){throw Error('unexpected');}},env=setup([],{opener,addEventListener:(name,cb)=>{callback=cb;}},'#'+new URLSearchParams({psgbPlatinumOrigin:'https://untrusted.invalid',psgbPlatinumSession:bridgeSession}));
 callback({origin:'https://untrusted.invalid',source:opener,data:{type:'PSGB_PLATINUM_START',session:bridgeSession,titleIds:[sample.titleId]}});assert.equal(env.calls.length,0);
});
test('unknown titles preserve local state; browser auth and later API failures never send a partial apply result',async()=>{
 const unknown=platinumSetup([...directResponses(),{status:404}]);await unknown.api.syncPlatinum([sample.titleId]);assert.equal(unknown.messages.at(-1).message.complete,true);assert.equal(unknown.messages.at(-1).message.earnedTitleIds.length,0);
 for(const responses of [[directResponses()[0],{event:'error',status:0}],[...directResponses(),{status:429,responseText:'PRIVATE_ERROR'}]]){
  const env=platinumSetup(responses);await env.api.syncPlatinum([sample.titleId]);assert.equal(env.messages.some(m=>m.message.type==='PSGB_PLATINUM_RESULT'),false);assert.equal(env.messages.at(-1).message.type,'PSGB_PLATINUM_ERROR');assert.equal(JSON.stringify(env.messages).includes('PRIVATE_'),false);assert.equal(env.api.getToken(),'');
 }
});

test('platinum direct authorization never contacts loopback and only attaches the session cookie to Sony authorize',async()=>{
 const env=platinumSetup([...directResponses(),{responseText:'{"titles":[]}'}]);await env.api.syncPlatinum([sample.titleId]);
 assert.equal(env.messages.at(-1).message.complete,true);assert.equal(env.calls.length,4);
 assert.ok(env.calls.every(c=>new URL(c.url).protocol==='https:'));
 assert.deepEqual(env.calls.map(c=>!!c.cookie),[false,true,false,false]);
 assert.equal(env.calls[1].redirect,'manual');assert.equal(env.calls[2].redirect,'manual');
 const report=JSON.stringify(env.api.report());assert.match(report,/browser-cookie/);
 for(const value of ['a'.repeat(64),'PRIVATE_CODE','PRIVATE_ACCESS','refresh_token'])assert.equal(report.includes(value),false);
});

test('direct auth failure stays failed without silently falling back to localhost or requesting trophies',async()=>{
 const env=platinumSetup([directResponses()[0],{event:'error',status:408,statusText:'Failed to fetch PRIVATE_ERROR'}]);
 await env.api.syncPlatinum([sample.titleId]);assert.equal(env.calls.length,2);
 assert.equal(env.messages.at(-1).message.code,'auth');assert.equal(env.api.getToken(),'');
 assert.equal(env.api.report().authRequests.at(-1).explicitSessionCookie,true);
 assert.equal(env.api.report().requests.length,0);assert.equal(JSON.stringify(env.api.report()).includes('PRIVATE_ERROR'),false);
});

test('explicit Sony session cookie cannot be forwarded to trophy, helper or other Sony routes',()=>{
 const {api,calls}=setup();
 for(const url of ['http://127.0.0.1:4176/authorize','https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles','https://ca.account.sony.com/api/authz/v3/oauth/token'])assert.throws(()=>api.request(url,{redirect:'manual',cookie:'npsso='+'a'.repeat(64)}));
 assert.equal(calls.length,0);
});
test('stopping manager sync aborts authorization and never applies late results',async()=>{
 const env=platinumSetup(directResponses()),pending=env.api.syncPlatinum([sample.titleId]);env.api.stop();await pending;
 assert.equal(env.messages.some(m=>m.message.type==='PSGB_PLATINUM_RESULT'),false);assert.equal(env.messages.at(-1).message.code,'cancelled');assert.equal(env.api.getToken(),'');
});

const benchmarkSamples=(count=30)=>Array.from({length:count},(_,i)=>({...sample,titleId:'PPSA'+String(i).padStart(5,'0')+'_00',name:'Synthetic '+i}));
function benchmarkTransport({mode='reject',matched=true,failAt=0,status=429}={}){
 let queries=0;
 return options=>{
  const url=new URL(options.url);
  if(url.pathname==='/api/v1/ssocookie')return {responseText:JSON.stringify({npsso:'a'.repeat(64)})};
  if(url.pathname==='/session')return {responseText:JSON.stringify({kind:'ps-game-base-local-trophy-auth',nonce:'b'.repeat(48)})};
  if(url.pathname==='/authorize')return {responseText:JSON.stringify({accessToken:'PRIVATE_ACCESS',expiresIn:3600})};
  queries++;const ids=url.searchParams.get('npTitleIds').split(',');
  if(queries===failAt)return {status,delayMs:2,responseHeaders:'Retry-After: 9\r\n',responseText:'PRIVATE_ERROR'};
  if(ids.length>5&&mode==='reject')return {status:400,delayMs:2,responseText:'PRIVATE_ERROR'};
  const returned=ids.length>5&&mode==='truncate'?ids.slice(0,5):ids;
  return {delayMs:2,responseText:JSON.stringify({titles:returned.map(id=>({npTitleId:id,trophyTitles:matched?[{...trophy,npCommunicationId:'NPWR'+id.slice(4,9)+'_00',private:'PRIVATE_RESPONSE'}]:[]})),private:'PRIVATE_RESPONSE'})};
 };
}
test('benchmark is opt-in, requires 15 candidates and cannot run in manager sync mode',async()=>{
 const env=setup(benchmarkTransport(),{},'',true);env.api.setSamples(benchmarkSamples(14));assert.equal(env.calls.length,0);await env.api.runBenchmark();assert.equal(env.calls.length,0);assert.match(env.nodes.get('message').textContent,/至少需要 15/);
 const manager=platinumSetup([]);manager.api.setSamples(benchmarkSamples());await manager.api.runBenchmark();assert.equal(manager.calls.length,0);
});
test('benchmark sends real 10/15 requests, handles rejection and bounds speed trials to 30 IDs and 3 workers',async()=>{
 const env=setup(benchmarkTransport(),{},'',true);env.api.setSamples(benchmarkSamples(45));await env.api.runBenchmark();const result=env.api.getResult();
 assert.equal(result.complete,true);assert.equal(result.kind,'ps-game-base-trophy-benchmark');assert.equal(result.sampleCount,30);assert.equal(result.requests.length,26);assert.equal(env.calls.length,29);
 assert.deepEqual(JSON.parse(JSON.stringify(result.limitTests.map(row=>[row.requestedCount,row.status]))),[[5,200],[10,400],[15,400]]);
 assert.deepEqual(JSON.parse(JSON.stringify(result.profiles.map(p=>p.maxInFlight))),[1,1,2,3]);assert.equal(result.profiles.every(p=>p.sameResultAsBaseline&&p.requestCount===6&&p.successCount===6),true);
 for(const p of result.profiles){assert.ok(p.meanRequestMs>0);assert.ok(p.projected1800Ms>=0);assert.equal(p.intervalMs,p.id==='sequential-350'?350:0);}
 for(const call of env.calls.filter(c=>new URL(c.url).hostname==='m.np.playstation.com')){const ids=new URL(call.url).searchParams.get('npTitleIds').split(',');assert.equal(new Set(ids).size,ids.length);}
 for(const secret of ['PRIVATE_ACCESS','PRIVATE_RESPONSE','PRIVATE_ERROR','a'.repeat(64),'b'.repeat(48)])assert.equal(JSON.stringify(env.api.report()).includes(secret),false);
 assert.equal(env.api.getToken(),'');assert.equal(env.api.getBusy(),false);assert.equal(env.nodes.get('export').disabled,false);
});
test('benchmark distinguishes accepted larger batches from HTTP 200 silently truncated responses',async()=>{
 for(const mode of ['accept','truncate']){
  const env=setup(benchmarkTransport({mode}),{},'',true);env.api.setSamples(benchmarkSamples(15));await env.api.runBenchmark();const result=env.api.getResult();assert.equal(result.complete,true);
  for(const row of result.limitTests.slice(1)){assert.equal(row.status,200);assert.equal(row.sameResultAsBaseline,mode==='accept');assert.equal(row.verdict,mode==='accept'?'matches-baseline':'response-differs');assert.equal(row.returnedCount,mode==='accept'?row.requestedCount:5);assert.equal(row.titleIds.at(-1),'PPSA00000_00');}
 }
});
test('benchmark does not claim a larger limit proven when every title is unmatched',async()=>{
 const env=setup(benchmarkTransport({mode:'accept',matched:false}),{},'',true);env.api.setSamples(benchmarkSamples(15));await env.api.runBenchmark();
 for(const row of env.api.getResult().limitTests.slice(1)){assert.equal(row.sameResultAsBaseline,true);assert.equal(row.verdict,'insufficient-tail-evidence');assert.equal(row.matchedBeyondFive,0);}
});
test('rate limit or expired authentication stops the benchmark without retrying or raising concurrency',async()=>{
 for(const status of [429,401,403]){
  const env=setup(benchmarkTransport({failAt:15,status}),{},'',true);env.api.setSamples(benchmarkSamples());await env.api.runBenchmark();const result=env.api.getResult();
  assert.equal(result.complete,false);assert.equal(result.stopReason,status===429?'rate-limit':'auth');assert.equal(result.profiles.length,3);assert.equal(result.profiles.at(-1).id,'parallel-2');assert.ok(result.requests.length<=16);assert.equal(env.api.getToken(),'');
  if(status===429)assert.equal(result.profiles.at(-1).requests.find(row=>row.status===429).retryAfterSeconds,9);
  assert.equal(JSON.stringify(result).includes('PRIVATE_ERROR'),false);
 }
});
test('stop cancels in-flight benchmark workers and keeps an exportable partial report',async()=>{
 const transport=benchmarkTransport();let env,queries=0;
 env=setup(options=>{const response=transport(options);if(new URL(options.url).hostname==='m.np.playstation.com'&&++queries===15)setImmediate(()=>env.api.stop());return response;},{},'',true);
 env.api.setSamples(benchmarkSamples());await env.api.runBenchmark();const result=env.api.getResult();assert.equal(result.complete,false);assert.equal(result.stopReason,'cancelled');assert.ok(result.requests.length<=16);assert.equal(env.api.getToken(),'');assert.equal(env.nodes.get('export').disabled,false);
});
