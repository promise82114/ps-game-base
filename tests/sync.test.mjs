import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyPersonal,blankRecord,personal,groupGames,workRecordFor,parseImport} from '../dist/model.js';
import {compareImport,resolveImport} from '../dist/sync.js';

const game=id=>({name:'Game '+id,entitlementId:id,platform:'PS5',conceptId:id});
const lib=(ids=['a'])=>({schemaVersion:1,complete:true,games:ids.map(game),missingIds:[]});
const state=(ids=['a'])=>({library:lib(ids),personal:emptyPersonal()});
const rec=(note,status='想玩',updatedAt='2026-10-17T00:00:00Z')=>({...blankRecord(),note,status,updatedAt});
const stored=(data,id)=>workRecordFor(data.personal,groupGames(data.library.games).find(g=>g.key==='concept:'+id));

test('preview and all resolution modes leave both original inputs untouched',()=>{
 const local=state(['a','b']),remote=state(['a','c']);local.personal.works['concept:a']=rec('local');remote.personal.works['concept:a']=rec('remote');
 const before=JSON.stringify([local,remote]),plan=compareImport(local,remote);
 for(const mode of ['merge','keep','replace']){const next=resolveImport(local,remote,plan,{mode});next.library.games[0].name='modified';next.personal.categories.push('changed');}
 assert.equal(JSON.stringify([local,remote]),before);
 assert.deepEqual(plan.changes.added.map(g=>g.entitlementId),['c']);assert.deepEqual(plan.changes.localOnly.map(g=>g.entitlementId),['b']);
});
test('default merge keeps local conflicts and local-only progress, adds incoming-only progress',()=>{
 const local=state(['a','b']),remote=state(['a','c']);local.personal.works['concept:a']=rec('local');local.personal.works['concept:b']=rec('local only','已白金');remote.personal.works['concept:a']=rec('cloud');remote.personal.works['concept:c']=rec('cloud only');
 const plan=compareImport(local,remote),next=resolveImport(local,remote,plan);
 assert.deepEqual(plan.counts,{incoming:1,local:1,conflict:1,same:0});assert.equal(stored(next,'a').note,'local');assert.equal(stored(next,'b').status,'已白金');assert.equal(stored(next,'c').note,'cloud only');assert.deepEqual(next.library.missingIds,[]);
});
test('explicit per-work conflict choice changes only the chosen work and preserves clears',()=>{
 const local=state(['a','b']),remote=state(['a','b']);
 for(const id of ['a','b']){local.personal.works['concept:'+id]=rec('local','已白金');remote.personal.works['concept:'+id]=rec('','未開始','2020-01-01T00:00:00Z');}
 const plan=compareImport(local,remote),next=resolveImport(local,remote,plan,{choices:{'work:concept:a':'incoming'}});
 assert.equal(stored(next,'a').status,'未開始');assert.equal(stored(next,'a').note,'');assert.equal(stored(next,'b').status,'已白金');
});
test('timestamp-only and set-order differences are not conflicts',()=>{
 const local=state(),remote=state();local.personal.categories=['x','y'];remote.personal.categories=['y','x'];
 local.personal.works['concept:a']={...rec('same'),categories:['x','y'],tags:['one','two']};remote.personal.works['concept:a']={...rec('same','想玩','1990-01-01'),categories:['y','x'],tags:['two','one']};
 assert.equal(compareImport(local,remote).counts.same,1);
});
test('legacy entitlement and shared work records compare as one game, local choice cannot be shadowed',()=>{
 const local=state(),remote=state();local.personal.records.a=rec('legacy local','已白金');remote.personal.works['concept:a']=rec('shared cloud');
 const plan=compareImport(local,remote);assert.equal(plan.rows.length,1);assert.equal(plan.counts.conflict,1);
 assert.equal(stored(resolveImport(local,remote,plan),'a').note,'legacy local');
 assert.equal(stored(resolveImport(local,remote,plan,{choices:{'work:concept:a':'incoming'}}),'a').note,'shared cloud');
});
test('product to concept fallback compares effective progress while preserving raw legacy notes',()=>{
 const local=state(),remote=state();for(const data of [local,remote])data.library.games[0].productId='product-a';
 local.personal.works['product:product-a']=rec('product local');remote.personal.records.a=rec('remote entitlement');
 const plan=compareImport(local,remote),next=resolveImport(local,remote,plan);
 assert.equal(plan.counts.conflict,1);assert.equal(stored(next,'a').note,'product local');assert.equal(next.personal.records.a.note,'remote entitlement');assert.equal(next.personal.works['product:product-a'].note,'product local');
});
test('orphan records and work keys remain comparable before any library is loaded',()=>{
 const local=state([]),remote=state([]);local.personal.records.a=rec('local');remote.personal.records.a=rec('cloud');remote.personal.works['product:b']=rec('orphan');
 const plan=compareImport(local,remote);assert.equal(plan.counts.conflict,1);assert.equal(plan.counts.incoming,1);
 const next=resolveImport(local,remote,plan,{choices:{'records:a':'incoming'}});assert.equal(next.personal.records.a.note,'cloud');assert.equal(next.personal.works['product:b'].note,'orphan');
});
test('merge unions categories while keep and replace have explicit distinct results',()=>{
 const local=state(),remote=state();local.personal.categories=['local'];remote.personal.categories=['cloud'];local.personal.works['concept:a']={...rec('local'),categories:['local']};remote.personal.works['concept:a']={...rec('cloud'),categories:['cloud']};
 const plan=compareImport(local,remote);
 const merged=resolveImport(local,remote,plan,{choices:{'work:concept:a':'incoming'}});assert.deepEqual(merged.personal.categories,['local','cloud']);assert.deepEqual(stored(merged,'a').categories,['cloud']);
 assert.deepEqual(resolveImport(local,remote,plan,{mode:'keep'}).personal,personal(local.personal));
 assert.deepEqual(resolveImport(local,remote,plan,{mode:'replace'}).personal,personal(remote.personal));
});
test('personal-only imports preserve the current library and full backup round trips',()=>{
 const local=state();local.library.missingIds=['a'];const remote={personal:emptyPersonal()};remote.personal.works['concept:a']=rec('new');
 const next=resolveImport(local,remote,compareImport(local,remote));assert.deepEqual(next.library,local.library);
 const roundTrip=parseImport(JSON.parse(JSON.stringify({schemaVersion:1,kind:'ps-game-base-backup',...next,missingIds:next.library.missingIds})));assert.equal(roundTrip.personal.works['concept:a'].note,'new');assert.deepEqual(roundTrip.missingIds,['a']);
});
test('official sync still marks absent entitlements; backup merge preserves each device-only inventory',()=>{
 const local=state(['a','b']);local.library.missingIds=['a'];
 assert.deepEqual(compareImport(local,{library:lib(['b'])}).library.missingIds,['a']);
 const remote=state(['b','c']);remote.missingIds=['c'];const next=compareImport(local,remote).library;assert.deepEqual(next.missingIds,['a','c']);
 remote.library=lib(['a','b','c']);remote.missingIds=[];assert.deepEqual(compareImport(local,remote).library.missingIds,[]);
});
test('malicious property names do not modify prototypes during merging',()=>{
 const local=state([]),remote=state([]);Object.defineProperty(remote.personal.records,'__proto__',{value:rec('safe'),enumerable:true});
 const incoming={personal:personal(remote.personal)},plan=compareImport(local,incoming),next=resolveImport(local,incoming,plan);
 assert.equal(next.personal.records['__proto__'].note,'safe');assert.equal({}.note,undefined);
});
test('library metadata changes are shown without treating object property ordering as a change',()=>{
 const local=state(),remote=state();remote.library.games[0]={conceptId:'a',platform:'PS5',entitlementId:'a',name:'Game a'};
 assert.equal(compareImport(local,remote).changes.updated.length,0);remote.library.games[0].name='New title';assert.equal(compareImport(local,remote).changes.updated.length,1);
});
