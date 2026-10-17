import {personal, groupGames, workRecordFor, mergeLibrary} from './model.js';

// Compare content, not clocks: an older backup may contain a deliberate clear.
const content = r => r && JSON.stringify([r.status,r.note,[...r.categories].sort(),[...r.tags].sort(),r.favorite,r.rating]);
const same = (a,b) => content(a) === content(b);
const own = (o,k) => Object.hasOwn(o,k);
const stableGame = g => JSON.stringify(Object.entries(g).sort(([a],[b])=>a.localeCompare(b)));

export function compareImport(current, incoming) {
  let nextLibrary = structuredClone(current.library);
  const changes = {added:[],updated:[],localOnly:[]};
  if (incoming.library) {
    const local = new Map(current.library.games.map(g=>[g.entitlementId,g]));
    const ids = new Set(incoming.library.games.map(g=>g.entitlementId));
    for (const g of incoming.library.games) {
      if (!local.has(g.entitlementId)) changes.added.push(g);
      else if (stableGame(local.get(g.entitlementId)) !== stableGame(g)) changes.updated.push(g);
    }
    changes.localOnly = current.library.games.filter(g=>!ids.has(g.entitlementId));
    nextLibrary = mergeLibrary(current.library,incoming.library);
    // Backups describe another device's inventory, not a new official full sync.
    if (incoming.personal) {
      const missing = new Set(current.library.missingIds || []), remoteMissing = new Set(incoming.missingIds || []);
      for (const id of ids) remoteMissing.has(id) ? missing.add(id) : missing.delete(id);
      nextLibrary.missingIds = [...missing];
    }
  }
  const rows=[], before=current.personal, after=incoming.personal;
  if (after) {
    const covered={records:new Set(),works:new Set()};
    const beforeRecords=new Set([...Object.values(before.records),...Object.values(before.works || {})]);
    const afterRecords=new Set([...Object.values(after.records),...Object.values(after.works || {})]);
    const add=(id,kind,key,name,a,b)=>rows.push({id,kind,key,name,before:a,after:b,type:!a?'incoming':!b?'local':same(a,b)?'same':'conflict'});
    for (const work of groupGames(nextLibrary.games)) {
      const a=workRecordFor(before,work), b=workRecordFor(after,work);
      const left=beforeRecords.has(a)?a:null, right=afterRecords.has(b)?b:null;
      covered.works.add(work.key);
      for (const g of work.members) {
        covered.records.add(g.entitlementId);
        covered.works.add('entitlement:'+g.entitlementId);
        if (g.productId?.trim()) covered.works.add('product:'+g.productId.trim());
      }
      if (left || right) add('work:'+work.key,'work',work.key,work.name,left,right);
    }
    // Records whose games are absent still need comparison and preservation.
    for (const kind of ['records','works']) {
      const a=before[kind] || {}, b=after[kind] || {};
      for (const key of new Set([...Object.keys(a),...Object.keys(b)])) {
        if (!covered[kind].has(key)) add(kind+':'+key,kind,key,'未對應遊戲 · '+key,own(a,key)?a[key]:null,own(b,key)?b[key]:null);
      }
    }
  }
  return {library:nextLibrary,changes,rows,hasPersonal:!!after,
    categories:{local:before.categories,incoming:after?.categories || []},
    counts:Object.fromEntries(['incoming','local','conflict','same'].map(type=>[type,rows.filter(r=>r.type===type).length]))};
}

export function resolveImport(current, incoming, plan, {mode='merge',choices={}} = {}) {
  if (!['merge','keep','replace'].includes(mode)) throw Error('不支援的匯入方式。');
  let result=personal(current.personal);
  if (incoming.personal && mode==='replace') result=personal(incoming.personal);
  else if (incoming.personal && mode==='merge') {
    const remote=incoming.personal;
    result.categories=[...new Set([...result.categories,...remote.categories])];
    // Keep raw legacy metadata as well as the resolved shared work records.
    for (const kind of ['records','works']) for (const [key,value] of Object.entries(remote[kind] || {})) {
      if (!own(result[kind],key)) result[kind][key]=structuredClone(value);
    }
    for (const row of plan.rows) {
      const selected=!row.before || (row.after && own(choices,row.id) && choices[row.id]==='incoming') ? row.after : row.before;
      result[row.kind==='work'?'works':row.kind][row.key]=structuredClone(selected);
    }
    result=personal(result);
  }
  return {library:structuredClone(plan.library),personal:result};
}
