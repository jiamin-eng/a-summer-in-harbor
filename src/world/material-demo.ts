import {globalPoint,zonesFor} from '../candidate/continuity';
import {waterBanks} from './strong-ground-edges';
import type {Rect} from '../engine/world';
export type MaterialDemoPiece={rect:Rect;kind:'stone'|'wood';side:'N'|'W'|'E'|'NW'};
/** QA-only visual prototype. No terrain, collision, portal or save mutation. */
export function materialDemoPieces(id:string,mode:string):MaterialDemoPiece[]{
 if(!['A','B','C'].includes(mode))return [];const out:MaterialDemoPiece[]=[];
 if(zonesFor(id).includes('bazaar')&&mode==='B')for(const [side,r] of [['NW',{x:170,y:190,w:40,h:40}],['N',{x:210,y:190,w:560,h:40}],['W',{x:170,y:230,w:40,h:360}]] as const)out.push({kind:'stone',side,rect:{...globalPoint('bazaar',{x:r.x,y:r.y}),w:r.w,h:r.h}});
 if(zonesFor(id).includes('bazaar')&&mode!=='B')for(const [side,r] of [['N',{x:190,y:198,w:580,h:24}],['W',{x:178,y:210,w:24,h:380}],['NW',{x:178,y:198,w:24,h:24}]] as const)out.push({kind:'stone',side,rect:{...globalPoint('bazaar',{x:r.x,y:r.y}),w:r.w,h:r.h}});
 if(zonesFor(id).includes('harbor'))for(const e of waterBanks('harbor')){
  if(e.dry!=='wood'||!['E','W'].includes(e.side)||e.from.x!==e.to.x)continue;
  if(![750,860].includes(e.from.x))continue;
  const y=Math.max(600,e.from.y),end=Math.min(905,e.to.y);if(end<=y)continue;
  out.push({kind:'wood',side:e.side as 'E'|'W',rect:{...globalPoint('harbor',{x:e.from.x-(e.side==='W'?40:0),y}),w:40,h:end-y}});
 }
 const merged:MaterialDemoPiece[]=[];for(const p of out){const prior=merged.find(q=>q.kind===p.kind&&q.side===p.side&&q.rect.x===p.rect.x&&q.rect.y+q.rect.h===p.rect.y);if(prior)prior.rect.h+=p.rect.h;else merged.push({...p,rect:{...p.rect}})}return merged;
}
