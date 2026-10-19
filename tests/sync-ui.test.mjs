// Exercise the real app event handlers with a small synthetic DOM and Drive.
// This verifies data flow and failures; it is not browser layout verification.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../dist/model.js';
import * as sync from '../dist/sync.js';
import * as platinum from '../dist/platinum.js';
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
 const context={...model,...sync,...platinum,console,structuredClone,Blob,URL,URLSearchParams,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},setTimeout(callback,ms){io.timers??=[];io.timers.push({callback,ms});return io.timers.length;},clearTimeout(){},confirm:()=>true,
  icon:()=>new Node('svg'),document:{getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag),createTextNode:text=>text,querySelectorAll:()=>[]},
  localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(key===io.failKey)throw Error('quota');storage.set(key,value);}},
  window:{SideProjectAuth:{GoogleAuth:Auth},SideProjectDrive:{DriveAppData:Drive},open(url){if(io.popupBlocked)return null;io.opened={url,messages:[],postMessage(message,origin){this.messages.push({message,origin});}};return io.opened;},addEventListener:(name,cb)=>{const before=windowEvents[name];windowEvents[name]=event=>{before?.(event);cb(event);};}},location:{origin:'http://test.invalid'}};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.appTest={preview,getState:()=>state,getPending:()=>pendingImport};',context);
 return {nodes,storage,io,windowEvents,app:context.appTest};
}
test('header data entry opens the panel and keeps all data actions inside with one script installer',()=>{
 const {nodes}=setup();nodes.get('settings').onclick();assert.equal(nodes.get('data-dialog').open,true);
 const header=html.match(/<header>[\s\S]*?<\/header>/)[0],panel=html.match(/<dialog id="data-dialog">[\s\S]*?<\/dialog>/)[0];
 assert.match(header,/id="settings"/);assert.doesNotMatch(header,/id="(?:import|fetch|sync-platinum)"/);
 for(const id of ['import','fetch','sync-platinum','export-backup','export-library','export-personal','cloud-read','cloud-write'])assert.match(panel,new RegExp(`id="${id}"`));
 assert.ok(panel.indexOf('01 / 腳本資訊')<panel.indexOf('02 / 更新與同步'));
 assert.equal((panel.match(/href="scripts\//g)||[]).length,1);assert.doesNotMatch(panel,/trophy-probe\.user\.js/);
 nodes.get('data-dialog').close();nodes.get('empty-import').onclick();assert.equal(nodes.get('data-dialog').open,true);
});

test('library renders every work beyond the old page size and filters the full result',()=>{
 const data=fixture('',Array.from({length:125},(_,i)=>String(i).padStart(3,'0')));
 data.library.games.forEach((g,i)=>{g.platform=i%2?'PS4':'PS5';});
 const {nodes}=setup(data),grid=nodes.get('grid'),search=nodes.get('search');
 nodes.get('status').value='';nodes.get('status').listeners.change();
 const titles=()=>grid.querySelectorAll('button').map(n=>n.textContent);
 assert.equal(grid.children.length,125);assert.equal(titles().at(-1),'Game 124');
 assert.match(nodes.get('result-count').textContent,/125 部作品 · 125 筆授權/);
 nodes.get('platform').value='PS5';nodes.get('platform').listeners.change();
 assert.equal(grid.children.length,63);assert.equal(titles().at(-1),'Game 124');
 search.value='Game 124';search.listeners.input();assert.deepEqual(titles(),['Game 124']);
 search.value='no matching game';search.listeners.input();assert.equal(grid.children.length,0);assert.equal(nodes.get('empty').hidden,false);
 search.value='';search.listeners.input();assert.equal(grid.children.length,63);
 nodes.get('platform').value='';nodes.get('platform').listeners.change();assert.equal(grid.children.length,125);
});

test('select all includes every filtered result and preserves selection across filters',()=>{
 const data=fixture('',Array.from({length:125},(_,i)=>String(i).padStart(3,'0')));
 data.library.games.forEach((g,i)=>{g.platform=i%2?'PS4':'PS5';});
 const {nodes,storage}=setup(data);
 nodes.get('status').value='';nodes.get('status').listeners.change();
 nodes.get('platform').value='PS5';nodes.get('platform').listeners.change();nodes.get('select-all').onclick();
 assert.equal(nodes.get('selected-count').textContent,'已選 63 部作品');
 nodes.get('platform').value='PS4';nodes.get('platform').listeners.change();nodes.get('select-all').onclick();
 assert.equal(nodes.get('selected-count').textContent,'已選 125 部作品');
 nodes.get('batch-status').value='想玩';nodes.get('apply-status').onclick();
 const saved=JSON.parse(storage.get(KEY));assert.equal(Object.keys(saved.personal.works).length,126);
 for(const g of data.library.games)assert.equal(saved.personal.works['concept:'+g.conceptId].status,'想玩');
 nodes.get('clear-selection').onclick();assert.equal(nodes.get('batch').hidden,true);
});

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

const platinumFixture=()=>{
 const data=fixture('keep note',['a','b']);data.library.games.forEach((g,i)=>{g.titleId='PPSA0000'+(i+1)+'_00';});
 data.personal.works['concept:a'].status='想玩';data.personal.works['concept:a'].tags=['keep tag'];return data;
};
function startPlatinum(env){
 env.nodes.get('sync-platinum').onclick();const child=env.io.opened;
 const session=new URLSearchParams(new URL(child.url).hash.slice(1)).get('psgbPlatinumSession');
 const send=data=>env.windowEvents.message({source:child,origin:'https://library.playstation.com',data:{session,...data}});
 send({type:'PSGB_PLATINUM_READY'});return {child,session,send};
}
test('platinum sync is click-only, requires a trusted handshake, applies only status and survives reload',()=>{
 const env=setup(platinumFixture()),before=structuredClone(env.app.getState());assert.equal(env.io.opened,undefined);
 const {child,send,session}=startPlatinum(env);assert.equal(child.messages.length,1);assert.equal(child.messages[0].message.type,'PSGB_PLATINUM_START');
 assert.equal(new URLSearchParams(new URL(child.url).hash.slice(1)).has('psgbOrigin'),false);
 const result={type:'PSGB_PLATINUM_RESULT',session,complete:true,earnedTitleIds:['PPSA00001_00']};
 for(const change of [{origin:'https://untrusted.invalid'},{source:{}},{data:{...result,session:'wrong'}}])env.windowEvents.message({origin:'https://library.playstation.com',source:child,data:result,...change});
 assert.equal(env.app.getState().personal.works['concept:a'].status,'想玩');
 env.app.getState().personal.works['concept:a'].note='edited while querying';send(result);
 const after=env.app.getState();assert.equal(after.personal.works['concept:a'].status,'已白金');assert.equal(after.personal.works['concept:a'].note,'edited while querying');assert.deepEqual([...after.personal.works['concept:a'].tags],['keep tag']);assert.deepEqual(structuredClone(after.library),before.library);
 assert.equal(env.nodes.get('stat-platinum').textContent,1);assert.match(env.nodes.get('notice').textContent,/新增 1 部/);assert.equal(env.storage.has(RECOVERY),true);assert.equal(env.io.writes.length,0);
 const reloaded=setup(JSON.parse(env.storage.get(KEY)));assert.equal(reloaded.app.getState().personal.works['concept:a'].status,'已白金');assert.equal(reloaded.io.opened,undefined);
});
test('empty platinum results and repeated late messages do not write or clear existing platinum',()=>{
 const data=platinumFixture();data.personal.works['concept:b']={...model.blankRecord(),status:'已白金',updatedAt:'keep'};
 const env=setup(data),before=env.storage.get(KEY),{send}=startPlatinum(env);send({type:'PSGB_PLATINUM_RESULT',complete:true,earnedTitleIds:[]});
 assert.equal(env.storage.get(KEY),before);assert.equal(env.storage.has(RECOVERY),false);send({type:'PSGB_PLATINUM_RESULT',complete:true,earnedTitleIds:['PPSA00001_00']});assert.equal(env.storage.get(KEY),before);
});
test('platinum sync handles blocked popup, helper failure, invalid response and demo without writes',()=>{
 const blocked=setup(platinumFixture());blocked.io.popupBlocked=true;blocked.nodes.get('sync-platinum').onclick();assert.equal(blocked.nodes.get('sync-platinum').disabled,false);assert.match(blocked.nodes.get('notice').textContent,/彈出視窗/);
 for(const message of [{type:'PSGB_PLATINUM_ERROR',code:'helper'},{type:'PSGB_PLATINUM_RESULT',complete:false,earnedTitleIds:['PPSA00001_00']},{type:'PSGB_PLATINUM_RESULT',complete:true,earnedTitleIds:['PPSA99999_00']}]){
  const env=setup(platinumFixture()),before=env.storage.get(KEY),{send}=startPlatinum(env);send(message);assert.equal(env.storage.get(KEY),before);assert.equal(env.nodes.get('sync-platinum').disabled,false);
 }
 const demo=setup();demo.nodes.get('demo').onclick();demo.nodes.get('sync-platinum').onclick();assert.equal(demo.io.opened,undefined);
});
test('platinum sync storage, recovery and external-tab failures preserve memory and saved data',()=>{
 for(const failure of ['storage','recovery','external']){
  const env=setup(platinumFixture()),before=env.storage.get(KEY),{send}=startPlatinum(env);
  if(failure==='external')env.windowEvents.storage({key:KEY});else env.io.failKey=failure==='storage'?KEY:RECOVERY;
  send({type:'PSGB_PLATINUM_RESULT',complete:true,earnedTitleIds:['PPSA00001_00']});assert.equal(env.storage.get(KEY),before);assert.equal(env.app.getState().personal.works['concept:a'].status,'想玩');
 }
});
test('timeout restores the button even if the official popup is already closed',()=>{
 const env=setup(platinumFixture()),before=env.storage.get(KEY);startPlatinum(env);
 env.io.opened.postMessage=()=>{throw Error('closed');};env.io.timers.find(timer=>timer.ms===300000).callback();
 assert.equal(env.nodes.get('sync-platinum').disabled,false);assert.equal(env.storage.get(KEY),before);assert.match(env.nodes.get('notice').textContent,/逾時/);
});
