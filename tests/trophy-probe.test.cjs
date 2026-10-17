const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/scripts/ps-game-base-trophy-probe.user.js'),'utf8');
const counts={bronze:30,silver:10,gold:3,platinum:1};
const trophy={npCommunicationId:'NPWR00001_00',npServiceName:'trophy2',trophyTitleName:'Test game',trophyTitlePlatform:'PS5',definedTrophies:counts,earnedTrophies:{bronze:3,silver:0,gold:0,platinum:0},progress:4,lastUpdatedDateTime:'2026-10-17T00:00:00Z'};
function setup(responses=[],browser={}){
 const calls=[],nodes=new Map();
 const node=()=>({children:[],checked:true,disabled:false,append(...n){this.children.push(...n);},replaceChildren(...n){this.children=n;},setAttribute(){}});
 const root={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
 function XHR(){}XHR.prototype.open=function(){};XHR.prototype.send=function(){};
 const context={URL,URLSearchParams,Map,Set,WeakMap,Date,Headers,Blob,Number,Error,Promise,setTimeout,clearTimeout,
  location:{href:'https://library.playstation.com/recently-purchased'},
  window:{fetch:async()=>({clone:()=>({json:async()=>({})})}),XMLHttpRequest:XHR},
  document:{body:null,addEventListener(){},createElement:node,createTextNode:text=>text},
  GM_info:{scriptHandler:'Tampermonkey',version:'test-version'},
  GM_xmlhttpRequest(options){calls.push(options);const next=responses.shift();if(next?.event==='throw')throw Error('PRIVATE_EXCEPTION');let aborted=false;const handle={abort(){aborted=true;options.onabort();}};setImmediate(()=>{if(aborted)return;if(!next||next.event==='error')options.onerror(next);else options.onload({status:200,responseHeaders:'',...next});});return handle;}};
 Object.defineProperties(context.window,Object.getOwnPropertyDescriptors(browser));
 vm.createContext(context);
 const exposed=source.replace(/\}\)\(\);\s*$/,'globalThis.probe={accessCode,requestUrl,report,getCapture:()=>capture,getPage:()=>page,summarize,sampleGames,libraryResponse,runProbe,stop,authorize,request,setRoot(v){root=v;},setToken(v){token=v;expires=Date.now()+60000;},setSamples(games){samples=new Map(games.map(g=>[g.titleId,g]));selected=new Set(games.map(g=>g.titleId));},getResult:()=>result,getToken:()=>token,getSamples:()=>[...samples.values()]};})();');
 vm.runInContext(exposed,context);context.probe.setRoot(root);return {api:context.probe,calls,nodes};
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
 ]);api.setSamples([sample]);await api.runProbe();const result=api.getResult();assert.equal(result.complete,true);assert.equal(calls.length,6);assert.equal(api.getToken(),'PRIVATE_ACCESS');assert.equal(calls[1].redirect,'manual');assert.equal(calls[2].method,'POST');assert.equal(calls[0].redirect,undefined);assert.equal(calls[2].redirect,undefined);assert.equal(result.authRequests.length,3);assert.equal(result.authRequests[1].redirectTarget,'psn-app');assert.equal(result.authRequests[0].stage,'sony-session');
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
 const result=api.getResult();assert.equal(result.probeVersion,'0.1.5');assert.equal(result.manager.version,'test-version');assert.equal(result.requests.length,0);assert.equal(result.authRequests.length,1);assert.equal(result.authRequests[0].stage,'sony-session');assert.equal(result.authRequests[0].outcome,'network');assert.equal(result.authRequests[0].status,0);assert.equal(result.authRequests[0].transport,'default');assert.match(result.error,/Sony 登入工作階段/);assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
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

test('authorize keeps the browser cookie jar without a manual Cookie header in fetch mode',async()=>{
 const {api,calls}=setup([{responseText:JSON.stringify({npsso:'a'.repeat(64)})},{status:302,responseHeaders:'Location: com.scee.psxandroid.scecompcall://redirect/?code=PRIVATE_CODE\r\n'},{responseText:JSON.stringify({access_token:'PRIVATE_ACCESS',expires_in:3600})},{responseText:JSON.stringify({titles:[]})},{responseText:JSON.stringify({trophyTitles:[]})},{responseText:JSON.stringify({definedTrophies:counts})}]);api.setSamples([sample]);await api.runProbe();assert.equal(api.getResult().complete,true);assert.equal(calls[1].redirect,'manual');assert.equal(calls[1].headers?.Cookie,undefined);assert.notEqual(calls[0].anonymous,true);assert.notEqual(calls[1].anonymous,true);
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
