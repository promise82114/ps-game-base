import {test} from 'node:test';
import assert from 'node:assert/strict';
import {library,personal,emptyPersonal,blankRecord,recordFor,mergeLibrary,parseImport,groupGames,workRecordFor,hasWorkConflicts,matchesWorkFilters,classificationOptions,classificationFor,matchesClassification} from '../dist/model.js';
const game=id=>({name:'Game '+id,entitlementId:id,platform:'PS5'});
const lib=(ids,complete=true)=>({schemaVersion:1,complete,syncedAt:'2026-10-16T00:00:00Z',games:ids.map(game)});
test('official JSON is whitelisted, invalid imports fail before any mutation',()=>{
 const input=lib(['a']);input.games[0].authorization='secret';input.games[0].imageUrl='javascript:alert(1)';
 const result=library(input);assert.equal(result.games[0].authorization,undefined);assert.equal(result.games[0].imageUrl,undefined);
 for(const value of [{},lib(['a','a']),{...lib([]),complete:'true'},{...lib([]),games:[{name:'x'}]}])assert.throws(()=>library(value));
});
test('full sync retains absent games and personal records; partial sync never marks missing',()=>{
 const p=emptyPersonal();p.records.a={...blankRecord(),note:'do not lose',favorite:true};
 const merged=mergeLibrary(lib(['a','b']),lib(['b','c']));assert.deepEqual(merged.missingIds,['a']);assert.equal(merged.added,1);assert.equal(merged.games.length,3);assert.equal(recordFor(p,'a').note,'do not lose');
 const partial=mergeLibrary(merged,lib(['a'],false));assert.deepEqual(partial.missingIds,[]);assert.equal(partial.games.length,3);
 const restored=mergeLibrary(merged,lib(['a','b','c']));assert.deepEqual(restored.missingIds,[]);
});
test('complete empty differs from partial empty',()=>{assert.deepEqual(mergeLibrary(lib(['a']),lib([])).missingIds,['a']);assert.deepEqual(mergeLibrary(lib(['a']),lib([],false)).missingIds,[]);});
test('personal export/import round-trip retains tags, note, rating and categories',()=>{
 const p=emptyPersonal();p.categories=['雙人'];p.records.a={...blankRecord(),status:'遊玩中',categories:['雙人'],tags:['週末'],note:'下一關',rating:5,favorite:true};
 const result=personal(JSON.parse(JSON.stringify(p)));assert.deepEqual({...result.records.a},p.records.a);assert.deepEqual(result.categories,p.categories);
 assert.throws(()=>personal({...p,categories:[]}));assert.throws(()=>personal({...p,records:{a:{...p.records.a,rating:6}}}));
});
test('backup validates both halves atomically and preserves absent ID metadata',()=>{
 const value={schemaVersion:1,kind:'ps-game-base-backup',library:lib(['a']),personal:emptyPersonal(),missingIds:['a']};assert.deepEqual(parseImport(value).missingIds,['a']);assert.throws(()=>parseImport({...value,personal:{}}));
});
test('special entitlement keys do not pollute prototypes',()=>{
 const p=JSON.parse('{"schemaVersion":1,"kind":"ps-game-base-personal","categories":[],"records":{}}');
 Object.defineProperty(p.records,'__proto__',{value:blankRecord(),enumerable:true});const result=personal(p);assert.equal(recordFor(result,'__proto__').status,'未開始');assert.equal({}.status,undefined);
});

const versions=()=>[
 {...game('ps4'),name:'Same game PS4',platform:'PS4',conceptId:'100',membership:'NONE'},
 {...game('ps5'),name:'Same game PS5',platform:'PS5',conceptId:'100',membership:'PS_PLUS'},
];
test('concept grouping combines platforms and editions without rewriting original entitlements',()=>{
 const games=[...versions(),{...game('edition'),platform:'PS4',conceptId:'100'},{...game('other'),name:'Same game PS5',conceptId:'200'}];
 const before=JSON.stringify(games),works=groupGames(games);
 assert.equal(works.length,2);assert.equal(works[0].members.length,3);assert.deepEqual(works[0].platforms,['PS4','PS5']);
 assert.equal(works[0].name,'Same game PS5');assert.equal(JSON.stringify(games),before);
});
test('missing concept IDs never merge by name and cannot collide with concept keys',()=>{
 const games=[{...game('a'),name:'Identical'},{...game('b'),name:'Identical',conceptId:''},{...game('100'),conceptId:' '},...versions()];
 assert.equal(groupGames(games).length,4);assert.equal(new Set(groupGames(games).map(w=>w.key)).size,4);
});

const eiyuden=()=>[
 {name:'百英雄傳',entitlementId:'UP4040-CUSA29566_00-EIYUDEN100HEROES',platform:'PS4',membership:'PS_PLUS',productId:'UP4040-PPSA04721_00-EIYUDENHEROESPS5',titleId:'CUSA29566_00',isActive:true,isDownloadable:true,isPreOrder:false},
 {name:'百英雄傳',entitlementId:'UP4040-PPSA04721_00-EIYUDEN100HEROES',platform:'PS5',membership:'PS_PLUS',productId:'UP4040-PPSA04721_00-EIYUDENHEROESPS5',titleId:'PPSA04721_00',isActive:true,isDownloadable:true,isPreOrder:false},
];
test('Eiyuden PS4 and PS5 exports without conceptId merge by their shared productId',()=>{
 const games=library({schemaVersion:1,complete:true,games:eiyuden()}).games,before=JSON.stringify(games),works=groupGames(games);
 assert.equal(works.length,1);assert.equal(works[0].key,'product:'+games[0].productId);
 assert.deepEqual(works[0].platforms,['PS4','PS5']);assert.equal(works[0].members.length,2);
 assert.equal(works[0].platform,'PS5');assert.equal(JSON.stringify(games),before);
});
test('concept takes priority over product, empty IDs fall back to entitlement, and names never join groups',()=>{
 const games=[
  {...game('a'),conceptId:'one',productId:'shared'},
  {...game('b'),conceptId:'two',productId:'shared'},
  {...game('c'),conceptId:'one',productId:'different'},
  {...game('d'),name:'Same',productId:'one'},
  {...game('e'),name:'Same',productId:'other'},
  {...game('f'),conceptId:' ',productId:' '},
  {...game('g'),name:'Same'},
 ];
 const works=groupGames(games);assert.equal(works.length,6);
 assert.equal(works.find(w=>w.key==='concept:one').members.length,2);
 assert.ok(works.some(w=>w.key==='product:one'));assert.ok(works.some(w=>w.key==='entitlement:f'));
 assert.ok(works.some(w=>w.key==='entitlement:g'));
});
test('new product groups retain previous per-entitlement edits and shared edits survive backup round-trip',()=>{
 const games=eiyuden(),p=emptyPersonal();p.categories=['劇情'];
 p.works['entitlement:'+games[0].entitlementId]={...blankRecord(),note:'PS4 note',updatedAt:'2026-10-15T00:00:00Z'};
 p.works['entitlement:'+games[1].entitlementId]={...blankRecord(),status:'想玩',note:'PS5 note',categories:['劇情'],updatedAt:'2026-10-16T00:00:00Z'};
 const previous=JSON.stringify(p),[work]=groupGames(games);
 assert.equal(workRecordFor(p,work).note,'PS5 note');assert.equal(hasWorkConflicts(p,work),true);assert.equal(JSON.stringify(p),previous);
 p.works[work.key]={...workRecordFor(p,work),status:'已白金',note:'shared note'};
 const data=parseImport(JSON.parse(JSON.stringify({schemaVersion:1,kind:'ps-game-base-backup',library:{schemaVersion:1,complete:true,games},personal:p})));
 const [restored]=groupGames(data.library.games);assert.equal(workRecordFor(data.personal,restored).status,'已白金');
 assert.equal(workRecordFor(data.personal,restored).note,'shared note');assert.equal(hasWorkConflicts(data.personal,restored),false);
 assert.equal(data.personal.works['entitlement:'+games[0].entitlementId].note,'PS4 note');
});
test('later concept metadata can still read the shared product-level record without changing it',()=>{
 const games=eiyuden(),p=emptyPersonal();p.works['product:'+games[0].productId]={...blankRecord(),status:'想玩',note:'product note'};
 const [work]=groupGames(games.map(g=>({...g,conceptId:'concept-later'}))),before=JSON.stringify(p);
 assert.equal(work.key,'concept:concept-later');assert.equal(workRecordFor(p,work).note,'product note');
 assert.equal(workRecordFor(p,work).status,'想玩');assert.equal(JSON.stringify(p),before);
 p.works[work.key]={...blankRecord(),note:'new concept note'};assert.equal(workRecordFor(p,work).note,'new concept note');
});
test('platform and membership filters must match the same entitlement inside a work',()=>{
 const [work]=groupGames(versions());
 assert.equal(matchesWorkFilters(work,{platform:'PS4',membership:'PS_PLUS'}),false);
 assert.equal(matchesWorkFilters(work,{platform:'PS5',membership:'PS_PLUS'}),true);
 assert.equal(matchesWorkFilters(work,{platform:'PS4'}),true);
 assert.equal(matchesWorkFilters(work,{membership:'UNKNOWN'}),false);
});
test('partial missing versions keep a single work with accurate missing filters and an active cover',()=>{
 const [work]=groupGames(versions(),['ps5']);
 assert.equal(work.missingCount,1);assert.equal(work.entitlementId,'ps4');
 assert.equal(matchesWorkFilters(work,{missingOnly:true,platform:'PS4'},['ps5']),false);
 assert.equal(matchesWorkFilters(work,{missingOnly:true,platform:'PS5'},['ps5']),true);
 assert.equal(groupGames(versions(),['ps4','ps5'])[0].missingCount,2);
});
test('legacy version records retain all notes and select the newest until a shared record exists',()=>{
 const p=emptyPersonal(),[work]=groupGames(versions());
 p.records.ps4={...blankRecord(),note:'PS4 note',updatedAt:'2026-10-15T00:00:00Z'};
 p.records.ps5={...blankRecord(),note:'PS5 note',updatedAt:'2026-10-16T00:00:00Z'};
 const before=JSON.stringify(p.records);assert.equal(workRecordFor(p,work).note,'PS5 note');assert.equal(hasWorkConflicts(p,work),true);
 p.works[work.key]={...workRecordFor(p,work),favorite:true};
 assert.equal(hasWorkConflicts(p,work),false);assert.equal(JSON.stringify(p.records),before);
 const restored=personal(JSON.parse(JSON.stringify(p)));assert.equal(workRecordFor(restored,work).favorite,true);assert.equal(restored.records.ps4.note,'PS4 note');
});
test('shared work edits survive a later platform arrival and backup round-trip',()=>{
 const p=emptyPersonal(),[before]=groupGames(versions().slice(0,1));
 p.works[before.key]={...blankRecord(),status:'遊玩中',note:'shared note',rating:4};
 const merged=mergeLibrary({schemaVersion:1,complete:true,games:versions().slice(0,1)},{schemaVersion:1,complete:true,games:versions()});
 const data=parseImport(JSON.parse(JSON.stringify({schemaVersion:1,kind:'ps-game-base-backup',library:merged,personal:p,missingIds:[]})));
 const [after]=groupGames(data.library.games);assert.equal(after.key,before.key);assert.equal(after.members.length,2);assert.equal(workRecordFor(data.personal,after).note,'shared note');assert.equal(workRecordFor(data.personal,after).rating,4);
});
test('older personal JSON imports with empty work records; invalid shared records are rejected',()=>{
 const old={schemaVersion:1,kind:'ps-game-base-personal',categories:[],records:{}};
 assert.equal(Object.keys(personal(old).works).length,0);
 assert.throws(()=>personal({...old,works:[]}));assert.throws(()=>personal({...old,works:{'concept:1':{...blankRecord(),rating:6}}}));
 assert.throws(()=>personal({...old,works:{'concept:1':{...blankRecord(),categories:['unknown']}}}));
});
test('later concept metadata preserves edits made before automatic grouping was possible',()=>{
 const p=emptyPersonal(),initial={...versions()[0]};delete initial.conceptId;
 const [ungrouped]=groupGames([initial]);p.works[ungrouped.key]={...blankRecord(),note:'keep this note'};
 const [grouped]=groupGames(versions());assert.equal(workRecordFor(p,grouped).note,'keep this note');
});

test('four choices retain existing codes and add an independent abandoned status',()=>{
 assert.deepEqual(classificationOptions.map(({label,value})=>[label,value]),[['白金','已白金'],['追蹤','想玩'],['忽略','不再遊玩'],['棄坑','已棄坑']]);
 assert.equal(classificationFor('遊玩中'),undefined);assert.equal(classificationFor('未開始'),undefined);
 for(const item of classificationOptions){const p=emptyPersonal();p.works['concept:100']={...blankRecord(),status:item.value};assert.equal(personal(JSON.parse(JSON.stringify(p))).works['concept:100'].status,item.value);}
});
test('ignored entries remain in ordinary views and are selected only when filtering explicitly',()=>{
 for(const view of ['all','missing'])assert.equal(matchesClassification('不再遊玩',{view}),true);
 assert.equal(matchesClassification('不再遊玩',{view:'ignored'}),true);
 assert.equal(matchesClassification('不再遊玩',{filter:'不再遊玩',customCategory:true}),true);
 assert.equal(matchesClassification('不再遊玩',{view:'ignored',customCategory:true}),true);
 assert.equal(matchesClassification('已白金',{view:'platinum'}),true);assert.equal(matchesClassification('想玩',{view:'platinum'}),false);
 assert.equal(matchesClassification('想玩',{view:'tracked'}),true);
});
test('clearing a classification restores the existing unclassified code without rewriting older statuses',()=>{
 const p=emptyPersonal();p.works['concept:100']={...blankRecord(),status:'遊玩中'};
 assert.equal(matchesClassification('遊玩中',{filter:'unclassified'}),true);
 assert.equal(personal(JSON.parse(JSON.stringify(p))).works['concept:100'].status,'遊玩中');
 p.works['concept:100']={...p.works['concept:100'],status:'未開始'};
 assert.equal(personal(JSON.parse(JSON.stringify(p))).works['concept:100'].status,'未開始');
 assert.equal(matchesClassification('已白金',{filter:'unclassified'}),false);
});
test('retired ratings remain backup-compatible but do not cause classification conflicts',()=>{
 const p=emptyPersonal(),[work]=groupGames(versions());
 p.records.ps4={...blankRecord(),rating:1};p.records.ps5={...blankRecord(),rating:5};
 assert.equal(hasWorkConflicts(p,work),false);
 assert.equal(personal(JSON.parse(JSON.stringify(p))).records.ps5.rating,5);
});
test('retired favorites remain backup-compatible without affecting classification or version conflicts',()=>{
 const p=emptyPersonal(),[work]=groupGames(versions());
 p.records.ps4={...blankRecord(),favorite:true};p.records.ps5={...blankRecord(),favorite:false};
 assert.equal(hasWorkConflicts(p,work),false);assert.equal(personal(JSON.parse(JSON.stringify(p))).records.ps4.favorite,true);
 assert.equal(workRecordFor(p,work).status,'未開始');
});
test('excluding ignored items is an optional filter and never changes their stored classification',()=>{
 assert.equal(matchesClassification('不再遊玩'),true);
 assert.equal(matchesClassification('不再遊玩',{filter:'exclude-ignored'}),false);
 for(const value of ['已白金','想玩','未開始','遊玩中'])assert.equal(matchesClassification(value,{filter:'exclude-ignored'}),true);
 const p=emptyPersonal();p.works.test={...blankRecord(),status:'不再遊玩'};
 assert.equal(personal(JSON.parse(JSON.stringify(p))).works.test.status,'不再遊玩');
});

test('multi-select classification is a union and keeps abandoned separate from ignored and unknown',()=>{
 for(const status of ['想玩','已棄坑'])assert.equal(matchesClassification(status,{filter:['想玩','已棄坑']}),true);
 for(const status of ['不再遊玩','已白金','未開始'])assert.equal(matchesClassification(status,{filter:['想玩','已棄坑']}),false);
 assert.equal(matchesClassification('已棄坑',{view:'abandoned'}),true);
 assert.equal(matchesClassification('不再遊玩',{view:'abandoned'}),false);
 assert.equal(matchesClassification('已棄坑',{filter:['unclassified']}),false);
 assert.equal(matchesClassification('遊玩中',{filter:['想玩','unclassified']}),true);
 assert.equal(matchesClassification('已棄坑',{filter:[]}),true);
 const p=emptyPersonal();p.records.old={...blankRecord(),status:'不再遊玩'};p.works.new={...blankRecord(),status:'已棄坑'};
 const restored=parseImport(JSON.parse(JSON.stringify(p))).personal;
 assert.equal(restored.records.old.status,'不再遊玩');assert.equal(restored.works.new.status,'已棄坑');
});

test('multi-select platform and membership intersect on one matching entitlement including missing and unknown',()=>{
 const [work]=groupGames([...versions(),{...game('unknown'),conceptId:'100',platform:'PS5',membership:''}]);
 assert.equal(matchesWorkFilters(work,{platform:['PS4'],membership:['PS_PLUS','UNKNOWN']}),false);
 assert.equal(matchesWorkFilters(work,{platform:['PS4','PS5'],membership:['PS_PLUS','NONE']}),true);
 assert.equal(matchesWorkFilters(work,{platform:['PS5'],membership:['UNKNOWN']}),true);
 assert.equal(matchesWorkFilters(work,{platform:[],membership:[]}),true);
 assert.equal(matchesWorkFilters(work,{platform:['PS4','PS5'],membership:['PS_PLUS'],missingOnly:true},['ps4']),false);
 assert.equal(matchesWorkFilters(work,{platform:['PS4','PS5'],membership:['NONE','UNKNOWN'],missingOnly:true},['ps4']),true);
});
