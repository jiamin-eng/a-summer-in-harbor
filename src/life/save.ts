import {legacyDefinitions,ContentRegistry} from './registry';
import type {ContentRef,LifeSave,LifeState,Lot} from './types';
import {assertSeedQuotaReadable,consumeSeedHarvest,pinSeedPlant,recordSeedHarvest,seedSources} from './seed-quota';

export const sameRef=(a:ContentRef,b:ContentRef)=>a.id===b.id&&a.revision===b.revision&&a.hash===b.hash&&a.capability===b.capability;
const int=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&(n as number)>=min&&(n as number)<=max;
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const source=(s:unknown)=>typeof s==='string'&&s.length>0&&s.length<=120;
export const giftItems=['life-gift:theo-menu','life-gift:dani-page'] as const;
export const displaySlots=['home-shelf-1','home-shelf-2'] as const;

export function addLot(s:LifeSave,r:ContentRegistry,ref:ContentRef,kind:Lot['kind'],quantity:number,actionId:string){
 const maximum=r.isLegacy(ref)?Number.MAX_SAFE_INTEGER:9999;
 if(!int(quantity,1,maximum))throw Error('INVALID_QUANTITY');const item=r.item(ref,kind),before=s.items[item]??0;
 if(!int(before+quantity,0,maximum))throw Error('INVENTORY_FULL');
 const life=s.lifeV1!,old=life.lots.find(l=>l.kind===kind&&sameRef(l.ref,ref));
 if(old){old.quantity+=quantity;old.lastSource=actionId}else{if(life.lots.length>=64)throw Error('LOT_CAPACITY');life.lots.push({ref:{...ref},kind,quantity,firstSource:actionId,lastSource:actionId})}
 s.items[item]=before+quantity;
}
export function consumeLot(s:LifeSave,r:ContentRegistry,ref:ContentRef,kind:Lot['kind'],quantity:number,harvestBatch?:string){
 if(!int(quantity,1,9999))throw Error('INVALID_QUANTITY');const life=s.lifeV1!,lot=life.lots.find(l=>l.kind===kind&&sameRef(l.ref,ref));
 if(!lot||lot.quantity<quantity)throw Error('ITEMS_MISSING');
 if(kind==='produce')consumeSeedHarvest(s,ref,lot.quantity,quantity,harvestBatch);
 lot.quantity-=quantity;const item=r.item(ref,kind);s.items[item]-=quantity;
 life.lots=life.lots.filter(l=>l.quantity>0);
}
export function consumeForSeed(s:LifeSave,r:ContentRegistry,ref:ContentRef,harvestBatch?:string){
 const lot=s.lifeV1!.lots.find(l=>l.kind==='produce'&&sameRef(l.ref,ref));
 if(!lot)throw Error('ITEMS_MISSING');
 const sources=seedSources(s,ref,lot.quantity);
 const h=harvestBatch!==undefined?sources.harvests.find(h=>h.id===harvestBatch):sources.legacyQuantity>0?undefined:sources.harvests.find(h=>!h.seedSpent);
 if(harvestBatch!==undefined&&!h)throw Error('HARVEST_BATCH_UNAVAILABLE');
 if(h?.seedSpent||!h&&sources.legacyQuantity<=0)throw Error('SEED_QUOTA_SPENT');
 if(h)h.seedSpent=true;
 consumeLot(s,r,ref,'produce',1,h?.id);
 return !!h;
}
/** Pure lazy pinning. Authority.upgrade stays identity: merely opening old saves
 * never persists this result or creates a receipt, discovery or reward. */
export function pinLegacy(previous:LifeSave,r:ContentRegistry):LifeSave{
 assertLifeReadable(previous,r);const s=structuredClone(previous);if(s.lifeV1)return s;
 s.lifeV1={schema:1,lots:[],legacyPlotRefs:{},plots:{},collections:{},display:{},firstRewards:[],cooldownUntil:0,events:[]};
 for(const d of legacyDefinitions){const ref=r.ref(d.id);for(const kind of ['seed','produce'] as const){const quantity=s.items[r.item(ref,kind)]??0;if(quantity){s.lifeV1.lots.push({ref,kind,quantity,firstSource:'legacy-import:'+s.id,lastSource:'legacy-import:'+s.id})}}}
 for(const [id,p] of Object.entries(s.plots??{}))s.lifeV1.legacyPlotRefs[id]=r.ref('crop:'+p.crop);
 return s;
}
/** Original authored crop actions retain their root fields. This adapter mirrors
 * only their real delta into the immutable legacy batches, in the same commit. */
export function reconcileAuthored(previous:LifeSave,next:LifeSave,r:ContentRegistry,actionId:string):LifeSave{
 const planted=Object.entries(next.plots??{}).filter(([id])=>!previous.plots?.[id]);
 if(!previous.lifeV1&&!planted.length)return next;
 const before=pinLegacy(previous,r),s=structuredClone(next);s.lifeV1=structuredClone(before.lifeV1!);
 for(const d of legacyDefinitions){const ref=r.ref(d.id);for(const kind of ['seed','produce'] as const){const key=r.item(ref,kind),delta=(next.items[key]??0)-(previous.items[key]??0);
   // add/consume update the root quantity; start at the previous count.
   s.items[key]=previous.items[key]??0;if(delta>0)addLot(s,r,ref,kind,delta,actionId);if(delta<0)consumeLot(s,r,ref,kind,-delta);
   if(next.items[key]===undefined)delete s.items[key];
 }}
 s.lifeV1.legacyPlotRefs={};for(const [id,p] of Object.entries(s.plots??{}))s.lifeV1.legacyPlotRefs[id]=r.ref('crop:'+p.crop);
 for(const [id,p] of Object.entries(previous.plots??{}))if(!next.plots?.[id])recordSeedHarvest(s,r.ref('crop:'+p.crop),id,actionId,r.get(r.ref('crop:'+p.crop)).yield);
 for(const [id,p] of planted)pinSeedPlant(s,r.ref('crop:'+p.crop),id,actionId);
 assertLifeReadable(s,r);return s;
}
export function assertLifeReadable(s:LifeSave,r:ContentRegistry):void{
 const bad=()=>{throw Error('UNSUPPORTED_LIFE_SAVE')};
 if(!int(s.cash,0,999)||!int(s.energy,0,100)||!int(s.townMinutes??540)||!int(s.awakeMinutes??0)||!record(s.items)||Object.values(s.items).some(n=>!int(n)))bad();
 const life=s.lifeV1;if(life===undefined){if(Object.keys(s.items).some(k=>k.startsWith('life-')&&(s.items[k]??0)>0))bad();return}
 if(!record(life)||life.schema!==1||Object.keys(life).some(k=>!['schema','lots','legacyPlotRefs','plots','collections','display','firstRewards','order','cooldownUntil','events','seedQuotaV1'].includes(k))||!Array.isArray(life.lots)||life.lots.length>64||!record(life.legacyPlotRefs)||!record(life.plots)||Object.keys(life.plots).length>2||!record(life.collections)||Object.keys(life.collections).length>64||!record(life.display)||!Array.isArray(life.firstRewards)||!int(life.cooldownUntil)||!Array.isArray(life.events)||life.events.length>128)bad();
 const totals:Record<string,number>={},identities=new Set<string>(),now=s.townMinutes??540;
 const ref=(v:ContentRef)=>{try{if(!record(v)||Object.keys(v).sort().join(',')!=='capability,hash,id,revision')bad();r.get(v)}catch{bad()}};
 for(const l of life.lots){if(!record(l)||Object.keys(l).sort().join(',')!=='firstSource,kind,lastSource,quantity,ref'||!['seed','produce'].includes(l.kind)||!int(l.quantity,1)||!source(l.firstSource)||!source(l.lastSource))bad();ref(l.ref);if(!r.isLegacy(l.ref)&&l.quantity>9999)bad();const identity=l.ref.id+'@'+l.ref.revision+':'+l.kind;if(identities.has(identity))bad();identities.add(identity);const item=r.item(l.ref,l.kind);totals[item]=(totals[item]??0)+l.quantity;if(!int(totals[item],0,r.isLegacy(l.ref)?Number.MAX_SAFE_INTEGER:9999))bad()}
 for(const d of legacyDefinitions)for(const kind of ['seed','produce'] as const){const key=r.item(r.ref(d.id),kind);if((totals[key]??0)!==(s.items[key]??0))bad()}
 for(const [key,n] of Object.entries(totals))if(n!==s.items[key])bad();
 for(const key of Object.keys(s.items))if(key.startsWith('life-seed:')||key.startsWith('life-produce:')){if((totals[key]??0)!==s.items[key])bad()}
 for(const key of Object.keys(s.items))if(key.startsWith('life-')&&!key.startsWith('life-seed:')&&!key.startsWith('life-produce:')&&!giftItems.includes(key as any))bad();
 for(const [id,p] of Object.entries(life.plots)){if(!/^life-bed-[12]$/.test(id)||!record(p)||Object.keys(p).sort().join(',')!=='grown,ref,updatedAt,wetUntil')bad();ref(p.ref);const d=r.get(p.ref);if(r.isLegacy(p.ref)||!int(p.grown,0,d.growMinutes)||!int(p.updatedAt,0,now)||!int(p.wetUntil,p.updatedAt,p.updatedAt+d.wetMinutes))bad()}
 if(Object.keys(life.legacyPlotRefs).sort().join(',')!==Object.keys(s.plots??{}).sort().join(','))bad();
 for(const [id,v] of Object.entries(life.legacyPlotRefs)){ref(v);if(!r.isLegacy(v)||v.id!=='crop:'+s.plots![id].crop)bad()}
 assertSeedQuotaReadable(s,r);
 for(const [id,d] of Object.entries(life.collections)){
  if(!record(d)||d.id!==id||!source(d.sourceAction)||!int(d.minute,0,now)||Object.keys(d).some(k=>!['id','sourceAction','minute','ref','source'].includes(k)))bad();
  if(id.startsWith('seed:crop:')){if(!d.ref||id!=='seed:'+d.ref.id||d.source)bad();ref(d.ref!)}
  else if(/^observe:harbor-cat-[123]:(sun-rest|sleep)$/.test(id)||/^observe:harbor-gull-[1-4]:shore-space$/.test(id)){if(!d.source||d.source.kind!=='animal-schedule'||d.source.id!==id.split(':')[1]||!source(d.source.visualVersion)||d.ref)bad()}
  else if(giftItems.some(g=>id==='gift:'+g)){if(d.ref||d.source)bad()}
  else if(id==='news:first-experience'){if(!d.source||d.source.kind!=='frozen-news'||!source(d.source.id)||!/^[a-f0-9]{64}$/.test(d.source.hash)||d.ref)bad()}
  else bad();
  if(d.source&&Object.keys(d.source).sort().join(',')!==(d.source.kind==='animal-schedule'?'id,kind,visualVersion':'hash,id,kind'))bad();
 }
 for(const [slot,gift] of Object.entries(life.display)){if(!displaySlots.includes(slot as any)||!giftItems.includes(gift as any)||(s.items[gift]??0)<Object.values(life.display).filter(g=>g===gift).length)bad()}
 if(life.firstRewards.some(k=>!['theo-order-first','dani-share-first'].includes(k))||new Set(life.firstRewards).size!==life.firstRewards.length)bad();
 for(const [i,gift] of giftItems.entries()){if(!int(s.items[gift]??0,0,1))bad();const key=i===0?'theo-order-first':'dani-share-first',found=!!life.collections['gift:'+gift];if(found!==life.firstRewards.includes(key)||(s.items[gift]??0)>0&&!found)bad()}
 if(life.order){const o=life.order;ref(o.crop);if(Object.keys(o).sort().join(',')!=='acceptedMinute,crop,definition,dueMinute,id,quantity,reward'||o.definition!=='theo-peas-v1'||o.crop.id!=='crop:snap-pea'||o.quantity!==2||o.reward!==10||!source(o.id)||!int(o.acceptedMinute,0,now)||o.dueMinute!==(Math.floor(o.acceptedMinute/1440)+2)*1440+1020)bad()}
 const eventIds=new Set<string>();let minute=-1;
 for(const e of life.events){if(!record(e)||Object.keys(e).sort().join(',')!=='cash,energy,facts,id,items,minute,relations,verb'||!source(e.id)||eventIds.has(e.id)||!source(e.verb)||!int(e.minute,Math.max(0,minute),now)||!int(e.cash,-999,999)||!int(e.energy,-100,100)||!record(e.items)||!record(e.relations)||Object.keys(e.items).length>20||Object.values(e.items).some(n=>!int(n,-9999,9999))||Object.keys(e.relations).some(k=>!['theo','dani'].includes(k))||Object.values(e.relations).some(n=>!int(n,-200,200))||!Array.isArray(e.facts)||e.facts.length>8||e.facts.some(f=>typeof f!=='string'||f.length>160))bad();minute=e.minute;eventIds.add(e.id)}
}
