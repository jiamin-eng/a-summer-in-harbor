import {advanceAwake} from '../story/fatigue';
import {battleLocksWorld} from '../story/turn-battle';
import {residentHere} from '../world/residents';
import {acceptedAnimals} from '../animals/art';
import {slotAt} from '../animals/behavior';
import {ContentRegistry} from './registry';
import {addLot,assertLifeReadable,consumeForSeed,consumeLot,displaySlots,giftItems,pinLegacy,sameRef} from './save';
import {pinSeedPlant,recordSeedHarvest} from './seed-quota';
import {isLifeBed} from './land-contract';
import type {Admission,ContentRef,Discovery,Intent,LifeEvent,LifePlot,LifeResult,LifeSave} from './types';

function requireRule(condition:unknown,code:string):asserts condition{if(!condition)throw Error(code)}
const minute=(s:LifeSave)=>s.townMinutes??540;
const shopOpen=(s:LifeSave)=>minute(s)%1440>=360&&minute(s)%1440<1020;
function startAllowed(r:ContentRegistry,ref:ContentRef){requireRule(r.canStart(ref),'CONTENT_NOT_ENABLED')}
function labor(s:LifeSave){requireRule(s.energy>=2,'ENERGY_LOW');s.energy-=2;advanceAwake(s,10);s.townMinutes=minute(s)+10}
function resident(s:LifeSave,a:Admission,id:'theo'|'dani'){
 requireRule(a.resident===id,'RESIDENT_ADMISSION_REQUIRED');requireRule(s.known.includes(id),'INTRODUCE_FIRST');requireRule(residentHere(s,id,s.scene),'PERSON_AWAY');
}
function discover(s:LifeSave,id:string,action:string,extra:Partial<Discovery>={}){
 const life=s.lifeV1!;if(life.collections[id])return false;requireRule(Object.keys(life.collections).length<64,'COLLECTION_CAPACITY');life.collections[id]={id,sourceAction:action,minute:minute(s),...extra};return true;
}
function rewardGift(s:LifeSave,key:string,gift:string,person:'theo'|'dani',amount:number,actionId:string,facts:string[]){
 const life=s.lifeV1!;if(life.firstRewards.includes(key))return;
 life.firstRewards.push(key);s.relations[person]=Math.min(100,Math.max(-100,(s.relations[person]??0)+amount));s.items[gift]=1;discover(s,'gift:'+gift,actionId);facts.push(key,'gift:'+gift);
}
export function lifePlotStatus(s:LifeSave,id:string,r:ContentRegistry){
 const p=s.lifeV1?.plots[id];if(!p)return null;const d=r.get(p.ref),now=minute(s),grown=Math.min(d.growMinutes,p.grown+Math.max(0,Math.min(now,p.wetUntil)-p.updatedAt));return {grown,ready:grown>=d.growMinutes,needsWater:grown<d.growMinutes&&now>=p.wetUntil,ref:{...p.ref}};
}
function plot(s:LifeSave,a:Admission,id:string):LifePlot{
 requireRule(a.plot===id&&a.cultivated===true&&isLifeBed(id,s.landV1),'PLOT_ADMISSION_REQUIRED');const p=s.lifeV1!.plots[id];requireRule(p,'PLOT_EMPTY');return p;
}
/** Pure rules: returns a candidate; never mutates caller, calls models or writes
 * DB. The existing authority is responsible for the single CAS transaction. */
export function applyLife(previous:LifeSave,intent:Intent,r:ContentRegistry,a:Admission):LifeResult{
 requireRule(/^[a-zA-Z0-9-]{16,80}$/.test(intent.actionId),'INVALID_ACTION_ID');requireRule(previous.version===intent.expectedVersion,'VERSION_CONFLICT');requireRule(a.scene===previous.scene,'SCENE_MISMATCH');requireRule(!previous.activeChallenge&&!battleLocksWorld(previous),'CHALLENGE_ACTIVE');
 const s=pinLegacy(previous,r),life=s.lifeV1!,c=intent.command,facts:string[]=[];requireRule(!life.events.some(e=>e.id===intent.actionId),'ACTION_ALREADY_APPLIED');
 let text:LifeResult['text'];
 switch(c.verb){
  case 'buy-seed':{
   requireRule(a.target==='crop-counter','SHOP_ADMISSION_REQUIRED');requireRule(shopOpen(s),'SHOP_CLOSED');startAllowed(r,c.ref);const d=r.get(c.ref);requireRule(s.cash>=d.seedCost,'CASH_LOW');s.cash-=d.seedCost;addLot(s,r,c.ref,'seed',1,intent.actionId);text=['买到一包种子。','You bought a packet of seeds.'];break;
  }
  case 'plant':{
   requireRule(a.plot===c.plot&&a.cultivated===true&&isLifeBed(c.plot,s.landV1),'PLOT_ADMISSION_REQUIRED');requireRule(!life.plots[c.plot],'PLOT_OCCUPIED');startAllowed(r,c.ref);requireRule(!r.isLegacy(c.ref),'USE_AUTHORED_PLOT');requireRule(s.energy>=2,'ENERGY_LOW');consumeLot(s,r,c.ref,'seed',1);const now=minute(s);life.plots[c.plot]={ref:{...c.ref},grown:0,updatedAt:now,wetUntil:now};pinSeedPlant(s,c.ref,c.plot,intent.actionId);labor(s);text=['种子已播下。浇水后才开始生长；这株收成最多留一包种。','The seed is planted. Water it to begin growth; this plant can provide one saved seed packet.'];break;
  }
  case 'water':{
   const p=plot(s,a,c.plot),status=lifePlotStatus(s,c.plot,r)!;requireRule(status.needsWater,'WATER_UNAVAILABLE');requireRule(s.energy>=2,'ENERGY_LOW');p.grown=status.grown;p.updatedAt=minute(s);p.wetUntil=minute(s)+r.get(p.ref).wetMinutes;labor(s);text=['土已浇湿，可以先去做别的事。','The soil is watered. You can leave it to grow.'];break;
  }
  case 'harvest':{
   const p=plot(s,a,c.plot);requireRule(lifePlotStatus(s,c.plot,r)!.ready,'CROP_NOT_READY');requireRule(s.energy>=2,'ENERGY_LOW');addLot(s,r,p.ref,'produce',r.get(p.ref).yield,intent.actionId);recordSeedHarvest(s,p.ref,c.plot,intent.actionId,r.get(p.ref).yield);delete life.plots[c.plot];labor(s);text=['收成已放进行囊，可以在杂货柜台卖出或留种。','The harvest is in your bag: sell it at the grocer or save a seed.'];break;
  }
  case 'sell':{
   requireRule(a.target==='crop-counter','SHOP_ADMISSION_REQUIRED');requireRule(shopOpen(s),'SHOP_CLOSED');const d=r.get(c.ref);requireRule(s.cash+d.salePrice<=999,'PURSE_FULL');consumeLot(s,r,c.ref,'produce',1);s.cash+=d.salePrice;text=['一份收成已卖出。','You sold one portion.'];break;
  }
  case 'save-seed':{
   r.get(c.ref);const limited=consumeForSeed(s,r,c.ref,c.harvestBatch);addLot(s,r,c.ref,'seed',1,intent.actionId);if(discover(s,'seed:'+c.ref.id,intent.actionId,{ref:{...c.ref}}))facts.push('seed:'+c.ref.id);text=r.canStart(c.ref)?(limited?['已用1份收成留下一包种；这株余下收成可出售或交货，不能再次留种。','One portion became a seed packet. This plant’s remaining harvest can be sold or delivered, but cannot provide another seed.']:['留下一包旧规则种子，可以再种；发现记录不会随种子消耗消失。','You saved an old-rule seed packet to plant again. Its discovery record survives use.']):['同批次种子与发现已保留；此批次目前停止新种植。','Your seed and discovery are kept. New planting is currently closed for this batch.'];break;
  }
  case 'accept-order':{
   resident(s,a,'theo');requireRule(a.premiseRead===true,'ORDER_PREMISE_UNREAD');requireRule(shopOpen(s),'SHOP_CLOSED');requireRule(!life.order,'ORDER_ACTIVE');requireRule(minute(s)>=life.cooldownUntil,'ORDER_COOLDOWN');startAllowed(r,c.ref);const d=r.get(c.ref);requireRule(c.ref.id==='crop:snap-pea'&&10<=2*d.salePrice+2,'ORDER_CONTENT_UNSUPPORTED');
   life.order={id:intent.actionId,definition:'theo-peas-v1',crop:{...c.ref},quantity:2,reward:10,acceptedMinute:minute(s),dueMinute:(Math.floor(minute(s)/1440)+2)*1440+1020};facts.push('order:accepted');text=['接下两份脆荚的订单：后天17:00前交给西奥。','You accepted an order for two portions of peas, due before 5pm the day after tomorrow.'];break;
  }
  case 'deliver-order':{
   const o=life.order;requireRule(o,'ORDER_MISSING');requireRule(minute(s)<o.dueMinute,'ORDER_EXPIRED');resident(s,a,'theo');requireRule(shopOpen(s),'SHOP_CLOSED');requireRule(s.cash+o.reward<=999,'PURSE_FULL');consumeLot(s,r,o.crop,'produce',o.quantity);s.cash+=o.reward;delete life.order;life.cooldownUntil=minute(s)+3*1440;facts.push('order:delivered');rewardGift(s,'theo-order-first',giftItems[0],'theo',2,intent.actionId,facts);text=['西奥收下脆荚，付了钱。','Theo accepts the peas and pays you.'];break;
  }
  case 'close-order':{
   requireRule(life.order,'ORDER_MISSING');requireRule(minute(s)>=life.order.dueMinute,'ORDER_NOT_EXPIRED');delete life.order;life.cooldownUntil=minute(s)+3*1440;facts.push('order:expired-without-loss');text=['订单已过期，收成还在行囊里，可以另作安排。','The order expired. Your harvest is still in your bag.'];break;
  }
  case 'observe-animal':{
   const def=acceptedAnimals.find(d=>d.id===c.animal);
   requireRule(a.animal&&def&&a.animal.id===c.animal&&a.animal.behavior===c.behavior&&/^harbor-cat-[123]$/.test(c.animal)&&a.animal.visualVersion===def.visualVersion,'ANIMAL_PROOF_REQUIRED');
   const slot=slotAt(def,minute(s));requireRule(slot?.scene===s.scene&&slot.activity===c.behavior,'ANIMAL_SCHEDULE_MISMATCH');
   const id='observe:'+c.animal+':'+c.behavior;if(discover(s,id,intent.actionId,{source:{id:c.animal,visualVersion:a.animal.visualVersion,kind:'animal-schedule'}}))facts.push(id);text=['这次观察已记在生活册中。','This observation is in your notebook.'];break;
  }
  case 'share-dani':{
   resident(s,a,'dani');requireRule(a.premiseRead===true,'SHARE_PREMISE_UNREAD');requireRule(life.collections['seed:crop:snap-pea']&&life.collections['observe:harbor-cat-1:sun-rest']&&life.collections['observe:harbor-cat-1:sleep'],'DISCOVERIES_MISSING');
   requireRule(!life.firstRewards.includes('dani-share-first'),'SHARE_ALREADY_DONE');rewardGift(s,'dani-share-first',giftItems[1],'dani',1,intent.actionId,facts);text=['丹妮听过你的留种与猫的观察，添了一页生活册。','Dani adds a notebook page about your saved seeds and the cat.'];break;
  }
  case 'display-gift':{
   requireRule(a.displaySlot===c.slot&&displaySlots.includes(c.slot as any),'DISPLAY_ADMISSION_REQUIRED');
   if(c.gift){requireRule(giftItems.includes(c.gift as any)&&(s.items[c.gift]??0)>0,'GIFT_MISSING');requireRule(Object.entries(life.display).filter(([slot,g])=>slot!==c.slot&&g===c.gift).length<(s.items[c.gift]??0),'GIFT_ALREADY_DISPLAYED');life.display[c.slot]=c.gift}else delete life.display[c.slot];facts.push('display:'+c.slot);text=['展示位置已更新，物件仍属于你。','The display is updated. You still own the keepsake.'];break;
  }
  case 'news-memento':{
   requireRule(a.news&&a.news.id===c.edition&&a.news.read&&a.news.fictionComplete&&/^[a-f0-9]{64}$/.test(a.news.hash),'NEWS_PROOF_REQUIRED');
   if(discover(s,'news:first-experience',intent.actionId,{source:{id:a.news.id,hash:a.news.hash,kind:'frozen-news'}}))facts.push('news:first-experience');text=['第一次新闻经历已留作纪念，来源与虚构故事分开保留。','Your first news experience is saved, with its source separate from the fictional story.'];break;
  }
  default:throw Error('UNKNOWN_LIFE_ACTION');
 }
 const delta=(before:Record<string,number>,after:Record<string,number>)=>Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])].map(k=>[k,(after[k]??0)-(before[k]??0)] as const).filter(([,v])=>v!==0));
 const event:LifeEvent={id:intent.actionId,verb:c.verb,minute:minute(s),cash:s.cash-previous.cash,energy:s.energy-previous.energy,items:delta(previous.items,s.items),relations:delta(previous.relations,s.relations),facts};life.events.push(event);life.events=life.events.slice(-128);
 assertLifeReadable(s,r);return {head:s,text,event:structuredClone(event)};
}
