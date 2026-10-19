import {groupGames,workRecordFor} from './model.js?v=20261019-8';

const titleId = game => ['PS4','PS5'].includes(game.platform?.toUpperCase()) && /^(CUSA|PPSA)\d{5}_\d{2}$/i.test(game.titleId || '') ? game.titleId.toUpperCase() : null;
function currentWorks(library) {
 const missing=new Set(library.missingIds || []);
 // The library is the digital-entitlement source of truth. Historic versions
 // can identify a platinum, but cannot make an absent/expired work eligible.
 return groupGames(library.games,library.missingIds).filter(work=>work.members.some(game=>!missing.has(game.entitlementId)&&game.isActive!==false&&titleId(game)));
}
export function platinumTitleIds(library,personal) {
 return [...new Set(currentWorks(library).filter(work=>workRecordFor(personal,work).status!=='已白金').flatMap(work=>work.members.map(titleId).filter(Boolean)))];
}
export function applyPlatinum(state,earnedTitleIds,requestedTitleIds,now=new Date().toISOString()) {
 const requested=new Set(requestedTitleIds);
 if(!Array.isArray(earnedTitleIds)||earnedTitleIds.some(id=>typeof id!=='string'||!requested.has(id)))throw Error('白金回傳包含非本次查詢的遊戲版本，未套用。');
 const earned=new Set(earnedTitleIds);let changed=0;
 const works=Object.assign(Object.create(null),state.personal.works);
 for(const work of currentWorks(state.library)){
  const before=workRecordFor(state.personal,work);
  if(before.status==='已白金'||!work.members.some(game=>earned.has(titleId(game))))continue;
  works[work.key]={...before,status:'已白金',updatedAt:now};changed++;
 }
 return {changed,state:changed?{...state,personal:{...state.personal,works}}:state};
}
