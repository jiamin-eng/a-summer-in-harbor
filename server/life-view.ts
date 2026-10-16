import {ContentRegistry,legacyDefinitions} from '../src/life/registry';
import {assertLifeReadable,displaySlots,giftItems,sameRef} from '../src/life/save';
import {battleLocksWorld} from '../src/story/turn-battle';
import type {ContentRef,LifeSave,Lot} from '../src/life/types';
import {lifePlotStatus} from '../src/life/rules';
import {landRegion} from '../src/life/land';
import {seedSources} from '../src/life/seed-quota';

/** Read-only DTO for the forthcoming bag/notebook UI. Resolves only pinned
 * definitions. Creates no save, pin, discovery, action, reward or receipt;
 * does not import a Node-backed registry into the browser bundle. */
export function lifeView(s:LifeSave,r:ContentRegistry,plants?:{ref:ContentRef;newStarts:boolean}){
 assertLifeReadable(s,r);
 const life=s.lifeV1,minute=s.townMinutes??540,blocked=!!s.activeChallenge||battleLocksWorld(s);
 const lots:Pick<Lot,'ref'|'kind'|'quantity'>[]=life?life.lots:legacyDefinitions.flatMap(d=>{
  const ref=r.ref(d.id);
  return (['seed','produce'] as const).flatMap(kind=>{const quantity=s.items[r.item(ref,kind)]??0;return quantity?[{ref,kind,quantity}]:[]});
 });
 const quantity=(ref:ContentRef,kind:Lot['kind'])=>lots.filter(l=>l.kind===kind&&sameRef(l.ref,ref)).reduce((n,l)=>n+l.quantity,0);
 const order=life?.order;
 const result={
  schema:1 as const,snapshotVersion:s.version,snapshotCursor:s.cursor,gameMinute:minute,
  persistence:life?'pinned' as const:'legacy-unpinned' as const,
  batches:lots.flatMap(l=>{
   const sources=seedSources(s,l.ref,l.quantity);
   const rows=l.kind==='seed'?[{quantity:l.quantity,harvestBatch:undefined,seedRule:'seed' as const,seedSpent:false}]:[
    ...(sources.legacyQuantity>0?[{quantity:sources.legacyQuantity,harvestBatch:undefined,seedRule:'legacy' as const,seedSpent:false}]:[]),
    ...sources.harvests.map(h=>({quantity:h.quantity,harvestBatch:h.id,seedRule:'one-per-plant' as const,seedSpent:h.seedSpent})),
   ];
   return rows.map(row=>({id:l.ref.id+'@'+l.ref.revision+':'+l.kind+(row.harvestBatch?':'+row.harvestBatch:''),ref:l.ref,name:r.get(l.ref).name,kind:l.kind,...row,
    ...(life?{origin:life.lots.find(o=>o.kind===l.kind&&sameRef(o.ref,l.ref))!}:{}),
    startAvailable:r.canStart(l.ref),salePrice:r.get(l.ref).salePrice,
    saveSeedAvailable:l.kind==='produce'&&row.quantity>0&&!row.seedSpent&&!blocked}));
  }),
  collections:Object.values(life?.collections??{}).map(d=>({record:d,
   ...(d.ref?{name:r.get(d.ref).name,physicalSeedQuantity:quantity(d.ref,'seed')}:{}),
   ...(d.id.startsWith('gift:')?{physicalGiftQuantity:s.items[d.id.slice(5)]??0}:{}),
   isRecord:true as const})),
  gifts:giftItems.map(id=>({id,quantity:s.items[id]??0})),
  display:displaySlots.map(id=>({id,gift:life?.display[id]??null})),
  order:order?{definition:order,availablePinnedProduce:quantity(order.crop,'produce'),
   status:minute<order.dueMinute?'active' as const:'expired' as const,
   remainingGameMinutes:Math.max(0,order.dueMinute-minute),
   closeAvailable:minute>=order.dueMinute&&!blocked,
   deliverySpatialAdmission:'not-implemented' as const}:null,
  spatialActions:'not-enabled-by-this-view' as const,
  plants:plants?{
   landPhase2:{version:1 as const,clearEmptyBeds:true},ref:{...plants.ref},definition:structuredClone(r.get(plants.ref)),newStarts:plants.newStarts,
   shopOpen:minute%1440>=360&&minute%1440<1020,blocked,
   plots:(s.landV1?.plots??[]).map(b=>{
    const id=b.id.replace('land-','life-'),status=lifePlotStatus(s,id,r);
    return {id,target:b.id,scene:landRegion(b.region)!.scene,at:{...b.at},
     status:status?{...status,growMinutes:r.get(status.ref).growMinutes,name:r.get(status.ref).name}:null};
   }),
   unboundPlotIds:Object.keys(life?.plots??{}).filter(id=>!s.landV1?.plots.some(b=>b.id===id.replace('life-','land-'))),
  }:null,
 };
 // Consumer mutation of this DTO cannot change the authoritative head or refs.
 return structuredClone(result);
}
