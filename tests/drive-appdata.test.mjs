import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/shared/drive-appdata.js',import.meta.url),'utf8');
const file={id:'file-1',name:'ps-game-base.json',version:'7',size:'20'};
const metadata={id:file.id,title:file.name,version:file.version,fileSize:file.size,modifiedDate:'2026-10-17T00:00:00Z',etag:'"resource-7"'};
const value={schemaVersion:1,personal:{note:'cloud'}};
const expected=()=>({file:{...file},etag:metadata.etag,value});
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers});
function setup(responses){
 const calls=[],auth={token:()=> 'synthetic-token',invalidate(){this.invalidated=true;}};
 const context={window:{},AbortController,setTimeout,clearTimeout,URLSearchParams,crypto,
  async fetch(url,options){calls.push({url:new URL(url),options});assert.ok(responses.length,'unexpected Drive request');return responses.shift()();}};
 vm.runInNewContext(source,context);
 return {drive:new context.window.SideProjectDrive.DriveAppData(auth,file.name),calls,auth};
}

test('read uses resource JSON ETag when no response exposes an ETag header, then uploads conditionally',async()=>{
 const {drive,calls}=setup([
  ()=>reply({files:[file]}),()=>reply(value),()=>reply(metadata),
  ()=>reply({files:[file]}),()=>reply({})
 ]);
 const snapshot=await drive.read();
 assert.equal(snapshot.etag,metadata.etag);assert.deepEqual(JSON.parse(JSON.stringify(snapshot.value)),value);
 assert.equal(snapshot.file.name,file.name);assert.equal(snapshot.file.modifiedTime,metadata.modifiedDate);assert.equal(snapshot.file.size,file.size);
 assert.equal(calls[2].url.pathname,'/drive/v2/files/file-1');
 assert.equal(calls[2].url.searchParams.get('fields'),'id,title,version,modifiedDate,fileSize,etag');
 await drive.write({personal:{note:'merged'}},snapshot);
 assert.equal(calls[4].url.pathname,'/upload/drive/v2/files/file-1');
 assert.equal(calls[4].url.searchParams.get('uploadType'),'media');
 assert.equal(calls[4].options.method,'PUT');assert.equal(calls[4].options.headers['If-Match'],metadata.etag);
 assert.deepEqual(JSON.parse(calls[4].options.body),{personal:{note:'merged'}});
});

test('media ETag cannot replace the file resource ETag',async()=>{
 const {drive}=setup([()=>reply({files:[file]}),()=>reply(value,200,{ETag:'"content-hash"'}),()=>reply(metadata)]);
 assert.equal((await drive.read()).etag,metadata.etag);
});

test('cloud changes during download reject the snapshot',async()=>{
 const {drive}=setup([()=>reply({files:[file]}),()=>reply(value),()=>reply({...metadata,version:'8'})]);
 await assert.rejects(drive.read(),{code:'conflict'});
});

test('missing versions cannot establish a safe download snapshot',async()=>{
 const {drive}=setup([()=>reply({files:[{...file,version:undefined}]}),()=>reply(value),()=>reply({...metadata,version:undefined})]);
 await assert.rejects(drive.read(),{code:'conflict'});
});

test('changed or replaced cloud files block upload before any mutation',async()=>{
 for(const changed of [{...file,version:'8'},{...file,id:'replacement'},null]){
  const {drive,calls}=setup([()=>reply({files:changed?[changed]:[]})]);
  await assert.rejects(drive.write(value,expected()),{code:'conflict'});assert.equal(calls.length,1);
 }
});

test('missing, weak, wildcard and malformed ETags never cause unprotected writes',async()=>{
 for(const etag of [undefined,null,'','*','W/"resource-7"','unquoted','"bad\r\ntag"']){
  const {drive,calls}=setup([()=>reply({files:[file]})]);
  await assert.rejects(drive.write(value,{...expected(),etag}),{code:'invalid'});assert.equal(calls.length,1);
 }
});

test('missing versions block upload even if both version fields are absent',async()=>{
 const {drive,calls}=setup([()=>reply({files:[{...file,version:undefined}]})]);
 await assert.rejects(drive.write(value,{...expected(),file:{...file,version:undefined}}),{code:'conflict'});assert.equal(calls.length,1);
});

test('If-Match precondition failure is surfaced as conflict without retrying a stale write',async()=>{
 const {drive,calls}=setup([()=>reply({files:[file]}),()=>reply({},412)]);
 await assert.rejects(drive.write(value,expected()),{code:'conflict'});assert.equal(calls.length,2);
 assert.equal(calls[1].options.headers['If-Match'],metadata.etag);
});

test('first backup creation remains a v3 multipart upload to appDataFolder',async()=>{
 const {drive,calls}=setup([()=>reply({files:[]}),()=>reply({id:file.id})]);
 await drive.write(value,null);assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].url.pathname,'/upload/drive/v3/files');
 assert.match(calls[1].options.body,/"parents":\["appDataFolder"\]/);assert.match(calls[1].options.body,/"name":"ps-game-base.json"/);
});

test('duplicates and a new file appearing after an empty preview block upload',async()=>{
 const duplicate=setup([()=>reply({files:[file,{...file,id:'duplicate'}]})]);
 await assert.rejects(duplicate.drive.write(value,expected()),{code:'duplicate'});assert.equal(duplicate.calls.length,1);
 const appeared=setup([()=>reply({files:[file]})]);
 await assert.rejects(appeared.drive.write(value,null),{code:'conflict'});assert.equal(appeared.calls.length,1);
});

test('metadata authorization errors invalidate auth and do not write',async()=>{
 const {drive,calls,auth}=setup([()=>reply({files:[file]}),()=>reply(value),()=>reply({},401)]);
 await assert.rejects(drive.read(),{code:'expired'});assert.equal(auth.invalidated,true);assert.equal(calls.length,3);
});

test('missing metadata ETag still allows read-only comparison, but blocks upload',async()=>{
 const {drive,calls}=setup([()=>reply({files:[file]}),()=>reply(value),()=>reply({...metadata,etag:undefined}),()=>reply({files:[file]})]);
 const snapshot=await drive.read();assert.equal(snapshot.etag,undefined);
 await assert.rejects(drive.write(value,snapshot),{code:'invalid'});assert.equal(calls.length,4);
});
