const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../dist/scripts/ps-game-base.user.js'),'utf8');

function boot(hash='',hostname='library.playstation.com'){
 const messages=[],callbacks=[],fetches=[],gm=[];
 function XHR(){};for(const method of ['open','send','setRequestHeader'])XHR.prototype[method]=function(){};
 const game={name:'Synthetic',entitlementId:'synthetic',titleId:'PPSA00001_00',platform:'PS5'};
 const page={XMLHttpRequest:XHR,addEventListener(){},opener:{postMessage:(value,origin)=>messages.push({value,origin})},fetch(url,options){
  fetches.push({url,options});const data={data:{purchasedTitlesRetrieve:{games:[game]}}};
  return Promise.resolve({status:200,url:String(url),clone:()=>({json:async()=>data}),json:async()=>data});
 }};
 const context=vm.createContext({URL,URLSearchParams,Headers,Request,AbortController,Blob,console,setTimeout,clearTimeout,queueMicrotask,
  location:{hostname,hash,href:`https://${hostname}/recently-purchased${hash}`},
  window:{fetch(){throw Error('must use official page realm');}},unsafeWindow:page,
  document:{readyState:'loading',body:null,addEventListener:(name,callback)=>callbacks.push({name,callback})},
  GM_xmlhttpRequest:options=>{gm.push(options);throw Error('unexpected background trophy request');}
 });
 vm.runInContext(source,context);return {page,messages,callbacks,fetches,gm};
}

test('one installed script preserves official library bridge in the unsafeWindow realm without background trophies',async()=>{
 const session='11111111-1111-4111-8111-111111111111',origin='http://127.0.0.1:4175';
 const env=boot('#'+new URLSearchParams({psgbOrigin:origin,psgbSession:session}));
 assert.equal(env.callbacks.filter(c=>c.name==='DOMContentLoaded').length,1);
 const url=new URL('https://web.np.playstation.com/api/graphql/v1/op');url.searchParams.set('operationName','getPurchasedGameList');url.searchParams.set('extensions',JSON.stringify({persistedQuery:{sha256Hash:'a'.repeat(64)}}));
 await env.page.fetch(url.href,{headers:{Authorization:'Bearer PRIVATE_TEST'}});await new Promise(setImmediate);
 const result=env.messages.find(m=>m.value.type==='PSGB_RESULT');assert.ok(result);
 assert.equal(result.origin,origin);assert.equal(result.value.session,session);assert.equal(result.value.payload.games.length,1);
 assert.equal(env.fetches.filter(c=>c.options?.signal).length,1);assert.equal(env.gm.length,0);
 assert.equal(JSON.stringify(env.messages).includes('PRIVATE_TEST'),false);
});

test('platinum bridge mounts only platinum UI and never launches digital library scanning',()=>{
 const env=boot('#'+new URLSearchParams({psgbPlatinumOrigin:'http://127.0.0.1:4175',psgbPlatinumSession:'11111111-1111-4111-8111-111111111111'}));
 assert.equal(env.callbacks.length,1);assert.match(String(env.callbacks[0].callback),/sendPlatinum/);
 assert.equal(env.fetches.length,0);assert.equal(env.gm.length,0);
});

test('store page retains the library launcher without installing trophy hooks or making requests',()=>{
 const env=boot('','store.playstation.com');assert.equal(env.callbacks.length,1);
 assert.equal(env.fetches.length,0);assert.equal(env.gm.length,0);
 assert.equal((source.match(/==UserScript==/g)||[]).length,1);
 assert.match(source,/@name\s+PS Game Base 遊戲庫/);assert.match(source,/@namespace\s+personal\.ps-game-base\s/);
});
