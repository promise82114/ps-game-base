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

test('three simplified choices retain existing stored status codes',()=>{
 assert.deepEqual(classificationOptions.map(({label,value})=>[label,value]),[['白金','已白金'],['忽略','不再遊玩'],['追蹤','想玩']]);
 assert.equal(classificationFor('遊玩中'),undefined);assert.equal(classificationFor('未開始'),undefined);
 for(const item of classificationOptions){const p=emptyPersonal();p.works['concept:100']={...blankRecord(),status:item.value};assert.equal(personal(JSON.parse(JSON.stringify(p))).works['concept:100'].status,item.value);}
});
test('ignored entries are hidden from ordinary views and available through an explicit filter',()=>{
 for(const view of ['all','favorite','missing'])assert.equal(matchesClassification('不再遊玩',{view}),false);
 assert.equal(matchesClassification('不再遊玩',{view:'ignored'}),true);
 assert.equal(matchesClassification('不再遊玩',{filter:'不再遊玩',customCategory:true}),true);
 assert.equal(matchesClassification('不再遊玩',{view:'ignored',customCategory:true}),false);
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
