import {test} from 'node:test';
import assert from 'node:assert/strict';
import {library,personal,emptyPersonal,blankRecord,recordFor,mergeLibrary,parseImport} from '../dist/model.js';
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
