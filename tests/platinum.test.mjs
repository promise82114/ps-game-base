import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyPersonal,blankRecord} from '../dist/model.js';
import {platinumTitleIds,applyPlatinum} from '../dist/platinum.js';

const game=(id,concept='one',extra={})=>({name:'Same name',entitlementId:id,conceptId:concept,platform:id.startsWith('CUSA')?'PS4':'PS5',titleId:id,isActive:true,...extra});
const fixture=()=>({library:{schemaVersion:1,complete:true,games:[game('CUSA00001_00'),game('PPSA00001_00')],missingIds:[]},personal:{...emptyPersonal(),categories:['分類'],works:{'concept:one':{...blankRecord(),status:'想玩',categories:['分類'],tags:['標籤'],note:'保留筆記',favorite:true,rating:4,updatedAt:'old'}}}});

test('either PS4 or PS5 earned platinum updates one shared work and preserves every other field',()=>{
 for(const earned of ['CUSA00001_00','PPSA00001_00']){
  const state=fixture(),before=structuredClone(state),result=applyPlatinum(state,[earned],platinumTitleIds(state.library,state.personal),'now');
  assert.equal(result.changed,1);assert.equal(result.state.library,state.library);assert.equal(result.state.personal.records,state.personal.records);assert.equal(result.state.personal.categories,state.personal.categories);
  assert.deepEqual(result.state.personal.works['concept:one'],{...before.personal.works['concept:one'],status:'已白金',updatedAt:'now'});assert.deepEqual(state,before);
 }
});
test('no match and already-platinum records are no-ops including their timestamps',()=>{
 const state=fixture();assert.equal(applyPlatinum(state,[],['CUSA00001_00']).state,state);
 state.personal.works['concept:one'].status='已白金';assert.deepEqual(platinumTitleIds(state.library,state.personal),[]);
 const result=applyPlatinum(state,['CUSA00001_00'],['CUSA00001_00']);assert.equal(result.changed,0);assert.equal(result.state,state);assert.equal(result.state.personal.works['concept:one'].updatedAt,'old');
});
test('only current digital library works are candidates; stale versions can identify an eligible work',()=>{
 const state=fixture();state.library.games.push(game('PPSA00002_00','expired',{isActive:false}),game('PPSA00003_00','missing'),game('no-title','dlc',{titleId:undefined}),game('CUSA00004_00','disc',{platform:'PS3'}));state.library.missingIds=['PPSA00003_00','PPSA00001_00'];
 assert.deepEqual(platinumTitleIds(state.library,state.personal).sort(),['CUSA00001_00','PPSA00001_00']);
 const result=applyPlatinum(state,['PPSA00001_00','PPSA00002_00','PPSA00003_00'],['PPSA00001_00','PPSA00002_00','PPSA00003_00']);assert.equal(result.changed,1);assert.deepEqual(Object.keys(result.state.personal.works),['concept:one']);
});
test('same-name unrelated games are untouched and unsolicited response IDs are rejected',()=>{
 const state=fixture();state.library.games.push(game('PPSA00002_00','other'));const ids=platinumTitleIds(state.library,state.personal),result=applyPlatinum(state,['CUSA00001_00'],ids);
 assert.equal(result.changed,1);assert.equal(Object.hasOwn(result.state.personal.works,'concept:other'),false);
 for(const input of [null,{},['PPSA99999_00'],[{}]])assert.throws(()=>applyPlatinum(state,input,ids),/非本次查詢/);
});
test('ignored and legacy entitlement records become platinum without erasing legacy metadata',()=>{
 const state=fixture();delete state.personal.works['concept:one'];state.personal.records.CUSA00001_00={...blankRecord(),status:'不再遊玩',note:'legacy note',tags:['old'],updatedAt:'old'};
 const before=structuredClone(state),result=applyPlatinum(state,['PPSA00001_00'],platinumTitleIds(state.library,state.personal));
 assert.equal(result.state.personal.works['concept:one'].status,'已白金');assert.equal(result.state.personal.works['concept:one'].note,'legacy note');assert.deepEqual(result.state.personal.records,before.personal.records);
});
