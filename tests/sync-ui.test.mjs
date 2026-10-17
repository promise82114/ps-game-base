// Exercise the real app event handlers with a small synthetic DOM and Drive.
// This verifies data flow and failures; it is not browser layout verification.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../dist/model.js';
import * as sync from '../dist/sync.js';
const KEY='ps-game-base.v1',RECOVERY=KEY+'.before-import';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const fixture=(note='local',ids=['a'])=>({library:{schemaVersion:1,complete:true,games:ids.map(id=>({name:'Game '+id,entitlementId:id,conceptId:id,platform:'PS5'})),missingIds:[]},personal:{...model.emptyPersonal(),works:{'concept:a':{...model.blankRecord(),status:'已白金',note}}}});
const backup=data=>({schemaVersion:1,kind:'ps-game-base-backup',...data,missingIds:[],exportedAt:'2026-10-17T00:00:00Z'});
function setup(initial=fixture()){
 class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.value='';this.open=false;this.hidden=false;this.disabled=false;this.textContent='';this.classList={add(){},remove(){},toggle(){}};}
  append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&this.children.length===nodes.length)this.value=nodes[0]?.value||'';}
  prepend(n){this.children.unshift(n);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,callback){this.listeners[name]=callback;}
  querySelectorAll(selector){const all=this.children.flatMap(n=>n instanceof Node?[n,...n.querySelectorAll('*')]:[]);if(selector==='*')return all;if(selector==='button,select')return all.filter(n=>['button','select'].includes(n.tag));if(selector==='[data-classification]')return [];return all.filter(n=>n.tag===selector);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||new Node(selector);}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.close?.();}
  showPopover(){this.popoverOpen=true;}
  hidePopover(){this.popoverOpen=false;}
  matches(selector){return selector===':popover-open'&&!!this.popoverOpen;}
  click(){}
  remove(){}
 }
 const nodes=new Map();for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g))nodes.set(m[2],new Node(m[1]));
 const storage=new Map([[KEY,JSON.stringify(initial)]]),windowEvents={},io={reads:0,writes:[],remote:null,writeError:null,failKey:null};
 class Auth{get connected(){return true;}disconnect(){} }
 class Drive{async read(){io.reads++;return structuredClone(io.remote);}async write(value,expected){if(io.writeError)throw Error(io.writeError);io.writes.push({value,expected});}}
 const context={...model,...sync,console,structuredClone,Blob,URL,crypto:{randomUUID:()=> 'test'},setTimeout:()=>1,clearTimeout(){},confirm:()=>true,
  icon:()=>new Node('svg'),document:{getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag),createTextNode:text=>text,querySelectorAll:()=>[]},
  localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(key===io.failKey)throw Error('quota');storage.set(key,value);}},
  window:{SideProjectAuth:{GoogleAuth:Auth},SideProjectDrive:{DriveAppData:Drive},addEventListener:(name,cb)=>{windowEvents[name]=cb;}},location:{origin:'http://test.invalid'}};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.appTest={preview,getState:()=>state,getPending:()=>pendingImport};',context);
 return {nodes,storage,io,windowEvents,app:context.appTest};
}
test('preview and cancel do not write data',()=>{
 const {nodes,storage,app}=setup(),before=storage.get(KEY);nodes.get('data-dialog').showModal();
 app.preview(fixture('cloud'),'test.json');assert.equal(nodes.get('confirm-dialog').open,true);assert.equal(storage.get(KEY),before);assert.equal(storage.has(RECOVERY),false);
 nodes.get('confirm-dialog').close();assert.equal(app.getPending(),null);assert.equal(storage.get(KEY),before);
});
test('default confirmation saves recovery first and preserves local conflicts',async()=>{
 const {nodes,storage,app}=setup(),before=storage.get(KEY);app.preview(fixture('cloud',['a','b']),'cloud');await nodes.get('confirm-import').onclick();
 assert.equal(app.getState().personal.works['concept:a'].note,'local');assert.equal(app.getState().library.games.length,2);
 const recovery=JSON.parse(storage.get(RECOVERY));assert.equal(recovery.personal.works['concept:a'].note,'local');assert.equal(recovery.library.games.length,1);
 assert.notEqual(storage.get(KEY),before);assert.equal(nodes.get('confirm-dialog').open,false);assert.equal(nodes.get('notice').popoverOpen,true);assert.match(nodes.get('data-notice').textContent,/已依比較結果/);assert.equal(nodes.get('data-notice').hidden,false);
});
test('bulk incoming conflict choice is honored and saved',async()=>{
 const {nodes,app}=setup();app.preview(fixture('cloud'),'cloud');nodes.get('choose-incoming').onclick();await nodes.get('confirm-import').onclick();assert.equal(app.getState().personal.works['concept:a'].note,'cloud');
});
test('keep and replace modes use the selected policy rather than hidden conflict choices',async()=>{
 for(const [mode,note] of [['keep','local'],['replace','cloud']]){
  const {nodes,app}=setup();app.preview(fixture('cloud',['a','b']),'cloud');nodes.get('import-mode').value=mode;nodes.get('import-mode').onchange();await nodes.get('confirm-import').onclick();assert.equal(app.getState().personal.works['concept:a'].note,note);assert.equal(app.getState().library.games.length,2);
 }
});
test('download compares without applying, and export feedback remains visible inside data dialog',async()=>{
 const {nodes,storage,app,io}=setup(),before=storage.get(KEY);io.remote={file:{id:'f',version:'1'},etag:'v1',value:backup(fixture('cloud'))};
 nodes.get('data-dialog').showModal();await nodes.get('cloud-read').onclick();assert.equal(app.getPending().plan.counts.conflict,1);assert.equal(storage.get(KEY),before);assert.equal(io.writes.length,0);
 nodes.get('confirm-dialog').close();nodes.get('export-personal').onclick();assert.equal(nodes.get('data-notice').hidden,false);assert.match(nodes.get('data-notice').textContent,/已匯出個人分類/);assert.equal(nodes.get('notice').popoverOpen,true);
});
test('recovery failure prevents applying any import',async()=>{
 const {nodes,storage,app,io}=setup(),before=storage.get(KEY);io.failKey=RECOVERY;app.preview(fixture('cloud'),'cloud');await nodes.get('confirm-import').onclick();
 assert.equal(storage.get(KEY),before);assert.equal(app.getState().personal.works['concept:a'].note,'local');assert.match(nodes.get('import-notice').textContent,/無法保存操作前備份/);assert.equal(nodes.get('confirm-dialog').open,true);
});
test('storage failure keeps the old in-memory and persisted state',async()=>{
 const {nodes,storage,app,io}=setup(),before=storage.get(KEY);io.failKey=KEY;app.preview(fixture('cloud'),'cloud');nodes.get('choose-incoming').onclick();await nodes.get('confirm-import').onclick();
 assert.equal(storage.get(KEY),before);assert.equal(app.getState().personal.works['concept:a'].note,'local');assert.match(nodes.get('import-notice').textContent,/本機儲存失敗/);
});
test('upload reads a fresh cloud snapshot, previews without writes, then merges both sides',async()=>{
 const {nodes,storage,app,io}=setup();io.remote={file:{id:'f',version:'2',modifiedTime:'2026-10-17T00:00:00Z'},etag:'v2',value:backup(fixture('cloud',['a','b']))};
 await nodes.get('cloud-write').onclick();assert.equal(io.reads,1);assert.equal(io.writes.length,0);assert.equal(app.getPending().action,'upload');assert.equal(app.getState().library.games.length,1);
 await nodes.get('confirm-import').onclick();assert.equal(io.writes.length,1);assert.equal(io.writes[0].expected.etag,'v2');assert.equal(io.writes[0].value.personal.works['concept:a'].note,'local');assert.equal(io.writes[0].value.library.games.length,2);assert.equal(JSON.parse(storage.get(KEY)).library.games.length,2);
});
test('cloud version failure preserves local progress and keeps actionable feedback in modal',async()=>{
 const {nodes,storage,app,io}=setup(),before=storage.get(KEY);io.writeError='雲端進度已變更';await nodes.get('cloud-write').onclick();await nodes.get('confirm-import').onclick();
 assert.equal(storage.get(KEY),before);assert.equal(app.getState().personal.works['concept:a'].note,'local');assert.equal(nodes.get('confirm-dialog').open,true);assert.match(nodes.get('import-notice').textContent,/雲端進度已變更/);assert.equal(nodes.get('notice').popoverOpen,true);
});
test('another tab changing storage blocks both import and cloud writes',async()=>{
 const {nodes,storage,app,io,windowEvents}=setup(),before=storage.get(KEY);await nodes.get('cloud-write').onclick();windowEvents.storage({key:KEY});await nodes.get('confirm-import').onclick();
 assert.equal(io.writes.length,0);assert.equal(storage.get(KEY),before);assert.equal(app.getState().personal.works['concept:a'].note,'local');assert.match(nodes.get('import-notice').textContent,/另一分頁/);
});
test('changed local content invalidates the old preview and resets conflict choices',async()=>{
 const {nodes,storage,app}=setup(),before=storage.get(KEY);app.preview(fixture('cloud'),'cloud');nodes.get('choose-incoming').onclick();app.getState().personal.works['concept:a'].note='new local';await nodes.get('confirm-import').onclick();
 assert.equal(app.getState().personal.works['concept:a'].note,'new local');assert.equal(storage.get(KEY),before);assert.equal(Object.keys(app.getPending().choices).length,0);assert.match(nodes.get('import-notice').textContent,/已重新比較/);
});
