export const statuses = ['未開始', '想玩', '遊玩中', '已破關', '已白金', '暫停', '不再遊玩'];
// Keep existing stored codes; only these three are offered for new choices.
export const classificationOptions = [
  {value:'已白金',label:'白金',icon:'trophy',tone:'platinum'},
  {value:'不再遊玩',label:'忽略',icon:'circle-x',tone:'ignored'},
  {value:'想玩',label:'追蹤',icon:'bookmark',tone:'tracked'},
];
export const classificationFor = value => classificationOptions.find(option => option.value === value);
export function matchesClassification(value, {view='all',filter='',customCategory=false} = {}) {
  if (filter === 'unclassified' ? !!classificationFor(value) : filter && value !== filter) return false;
  if (value === '不再遊玩' && filter !== '不再遊玩' && (customCategory || view !== 'ignored')) return false;
  if (!customCategory) {
    const expected = {platinum:'已白金',ignored:'不再遊玩',tracked:'想玩'}[view];
    if (expected && value !== expected) return false;
  }
  return true;
}
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const fail = message => { throw new Error(message); };
export function library(input) {
  if (!object(input) || input.schemaVersion !== 1 || !Array.isArray(input.games) || typeof input.complete !== 'boolean') fail('不是支援的遊戲庫 JSON（schemaVersion: 1）。');
  const ids = new Set();
  const games = input.games.map(g => {
    if (!object(g) || typeof g.entitlementId !== 'string' || !g.entitlementId.trim() || typeof g.name !== 'string' || !g.name.trim()) fail('遊戲缺少名稱或 entitlementId。');
    if (ids.has(g.entitlementId)) fail('遊戲庫含重複的 entitlementId。');
    ids.add(g.entitlementId);
    const out = {};
    for (const k of ['name','entitlementId','platform','membership','productId','titleId','conceptId']) if (typeof g[k] === 'string') out[k] = g[k];
    for (const k of ['isActive','isDownloadable','isPreOrder']) if (typeof g[k] === 'boolean') out[k] = g[k];
    if (typeof g.imageUrl === 'string') { try { const u = new URL(g.imageUrl); if (u.protocol === 'https:') out.imageUrl = u.href; } catch {} }
    return out;
  });
  return {schemaVersion:1, scope:'active-ps4-ps5-digital-entitlements', complete:input.complete, syncedAt:typeof input.syncedAt === 'string' ? input.syncedAt : null, games};
}
export function emptyPersonal() { return {schemaVersion:1, kind:'ps-game-base-personal', categories:[], records:{}, works:{}}; }
function strings(v) { if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) fail('分類或標籤格式不正確（每項 1–100 字）。'); return [...new Set(v)]; }
export function personal(input) {
  if (!object(input) || input.schemaVersion !== 1 || input.kind !== 'ps-game-base-personal' || !object(input.records)) fail('不是支援的個人分類 JSON。');
  if (input.works !== undefined && !object(input.works)) fail('作品整理格式不正確。');
  const categories = strings(input.categories);
  function readRecords(source) {
  const records = Object.create(null);
  for (const [id,r] of Object.entries(source)) {
    if (!id.trim() || !object(r) || !statuses.includes(r.status) || typeof r.favorite !== 'boolean' || !Number.isInteger(r.rating) || r.rating < 0 || r.rating > 5 || typeof r.note !== 'string' || r.note.length > 10000) fail('個人分類紀錄格式不正確。');
    const cats = strings(r.categories), tags = strings(r.tags);
    if (cats.some(c => !categories.includes(c))) fail('紀錄引用了不存在的分類。');
    records[id] = {status:r.status, favorite:r.favorite, rating:r.rating, note:r.note, categories:cats, tags, updatedAt:typeof r.updatedAt === 'string' ? r.updatedAt : ''};
  }
  return records;
  }
  return {schemaVersion:1,kind:'ps-game-base-personal',categories,records:readRecords(input.records),works:readRecords(input.works || {})};
}
export function blankRecord() { return {status:statuses[0],favorite:false,rating:0,note:'',categories:[],tags:[],updatedAt:''}; }
export function recordFor(data,id) { return Object.hasOwn(data.records,id) ? data.records[id] : blankRecord(); }
// Display grouping never deletes or rewrites the source entitlements.
export function groupGames(games, missingIds = []) {
  const grouped = new Map(), missing = new Set(missingIds);
  for (const game of games) {
    const concept = typeof game.conceptId === 'string' ? game.conceptId.trim() : '';
    const key = concept ? 'concept:' + concept : 'entitlement:' + game.entitlementId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(game);
  }
  return [...grouped].map(([key, members]) => {
    members.sort((a,b) => Number(missing.has(a.entitlementId))-Number(missing.has(b.entitlementId)) || Number(b.platform?.toUpperCase()==='PS5')-Number(a.platform?.toUpperCase()==='PS5') || a.entitlementId.localeCompare(b.entitlementId));
    const platforms = [...new Set(members.map(g => g.platform?.toUpperCase()).filter(Boolean))].sort();
    return {...members[0], imageUrl:members.find(g => g.imageUrl)?.imageUrl, key, members, platforms, missingCount:members.filter(g => missing.has(g.entitlementId)).length};
  });
}
export function workRecordFor(data, work) {
  if (data.works && Object.hasOwn(data.works, work.key)) return data.works[work.key];
  // Existing entitlement notes stay intact. Use the most recently saved record
  // until the user makes a shared edit; ties are resolved by stable ID.
  const saved = legacyWorkRecords(data,work);
  saved.sort((a,b) => b.record.updatedAt.localeCompare(a.record.updatedAt) || a.id.localeCompare(b.id));
  return saved.length ? saved[0].record : blankRecord();
}
function legacyWorkRecords(data,work) {
  return work.members.flatMap(g => {
    const key = 'entitlement:' + g.entitlementId;
    if (data.works && Object.hasOwn(data.works,key)) return [{id:g.entitlementId,record:data.works[key]}];
    return Object.hasOwn(data.records,g.entitlementId) ? [{id:g.entitlementId,record:data.records[g.entitlementId]}] : [];
  });
}
export function hasWorkConflicts(data, work) {
  if (data.works && Object.hasOwn(data.works,work.key)) return false;
  const values = legacyWorkRecords(data,work).map(({record:r}) => {
    return JSON.stringify([r.status,r.favorite,r.note,[...r.categories].sort(),[...r.tags].sort()]);
  });
  return new Set(values).size > 1;
}
export function matchesWorkFilters(work, {platform='', membership='', missingOnly=false} = {}, missingIds = []) {
  const missing = new Set(missingIds);
  return work.members.some(g => (!platform || g.platform?.toUpperCase() === platform) && (!membership || (membership === 'UNKNOWN' ? !['NONE','PS_PLUS'].includes(g.membership) : g.membership === membership)) && (!missingOnly || missing.has(g.entitlementId)));
}
export function mergeLibrary(previous, incoming) {
  const next = library(incoming), old = previous?.games || [];
  const byId = new Map(old.map(g => [g.entitlementId,g]));
  const added = next.games.filter(g => !byId.has(g.entitlementId)).length;
  const current = new Set(next.games.map(g => g.entitlementId));
  const missingIds = next.complete ? old.filter(g => !current.has(g.entitlementId)).map(g => g.entitlementId) : (previous?.missingIds || []).filter(id => !current.has(id));
  for (const g of next.games) byId.set(g.entitlementId,g);
  return {...next, games:[...byId.values()], missingIds, added};
}
export function parseImport(input) {
  if (input?.kind === 'ps-game-base-backup' && input.schemaVersion === 1) return {library:library(input.library),personal:personal(input.personal), missingIds:Array.isArray(input.missingIds) ? input.missingIds.filter(x => typeof x === 'string') : []};
  if (input?.kind === 'ps-game-base-personal') return {personal:personal(input)};
  return {library:library(input)};
}
