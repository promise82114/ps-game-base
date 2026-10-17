import {classificationOptions, classificationFor, matchesClassification, library, personal, emptyPersonal, blankRecord, workRecordFor, hasWorkConflicts, groupGames, matchesWorkFilters, mergeLibrary, parseImport} from './model.js';
import {icon} from './icons.js';
import {compareImport,resolveImport} from './sync.js';
const $ = id => document.getElementById(id), KEY = 'ps-game-base.v1';
let state = {library:{schemaVersion:1,complete:false,syncedAt:null,games:[],missingIds:[]},personal:emptyPersonal()}, view='all', category='', page=1, selected=new Set(), shown=[], pendingImport=null, demo=false;
let bridge=null, bridgeTimer, cloudRead=false, cloudBusy=false, prepared=false;
let works = new Map();
function notice(message) {
 for(const id of ['data-notice','import-notice']){$(id).textContent=message;$(id).hidden=false;}
 const toast=$('notice');toast.textContent=message;toast.classList.add('visible');
 if(toast.showPopover){if(toast.matches(':popover-open'))toast.hidePopover();toast.showPopover();}
 clearTimeout(notice.timer);notice.timer=setTimeout(()=>{toast.classList.remove('visible');if(toast.matches(':popover-open'))toast.hidePopover();},8000);
}
try { const raw=localStorage.getItem(KEY); if(raw){const data=JSON.parse(raw);state={library:{...library(data.library),missingIds:Array.isArray(data.library.missingIds)?data.library.missingIds:[]},personal:personal(data.personal)};} } catch(e) { notice('無法載入本機資料：'+e.message+'。原始存檔未被自動覆寫，請先備份瀏覽器資料。'); }
let storageFailed=false, externalChanged=false;
function persist(){if(demo)return true;if(externalChanged){storageFailed=true;notice('另一分頁已有新版本，已停止寫入。請匯出此頁備份，再重新整理，避免覆蓋新資料。');return false;}try{localStorage.setItem(KEY,JSON.stringify(state));storageFailed=false;return true;}catch{storageFailed=true;notice('瀏覽器儲存失敗！目前變更只在此分頁，請立即匯出備份。');return false;}}
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function option(select,value,label){const n=el('option',label??value);n.value=value;select.append(n);}
for(const id of ['status','batch-status']) for(const item of classificationOptions) option($(id),item.value,item.label);
option($('status'),'unclassified','未分類');option($('status'),'exclude-ignored','排除忽略');option($('batch-status'),'未開始','清除分類');
for(const item of classificationOptions){const label=el('label',undefined,'status-choice'),input=el('input'),visual=el('span',undefined,'status-option');input.type='radio';input.name='classification';input.value=item.value;visual.dataset.tone=item.tone;visual.append(icon(item.icon),el('span',item.label));label.append(input,visual);$('edit-classifications').append(label);input.onchange=()=>{if(input.checked)setEditorStatus(input.value);};}
for(const b of $('views').querySelectorAll('[data-classification]')){const item=classificationFor(b.dataset.classification);b.dataset.tone=item.tone;b.prepend(icon(item.icon));}
function setEditorStatus(value){$('edit-status').value=value;for(const input of $('edit-classifications').querySelectorAll('input'))input.checked=input.value===value;$('legacy-status').hidden=value==='未開始'||!!classificationFor(value);$('legacy-status').textContent=`保留舊狀態「${value}」。選擇上方分類或清除分類後，才會變更原狀態。`;}
$('clear-status').onclick=()=>setEditorStatus('未開始');
function record(id){return workRecordFor(state.personal,works.get(id));}
function update(id,patch){state.personal.works=Object.assign(Object.create(null),state.personal.works,{[id]:{...record(id),...patch,updatedAt:new Date().toISOString()}});}
function backup(value=state){return {schemaVersion:1,kind:'ps-game-base-backup',exportedAt:new Date().toISOString(),library:library(value.library),missingIds:value.library.missingIds||[],personal:value.personal};}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=`ps-game-base-${name}-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function render(){
 const games=groupGames(state.library.games,state.library.missingIds);works=new Map(games.map(g=>[g.key,g]));const records=games.map(g=>record(g.key));
 $('stat-total').textContent=games.length;$('nav-count').textContent=games.length;
 $('stat-entitlements').textContent=`${state.library.games.length} 筆 PS4 / PS5 數位授權`;
 $('stat-platinum').textContent=records.filter(r=>r.status==='已白金').length;$('stat-ignored').textContent=records.filter(r=>r.status==='不再遊玩').length;$('stat-tracked').textContent=records.filter(r=>r.status==='想玩').length;
 $('summary').textContent=demo?'示範模式 · 所有操作不會寫入你的遊戲庫':state.library.syncedAt?`最近同步 ${new Date(state.library.syncedAt).toLocaleString('zh-TW')} · ${state.library.complete?'完整結果':'部分結果，尚未判定缺少授權'}${storageFailed?' · 儲存失敗，請匯出備份':''}`:'把擁有的遊戲，整理成想玩的生活。';
 const names={all:'所有遊戲',platinum:'白金',ignored:'忽略',tracked:'追蹤',missing:'未出現在最近同步'};
 $('heading').replaceChildren(el('span',category||names[view]),el('small',' / LIBRARY'));
 for(const b of $('views').querySelectorAll('button')){const active=!category&&b.dataset.view===view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
 $('categories').replaceChildren();$('batch-category').replaceChildren();option($('batch-category'),'','選擇分類');$('category-filter').replaceChildren();option($('category-filter'),'','全部分類');
 for(const c of state.personal.categories){const b=el('button',`◌　${c}`);b.classList.toggle('active',category===c);b.onclick=()=>{category=c;page=1;render();};$('categories').append(b);option($('batch-category'),c);option($('category-filter'),c);}$('category-filter').value=category;
 const search=$('search').value.trim().toLocaleLowerCase();
 const filtered=games.filter(g=>{const r=record(g.key);return (!category||r.categories.includes(category))&&(category||view!=='missing'||g.missingCount>0)&&matchesClassification(r.status,{view,filter:$('status').value,customCategory:!!category})&&(!search||[...g.members.map(m=>m.name),r.note,...r.tags].join(' ').toLocaleLowerCase().includes(search))&&matchesWorkFilters(g,{platform:$('platform').value,membership:$('membership').value,missingOnly:!category&&view==='missing'},state.library.missingIds);});
 filtered.sort((a,b)=>{const x=record(a.key),y=record(b.key);return ($('sort').value==='updated'?y.updatedAt.localeCompare(x.updatedAt):0)||a.name.localeCompare(b.name,'zh-Hant');});
 const pages=Math.max(1,Math.ceil(filtered.length/48));page=Math.min(page,pages);shown=filtered.slice((page-1)*48,page*48);
 $('grid').replaceChildren();$('empty').hidden=filtered.length>0;
 $('empty').querySelector('h2').textContent=games.length?'沒有符合條件的遊戲':'為你的遊戲，留一個位置。';
 $('empty').querySelector('p').textContent=games.length?'試試其他搜尋字詞、分類或篩選條件。':'匯入撈取腳本產生的 JSON，或開啟官方遊戲庫同步。分類、標籤與遊玩進度，都從這裡開始。';
 $('empty-import').hidden=games.length>0;$('demo').hidden=games.length>0||demo;
 for(const g of shown){const id=g.key,r=record(id),card=el('article',undefined,'card'),art=el('div',undefined,'art');
  const placeholder=el('div',g.name.split(/\s/).map(s=>s[0]).slice(0,3).join(''),'cover-placeholder');art.append(placeholder);
  if(g.imageUrl){const image=el('img');image.src=g.imageUrl;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>image.remove();art.append(image);}
  const check=el('input');check.type='checkbox';check.className='card-check';check.checked=selected.has(id);check.setAttribute('aria-label','選取 '+g.name);check.onchange=()=>{check.checked?selected.add(id):selected.delete(id);renderBatch();};art.append(check);
  art.append(quickClassifications(g,r.status));
  const badge=el('span',g.platforms.join(' · ')||'PS','platform-badge');art.append(badge);card.append(art);
  const body=el('div',undefined,'card-body'),title=el('button',g.name,'game-title');title.onclick=()=>edit(g);body.append(title);
  const memberships=[...new Set(g.members.map(m=>m.membership==='PS_PLUS'?'PS Plus':m.membership==='NONE'?'非 PS Plus':'來源未分類'))];
  const item=classificationFor(r.status),pill=el('span',undefined,'status-pill');if(item){pill.dataset.tone=item.tone;pill.append(icon(item.icon),document.createTextNode(item.label));}else pill.textContent='未分類';
  const line=el('div',undefined,'card-meta');line.append(pill,el('span',memberships.length>1?'多種授權':memberships[0]));body.append(line);
  if(r.categories.length||r.tags.length)body.append(el('p',[...r.categories,...r.tags.map(t=>'#'+t)].join(' · '),'tags'));
  if(g.missingCount)body.append(el('p',g.missingCount===g.members.length?'最近完整同步未出現':'部分版本授權於最近完整同步未出現','missing'));
  card.append(body);$('grid').append(card);
 }
 $('result-count').textContent=`${filtered.length} 部作品 · ${filtered.reduce((count,g)=>count+g.members.length,0)} 筆授權${selected.size?' · 已選 '+selected.size+' 部':''}`;$('page-label').textContent=`${page} / ${pages}`;$('prev').disabled=page===1;$('next').disabled=page===pages;renderBatch();$('reset-demo').hidden=!demo;
}
function renderBatch(){$('batch').hidden=!selected.size;$('selected-count').textContent=`已選 ${selected.size} 部作品`;}
function quickClassifications(game,status){
 const controls=el('div',undefined,'quick-classifications');controls.setAttribute('role','radiogroup');controls.setAttribute('aria-label',game.name+'分類');let keyboard=false;
 for(const value of ['已白金','想玩','不再遊玩']){
  const item=classificationFor(value),label=el('label',undefined,'quick-choice'),input=el('input'),visual=el('span',undefined,'quick-option');
  label.dataset.tone=item.tone;label.title=item.label;input.type='radio';input.name='quick-'+game.key;input.value=value;input.checked=status===value;input.dataset.workKey=game.key;input.setAttribute('aria-label',game.name+'：'+item.label);visual.append(icon(item.icon));label.append(input,visual);controls.append(label);
  label.onpointerdown=()=>{keyboard=false;};input.onkeydown=()=>{keyboard=true;};
  const saveStatus=next=>{update(game.key,{status:next});persist();render();if(keyboard){const replacement=[...$('grid').querySelectorAll('.quick-choice input')].find(n=>n.dataset.workKey===game.key&&n.value===value);replacement?.focus();}};
  input.onclick=e=>{e.preventDefault();saveStatus(status===value?'未開始':value);};
  input.onchange=()=>{if(input.checked)saveStatus(value);};
 }
 return controls;
}
for(const b of $('views').querySelectorAll('button'))b.onclick=()=>{view=b.dataset.view;category='';$('status').value='';page=1;render();};
$('category-filter').onchange=()=>{category=$('category-filter').value;page=1;render();};
for(const id of ['search','platform','status','membership','sort'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render();});
$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
$('select-all').onclick=()=>{shown.forEach(g=>selected.add(g.key));render();};$('clear-selection').onclick=()=>{selected.clear();render();};
function batch(fn){for(const id of selected)fn(id);const saved=persist();render();if(saved)notice('已更新選取的遊戲。');}
$('apply-status').onclick=()=>batch(id=>update(id,{status:$('batch-status').value}));$('apply-category').onclick=()=>{const c=$('batch-category').value;if(c)batch(id=>update(id,{categories:[...new Set([...record(id).categories,c])]}));};
function edit(g){const r=record(g.key);$('edit-name').textContent=g.name;$('edit-id').value=g.key;$('edit-info').textContent=`${g.platforms.join(' · ')||'未知平台'} · ${g.members.length} 筆授權 · 整理資料由此作品共用`;$('edit-conflicts').hidden=!hasWorkConflicts(state.personal,g);$('edit-versions').open=false;$('edit-versions').hidden=g.members.length<2;$('edit-version-list').replaceChildren();for(const m of g.members){const item=el('p',`${m.platform||'未知平台'} · ${m.membership==='PS_PLUS'?'PS Plus':m.membership==='NONE'?'非 PS Plus':'來源未分類'}${(state.library.missingIds||[]).includes(m.entitlementId)?' · 最近同步未出現':''}`);item.append(el('small',m.productId||m.entitlementId));$('edit-version-list').append(item);}setEditorStatus(r.status);$('edit-note').value=r.note;$('edit-tags').value=r.tags.join(', ');$('edit-categories').replaceChildren();for(const c of state.personal.categories){const label=el('label',undefined,'check'),check=el('input');check.type='checkbox';check.value=c;check.checked=r.categories.includes(c);label.append(check,document.createTextNode(c));$('edit-categories').append(label);}$('store-link').hidden=!/^[A-Z0-9_-]+$/i.test(g.productId||'');$('store-link').href='https://store.playstation.com/zh-hant-tw/product/'+encodeURIComponent(g.productId||'');$('editor').showModal();}
$('edit-form').onsubmit=e=>{e.preventDefault();const tags=[...new Set($('edit-tags').value.split(/[,，]/).map(t=>t.trim()).filter(Boolean))];if(tags.some(t=>t.length>100))return notice('每個標籤最多 100 字。');update($('edit-id').value,{status:$('edit-status').value,note:$('edit-note').value,tags,categories:[...$('edit-categories').querySelectorAll('input:checked')].map(n=>n.value)});persist();$('editor').close();render();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('settings').onclick=()=>$('data-dialog').showModal();
$('mobile-settings').onclick=()=>$('data-dialog').showModal();
$('mobile-categories').onclick=()=>{renderCategories();$('category-dialog').showModal();};
function renderCategories(){$('category-list').replaceChildren();for(const c of state.personal.categories){const row=el('div',undefined,'category-row'),name=el('span',c),rename=el('button','重新命名'),remove=el('button','刪除');rename.onclick=()=>{const next=prompt('新分類名稱',c)?.trim();if(!next||next===c)return;if(next.length>100||state.personal.categories.includes(next))return notice('名稱過長或已存在。');state.personal.categories=state.personal.categories.map(x=>x===c?next:x);for(const r of [...Object.values(state.personal.records),...Object.values(state.personal.works)])r.categories=r.categories.map(x=>x===c?next:x);if(category===c)category=next;persist();renderCategories();render();};remove.onclick=()=>{if(!confirm(`刪除「${c}」分類？遊戲及其他整理紀錄會保留。`))return;state.personal.categories=state.personal.categories.filter(x=>x!==c);for(const r of [...Object.values(state.personal.records),...Object.values(state.personal.works)])r.categories=r.categories.filter(x=>x!==c);if(category===c)category='';persist();renderCategories();render();};row.append(name,rename,remove);$('category-list').append(row);}}
$('manage-categories').onclick=()=>{renderCategories();$('category-dialog').showModal();};$('category-form').onsubmit=e=>{e.preventDefault();const c=$('category-name').value.trim();if(!c||state.personal.categories.includes(c))return notice('分類名稱不可空白或重複。');state.personal.categories.push(c);$('category-name').value='';persist();renderCategories();render();};
function recordDescription(r){
 if(!r)return '沒有整理紀錄';
 const status=classificationFor(r.status)?.label||(r.status==='未開始'?'未分類':r.status);
 return `標記：${status}\n分類：${r.categories.join('、')||'無'}\n標籤：${r.tags.join('、')||'無'}\n筆記：${r.note||'無'}\n最後整理：${r.updatedAt||'未記錄'}${r.favorite||r.rating?'\n包含舊版收藏／評分資料':''}`;
}
function preview(data,source,{action='import',expected=null}={}){
 if(pendingImport?.applying)return;
 const plan=compareImport(state,data);pendingImport={data,source,plan,action,expected,choices:Object.create(null),base:JSON.stringify(state)};
 $('import-notice').hidden=true;$('import-title').textContent=action==='upload'?'比較與上傳 Google Drive':'比較與匯入';
 $('import-preview').textContent=`來源：${source}${expected?.file?.modifiedTime?' · 雲端修改：'+new Date(expected.file.modifiedTime).toLocaleString('zh-TW'):''}。${action==='upload'?'確認後將選擇的合併結果上傳雲端，並同步保存在本機。':'下載與預覽不會直接覆蓋本機。'}`;
 $('import-summary').replaceChildren();
 for(const [label,count] of [['新增授權',plan.changes.added.length],['授權資料更新',plan.changes.updated.length],['僅本機整理',plan.counts.local],['僅匯入整理',plan.counts.incoming],['整理衝突',plan.counts.conflict],['整理相同',plan.counts.same]]){const item=el('div');item.append(el('strong',count),el('span',label));$('import-summary').append(item);}
 $('library-differences').hidden=!data.library;$('library-difference-list').replaceChildren();
 for(const [label,list] of [['新增授權',plan.changes.added],['授權資料更新',plan.changes.updated],['僅本機授權（保留）',plan.changes.localOnly]]){
  const detail=el('details');detail.append(el('summary',`${label} · ${list.length}`));for(const g of list)detail.append(el('p',`${g.name} · ${g.platform||'未知平台'} · ${g.entitlementId}`));$('library-difference-list').append(detail);
 }
 $('personal-options').hidden=!plan.hasPersonal;$('export-incoming').hidden=!data.personal&&!data.library;$('import-mode').value='merge';$('personal-differences').replaceChildren();
 const categoryInfo=el('p',`自訂分類：本機 ${plan.categories.local.join('、')||'無'}；匯入 ${plan.categories.incoming.join('、')||'無'}。合併時保留兩邊的分類。`);$('personal-differences').append(categoryInfo);
 for(const row of plan.rows.filter(r=>r.type!=='same')){
  const detail=el('details',undefined,'record-difference');detail.open=row.type==='conflict';
  detail.append(el('summary',`${row.name} · ${{local:'僅本機，保留',incoming:'僅匯入，新增',conflict:'內容不同'}[row.type]}`));
  if(row.type==='conflict'){
   const label=el('label','這筆整理使用'),select=el('select');select.dataset.rowId=row.id;select.setAttribute('aria-label',row.name+' 的衝突處理');option(select,'local','本機內容');option(select,'incoming',source+' 的內容');select.onchange=()=>{pendingImport.choices[row.id]=select.value;updateImportEffect();};label.append(select);detail.append(label);
  }
  const columns=el('div',undefined,'comparison-columns');for(const [title,value] of [['本機',row.before],[source,row.after]]){const column=el('div');column.append(el('strong',title),el('pre',recordDescription(value)));columns.append(column);}detail.append(columns);$('personal-differences').append(detail);
 }
 updateImportEffect();if(!$('confirm-dialog').open)$('confirm-dialog').showModal();
}
function updateImportEffect(){
 if(!pendingImport)return;const {plan,action,choices}=pendingImport,mode=$('import-mode').value;
 const incoming=plan.rows.filter(r=>r.type==='conflict'&&choices[r.id]==='incoming').length;
 $('import-mode-hint').textContent=mode==='merge'?'本機獨有的進度會保留，匯入獨有的整理會加入；內容不同時逐筆決定，不依時間自動覆蓋。':mode==='keep'?'保留全部本機分類、標籤與筆記；不加入匯入的個人整理。':'將捨棄本機獨有的整理，並使用來源的整份個人整理。請確認差異與復原備份。';
 $('conflict-actions').hidden=mode!=='merge'||!plan.counts.conflict;
 for(const select of $('personal-differences').querySelectorAll('select'))select.disabled=mode!=='merge';
 $('comparison-selection').textContent=mode==='merge'?`衝突 ${plan.counts.conflict} 筆：保留本機 ${plan.counts.conflict-incoming} 筆，使用匯入 ${incoming} 筆。`:'';
 $('import-effect').textContent=`${action==='upload'?'上傳並保存':'套用後'}：遊戲授權採合併，保留 ${plan.changes.localOnly.length} 筆本機獨有授權。${!plan.hasPersonal?'個人整理保持不變。':mode==='merge'?'個人整理採合併；未選擇改用匯入內容的衝突會保留本機。':mode==='keep'?'保留全部本機整理。':'個人整理整份取代。'}`;
 $('confirm-import').textContent=action==='upload'?'確認並上傳':mode==='replace'?'確認取代個人整理':mode==='keep'?'只更新遊戲庫':'套用合併';
}
$('import-mode').onchange=updateImportEffect;
$('export-incoming').onclick=()=>{if(!pendingImport)return;const {data}=pendingImport;const value=data.personal&&data.library?backup({library:{...data.library,missingIds:data.missingIds||[]},personal:data.personal}):data.personal||data.library;if(value){download(value,'comparison-source');notice('已另存比較來源 JSON；本機整理尚未變更。');}};
for(const [id,value] of [['choose-local','local'],['choose-incoming','incoming']])$(id).onclick=()=>{if(!pendingImport)return;for(const select of $('personal-differences').querySelectorAll('select')){select.value=value;pendingImport.choices[select.dataset.rowId]=value;}updateImportEffect();};
$('confirm-dialog').addEventListener('cancel',e=>{if(pendingImport?.applying)e.preventDefault();});
$('confirm-dialog').addEventListener('close',()=>{pendingImport=null;});
$('import').onclick=$('empty-import').onclick=()=>$('file').click();$('file').onchange=async()=>{try{const file=$('file').files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('JSON 檔案上限為 5 MB。');preview(parseImport(JSON.parse(await file.text())),file.name);}catch(e){notice('匯入失敗：'+e.message);}finally{$('file').value='';}};
const RECOVERY_KEY=KEY+'.before-import';
function saveRecovery(){if(demo)return;localStorage.setItem(RECOVERY_KEY,JSON.stringify(backup()));$('export-recovery').disabled=false;}
try{$('export-recovery').disabled=!localStorage.getItem(RECOVERY_KEY);}catch{}
$('export-recovery').onclick=()=>{try{const raw=localStorage.getItem(RECOVERY_KEY);if(!raw)throw Error('尚無操作前備份。');const value=JSON.parse(raw);parseImport(value);download(value,'before-import');notice('已匯出上次操作前備份，可透過匯入預覽恢復整理。');}catch(e){notice(e.message);}};
$('confirm-import').onclick=async()=>{
 const pending=pendingImport;if(!pending||pending.applying)return;
 if(externalChanged)return notice('另一分頁已更新資料，請先匯出目前備份並重新整理，再重新比較。');
 if(pending.base!==JSON.stringify(state)){preview(pending.data,pending.source,pending);return notice('本機資料已變更，已重新比較。請重新確認選擇。');}
 pending.applying=true;const buttons=[...$('confirm-dialog').querySelectorAll('button,select')];for(const b of buttons)b.disabled=true;
 const uploading=pending.action==='upload';let uploaded=false;
 try{
  if(uploading&&demo)throw Error('示範模式不執行雲端同步。');
  const next=resolveImport(state,pending.data,pending.plan,{mode:$('import-mode').value,choices:pending.choices});
  const value=backup(next);if(new Blob([JSON.stringify(value)]).size>5*1024*1024)throw Error('合併後備份超過 5 MB，請減少資料後再操作。');
  try{saveRecovery();}catch{throw Error('無法保存操作前備份，已停止套用。請先匯出完整備份並釋放瀏覽器空間。');}
  if(uploading){cloudBusy=true;renderCloud();await drive.write(value,pending.expected);uploaded=true;cloudRead=false;}
  if(externalChanged)throw Error('另一分頁已更新資料，本頁未覆寫本機。請重新整理後再比較。');
  if(!demo){try{localStorage.setItem(KEY,JSON.stringify(next));}catch{throw Error('本機儲存失敗，原本機進度仍保留；請釋放空間後重試。');}}
  state=next;storageFailed=false;selected.clear();category='';page=1;render();$('confirm-dialog').close();
  notice(uploading?'合併結果已上傳並保存在本機。可匯出上次操作前備份。':'已依比較結果套用；可在資料與同步匯出上次操作前備份。');
 }catch(e){notice((uploaded?'雲端已上傳，但本機未套用。':'')+e.message);}
 finally{pending.applying=false;for(const b of buttons)b.disabled=false;if(pendingImport)updateImportEffect();if(uploading){cloudBusy=false;renderCloud();}}
};
$('export-library').onclick=()=>{const value=library(state.library),missing=new Set(state.library.missingIds||[]);value.games=value.games.filter(g=>!missing.has(g.entitlementId));download(value,'library');notice(`已匯出 ${value.games.length} 筆遊戲授權（不含個人整理）。`);};$('export-personal').onclick=()=>{download(state.personal,'personal');notice('已匯出個人分類、標籤與筆記。');};$('export-backup').onclick=()=>{download(backup(),'backup');notice('已匯出完整備份，包含遊戲庫與個人整理。');};
$('fetch').onclick=()=>{if(demo)return notice('請先離開示範模式，再更新個人遊戲庫。');if(bridge)return notice('更新分頁仍在等待中，請查看官方分頁；五分鐘後可重新開啟。');const session=crypto.randomUUID();const url=new URL('https://library.playstation.com/recently-purchased');url.hash=new URLSearchParams({psgbOrigin:location.origin,psgbSession:session}).toString();const child=window.open(url.href,'_blank');if(!child)return notice('分頁無法開啟，請允許彈出視窗。');bridge={session,child};notice('請在官方分頁登入並選「已購買」；需先安裝本專案的腳本。');bridgeTimer=setTimeout(()=>{bridge=null;notice('尚未收到資料。請確認腳本已安裝，或從官方分頁匯出 JSON 後匯入。');},300000);};
window.addEventListener('message',event=>{if(!bridge||event.origin!=='https://library.playstation.com'||event.source!==bridge.child||event.data?.session!==bridge.session)return;const msg=event.data;if(msg.type==='PSGB_STATUS')notice(msg.message);if(msg.type==='PSGB_RESULT'){try{const data=library(msg.payload);if(!data.complete)throw Error('僅接受完整同步回傳；部分結果請手動匯入。');clearTimeout(bridgeTimer);bridge=null;preview({library:data},'官方分頁同步');}catch(e){notice('同步資料無效：'+e.message);}}});
const auth=new window.SideProjectAuth.GoogleAuth('260923931716-cevi1vcfrfoibmn3i2fdpsn1epg7hr3g.apps.googleusercontent.com',renderCloud),drive=new window.SideProjectDrive.DriveAppData(auth,'ps-game-base.json');
function renderCloud(){const connected=auth?.connected;for(const id of ['cloud-read','cloud-write','cloud-disconnect'])$(id).disabled=!connected||cloudBusy;$('cloud-connect').disabled=cloudBusy||connected;$('cloud-connect').textContent=prepared?'連接 Google Drive':'載入 Google 授權服務';$('cloud-state').textContent=connected?`已授權 · ${cloudRead?'已讀取雲端版本；上傳時會再次比較':'可下載比較，或比較後上傳'}`:'尚未連接或授權已過期。';}
async function cloudAction(action){if(demo)return notice('示範模式不執行雲端同步。');cloudBusy=true;renderCloud();try{await action();}catch(e){notice(e.message);}finally{cloudBusy=false;renderCloud();}}
$('cloud-connect').onclick=()=>cloudAction(async()=>{if(!prepared){await auth.prepare();prepared=true;notice('授權服務已就緒，請再次點擊「連接 Google Drive」。');}else{await auth.connect();cloudRead=false;}});
$('cloud-disconnect').onclick=()=>{auth.disconnect();cloudRead=false;renderCloud();};
$('cloud-read').onclick=()=>cloudAction(async()=>{const result=await drive.read();if(!result){cloudRead=true;return notice('雲端尚無備份，可以上傳本機資料。');}const data=parseImport(result.value);if(!data.personal||!data.library)throw Error('雲端檔案不是完整遊戲庫備份。');cloudRead=true;preview(data,'Google Drive',{expected:result});});
$('cloud-write').onclick=()=>cloudAction(async()=>{const result=await drive.read();let data={};if(result){data=parseImport(result.value);if(!data.personal||!data.library)throw Error('雲端檔案不是完整遊戲庫備份。');}cloudRead=true;preview(data,result?'Google Drive':'Google Drive（尚無備份）',{action:'upload',expected:result});});
let realState;
$('demo').onclick=()=>{realState=structuredClone(state);demo=true;state={library:{schemaVersion:1,complete:true,syncedAt:null,missingIds:[],games:['ASTRO BOT','Ghost of Yōtei','DEATH STRANDING 2','FINAL FANTASY VII REBIRTH','ELDEN RING','Horizon Forbidden West','God of War Ragnarök','It Takes Two'].map((name,i)=>({name,entitlementId:'demo-'+i,conceptId:'demo-concept-'+i,platform:i===7?'PS4':'PS5',membership:i%3===0?'PS_PLUS':'NONE'}))},personal:emptyPersonal()};for(const index of [4,5])state.library.games.push({...state.library.games[index],entitlementId:'demo-ps4-'+index,platform:'PS4'});state.personal.categories=['週末雙人','劇情精選','挑戰清單'];state.library.games.forEach((g,i)=>{state.personal.records[g.entitlementId]={...blankRecord(),status:['未開始','想玩','已白金','不再遊玩'][i%4],categories:i%2===0?['劇情精選']:[]};});render();notice('正在探索示範；不會寫入本機或雲端。');};
$('reset-demo').onclick=()=>{if(!demo)return;state=realState;demo=false;selected.clear();category='';view='all';render();notice('已返回你的遊戲庫。');};
window.addEventListener('storage',event=>{if(event.key===KEY){externalChanged=true;notice('另一個分頁已更新遊戲庫。已停止此頁寫入，請先匯出此頁備份，再重新整理載入最新資料。');}});
render();renderCloud();
