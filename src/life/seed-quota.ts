import type {ContentRegistry} from './registry';
import type {ContentRef,LifeSave,SeedPlant} from './types';

const matches=(a:ContentRef,b:ContentRef)=>a.id===b.id&&a.revision===b.revision&&a.hash===b.hash&&a.capability===b.capability;
const source=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(v);
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,any>,s:string)=>Object.keys(v).sort().join(',')===s;

/** Read only; untracked goods include every pre-policy harvest and import. */
export function seedSources(s:LifeSave,ref:ContentRef,total:number){
 const harvests=(s.lifeV1?.seedQuotaV1?.harvests??[]).filter(h=>matches(h.plant.ref,ref));
 return {legacyQuantity:total-harvests.reduce((n,h)=>n+h.quantity,0),harvests};
}
export function pinSeedPlant(s:LifeSave,ref:ContentRef,plot:string,actionId:string){
 const q=s.lifeV1!.seedQuotaV1??={policy:'one-seed-per-plant-v1',plants:{},harvests:[]};
 if(q.plants[plot]||q.harvests.some(h=>h.plant.id===actionId))throw Error('SEED_PLANT_CONFLICT');
 q.plants[plot]={id:actionId,ref:{...ref},plantedMinute:s.townMinutes??540};
}
export function recordSeedHarvest(s:LifeSave,ref:ContentRef,plot:string,actionId:string,quantity:number){
 const q=s.lifeV1!.seedQuotaV1,p=q?.plants[plot];
 if(!p)return; // Standing old plants still produce unrestricted old-rule goods.
 if(!matches(p.ref,ref)||q!.harvests.some(h=>h.id===actionId||h.plant.id===p.id))throw Error('SEED_PLANT_CONFLICT');
 if(q!.harvests.length>=9999)throw Error('HARVEST_RECORD_CAPACITY');
 q!.harvests.push({id:actionId,plant:structuredClone(p),harvestMinute:s.townMinutes??540,quantity,seedSpent:false});
 delete q!.plants[plot];
}
/** Every sale/delivery uses the same accounting. Old goods first, then goods
 * already used for seed; eligible harvests last. No quantity can become old
 * merely by merging it into a lot or consuming another harvest. */
export function consumeSeedHarvest(s:LifeSave,ref:ContentRef,total:number,quantity:number,selected?:string){
 const {legacyQuantity,harvests}=seedSources(s,ref,total);
 let remaining=quantity;
 if(selected!==undefined){
  const h=harvests.find(h=>h.id===selected);
  if(!h||h.quantity<quantity)throw Error('HARVEST_BATCH_UNAVAILABLE');
  h.quantity-=quantity;remaining=0;
 }else{
  remaining-=Math.min(remaining,legacyQuantity);
  for(const h of [...harvests.filter(h=>h.seedSpent),...harvests.filter(h=>!h.seedSpent)]){
   const used=Math.min(remaining,h.quantity);h.quantity-=used;remaining-=used;
  }
 }
 if(remaining)throw Error('ITEMS_MISSING');
 const q=s.lifeV1!.seedQuotaV1;
 if(q)q.harvests=q.harvests.filter(h=>h.quantity>0);
}
export function assertSeedQuotaReadable(s:LifeSave,r:ContentRegistry){
 const q=s.lifeV1?.seedQuotaV1;if(q===undefined)return;
 const bad=()=>{throw Error('UNSUPPORTED_SEED_QUOTA_SAVE')};
 if(!object(q)||!keys(q,'harvests,plants,policy')||q.policy!=='one-seed-per-plant-v1'||!object(q.plants)||Object.keys(q.plants).length>5||!Array.isArray(q.harvests)||q.harvests.length>9999)bad();
 const now=s.townMinutes??540,ids=new Set<string>(),batches=new Set<string>();
 const plant=(p:SeedPlant)=>{
  if(!object(p)||!keys(p,'id,plantedMinute,ref')||!source(p.id)||ids.has(p.id)||batches.has(p.id)||!integer(p.plantedMinute,0,now))bad();
  ids.add(p.id);
  if(!object(p.ref)||!keys(p.ref,'capability,hash,id,revision'))bad();
  try{r.get(p.ref)}catch{bad()}
 };
 for(const [id,p] of Object.entries(q.plants)){
  plant(p);const pinned=s.lifeV1!.plots[id]?.ref??s.lifeV1!.legacyPlotRefs[id];
  if(!pinned||!matches(p.ref,pinned))bad();
 }
 for(const h of q.harvests){
  if(!object(h)||!keys(h,'harvestMinute,id,plant,quantity,seedSpent')||!source(h.id)||batches.has(h.id)||typeof h.seedSpent!=='boolean')bad();
  batches.add(h.id);plant(h.plant);
  if(ids.has(h.id))bad();ids.add(h.id);
  if(!integer(h.harvestMinute,h.plant.plantedMinute,now)||!integer(h.quantity,1,r.get(h.plant.ref).yield))bad();
 }
 for(const l of s.lifeV1!.lots.filter(l=>l.kind==='produce'))if(seedSources(s,l.ref,l.quantity).legacyQuantity<0)bad();
 for(const h of q.harvests)if(!s.lifeV1!.lots.some(l=>l.kind==='produce'&&matches(l.ref,h.plant.ref)))bad();
}
