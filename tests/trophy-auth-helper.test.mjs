import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHelper,exchangeSession} from '../tools/trophy-auth-helper.mjs';

const NPSSO='a'.repeat(64),CLIENT={'X-PSGB-Client':'trophy-probe'};
const goodRedirect=()=>new Response(null,{status:302,headers:{Location:'com.scee.psxandroid.scecompcall://redirect/?code=v3.PRIVATE_CODE'}});
function sony(){const calls=[];return {calls,fetch:async(url,options)=>{calls.push({url,options});return calls.length%2?goodRedirect():Response.json({access_token:'PRIVATE_ACCESS',expires_in:3600,refresh_token:'PRIVATE_REFRESH',id_token:'PRIVATE_ID'});}};}
async function start(t,fetchImpl){const server=createHelper({fetchImpl});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));const base='http://127.0.0.1:'+server.address().port;return {server,base,session:async()=>{const r=await fetch(base+'/session',{headers:CLIENT});assert.equal(r.status,200);return r.json();},post:(data,headers={})=>fetch(base+'/authorize',{method:'POST',headers:{...CLIENT,'Content-Type':'application/json',...headers},body:JSON.stringify(data)})};}

test('loopback helper completes the server-side exchange and returns only the short-lived token',async t=>{
 const upstream=sony(),helper=await start(t,upstream.fetch),session=await helper.session();assert.equal(helper.server.address().address,'127.0.0.1');
 const r=await helper.post({nonce:session.nonce,npsso:NPSSO});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const result=await r.json();assert.deepEqual(result,{accessToken:'PRIVATE_ACCESS',expiresIn:3600});assert.equal(upstream.calls.length,2);assert.equal(upstream.calls[0].options.redirect,'manual');assert.equal(upstream.calls[0].options.headers.Cookie,'npsso='+NPSSO);assert.equal(upstream.calls[1].options.body.get('code'),'v3.PRIVATE_CODE');assert.equal(JSON.stringify(result).includes('PRIVATE_REFRESH'),false);
});
test('untrusted origin, rebinding host and missing client header cannot get a helper session',async t=>{
 const upstream=sony(),helper=await start(t,upstream.fetch);
 for(const headers of [{...CLIENT,Origin:'https://untrusted.invalid'},{...CLIENT,Host:'untrusted.invalid'},{}]){const status=await new Promise((resolve,reject)=>{http.get(helper.base+'/session',{headers},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject);});assert.equal(status,403);}
 assert.equal(upstream.calls.length,0);
});
test('invalid nonce and malformed Sony session are rejected before any upstream request',async t=>{
 const upstream=sony(),helper=await start(t,upstream.fetch),session=await helper.session();
 for(const data of [{nonce:'0'.repeat(48),npsso:NPSSO},{nonce:'中'.repeat(48),npsso:NPSSO},{nonce:session.nonce,npsso:'invalid'}]){const r=await helper.post(data);assert.ok([400,403].includes(r.status));}
 assert.equal(upstream.calls.length,0);
});
test('helper rejects wrong content type and oversized bodies without starting authentication',async t=>{
 const upstream=sony(),helper=await start(t,upstream.fetch);let r=await helper.post({}, {'Content-Type':'text/plain'});assert.equal(r.status,415);r=await helper.post({data:'x'.repeat(5000)});assert.equal(r.status,413);assert.equal(upstream.calls.length,0);
});
test('unexpected Sony redirect is not followed and produces a safe public error',async t=>{
 let calls=0;const helper=await start(t,async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/?code=PRIVATE_CODE'}});}),session=await helper.session();
 const r=await helper.post({nonce:session.nonce,npsso:NPSSO});assert.equal(r.status,502);const result=await r.json();assert.equal(result.error,'access_code');assert.equal(JSON.stringify(result).includes('PRIVATE_CODE'),false);assert.equal(calls,1);
});
test('upstream exceptions including code and message cannot leak credentials through the helper',async t=>{
 const helper=await start(t,async()=>{throw Object.assign(Error('PRIVATE_ACCESS '+NPSSO),{code:'PRIVATE_CODE'});}),session=await helper.session();const r=await helper.post({nonce:session.nonce,npsso:NPSSO});const result=await r.json();assert.equal(r.status,502);assert.equal(result.error,'network');assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);assert.equal(JSON.stringify(result).includes(NPSSO),false);
});
test('only one authorization runs at a time',async t=>{
 let release,entered;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{entered=resolve;});let count=0;
 const helper=await start(t,async()=>{if(count++===0){entered();await gate;return goodRedirect();}return Response.json({access_token:'PRIVATE_ACCESS',expires_in:3600});}),session=await helper.session();
 const first=helper.post({nonce:session.nonce,npsso:NPSSO});await ready;const second=await helper.post({nonce:session.nonce,npsso:NPSSO});assert.equal(second.status,429);release();assert.equal((await first).status,200);
});
test('helper forwards cancellation to its Sony transport',async()=>{
 const controller=new AbortController();let observed;const pending=exchangeSession(NPSSO,async(url,options)=>{observed=options.signal;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));},controller.signal);controller.abort();await assert.rejects(pending);assert.equal(observed.aborted,true);
});
