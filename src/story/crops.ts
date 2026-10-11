import type {Words} from '../world/data';
import {townMinutes} from '../world/residents';
export const crops={radish:{name:['萝卜','Radish'] as Words,minutes:360,cost:3,yield:2,price:3},basil:{name:['罗勒','Basil'] as Words,minutes:720,cost:5,yield:3,price:3},tomato:{name:['番茄','Tomato'] as Words,minutes:1440,cost:8,yield:4,price:4}};
export type CropId=keyof typeof crops;
export type Plot={crop:CropId;grown:number;updatedAt:number;wetUntil:number};
export type GardenState={townMinutes?:number;plots?:Record<string,Plot>;flags:string[];items:Record<string,number>;cash:number;energy:number};
export const plotIds=['crop-bed-1','crop-bed-2','crop-bed-3'];
export const cropVerbs=['claim-seeds','water-crop','harvest-crop',...Object.keys(crops).map(id=>'plant:'+id)];
export const shopVerbs=Object.keys(crops).flatMap(id=>['buy-seed:'+id,'sell-crop:'+id]);
export const shopOpen=(s:{townMinutes?:number})=>{const m=townMinutes(s)%1440;return m>=360&&m<1020};
export const shopHours:Words=['街角杂货铺 · 每天06:00–17:00售种、收购。关店后产物仍会保留，明天再来。','Corner Grocer · Seeds and produce, daily 06:00–17:00. Your produce keeps safely until the shop reopens.'];
export function plotStatus(s:GardenState,id:string){const p=s.plots?.[id];if(!p)return null;const c=crops[p.crop],now=townMinutes(s),grown=Math.min(c.minutes,p.grown+Math.max(0,Math.min(now,p.wetUntil)-p.updatedAt));return {...p,grown,remaining:c.minutes-grown,ready:grown>=c.minutes,needsWater:grown<c.minutes&&now>=p.wetUntil}}
export function plotDescription(s:GardenState,id:string):Words{const p=plotStatus(s,id);if(!p)return s.flags.includes('crop-starter')?['空菜畦可以再次播种。新株最多留一包种，消耗1份收成；没有种子时，可到街角杂货铺购买。','Plant this empty bed again. Each new plant can provide one saved seed packet, using one portion. Buy seed at Corner Grocer if needed.']:['一块空菜畦。领一次免费种子包，再选择播种。新株最多留一包种，消耗1份收成。水壶留在田边。','An empty bed. Collect your one-time seeds, then choose a crop. Each new plant can provide one saved packet, using one portion. A watering can is beside the beds.'];const c=crops[p.crop];return p.ready?[`${c.name[0]}成熟了，可收获${c.yield}份。收好后菜畦可以重新播种。`,`${c.name[1]} is ready: harvest ${c.yield}. The bed can then be planted again.`]:[`${c.name[0]} · 还需${Math.ceil(p.remaining/60)}小时湿润生长。${p.needsWater?'土干了，浇水后才继续生长；不会枯死。':'土壤湿润，可以先去做别的事。'}`,`${c.name[1]} · ${Math.ceil(p.remaining/60)} hours of watered growth remain. ${p.needsWater?'Dry soil pauses growth. Water to resume; it will not die.':'The soil is damp. You can do something else.'}`]}
export function cropChoices(s:GardenState,target:string):{id:string;label:Words}[]{
 if(target==='crop-counter')return shopOpen(s)?Object.entries(crops).flatMap(([id,c])=>[{id:'buy-seed:'+id,label:[`买${c.name[0]}种子 · $${c.cost}`,`Buy ${c.name[1]} seed · $${c.cost}`] as Words},...(s.items['crop-'+id]>0?[{id:'sell-crop:'+id,label:[`卖1份${c.name[0]} · +$${c.price}`,`Sell 1 ${c.name[1]} · +$${c.price}`] as Words}]:[])]):[];
 if(!plotIds.includes(target))return [];
 const p=plotStatus(s,target);return [...(!s.flags.includes('crop-starter')?[{id:'claim-seeds',label:['领取免费种子包（各1颗）','Collect free starter seeds (one of each)'] as Words}]:[]),...(!p?Object.entries(crops).filter(([id])=>s.items['seed-'+id]>0).map(([id,c])=>({id:'plant:'+id,label:[`播种${c.name[0]} · ${c.minutes/60}小时`, `Plant ${c.name[1]} · ${c.minutes/60} hours`] as Words})):p.ready?[{id:'harvest-crop',label:['收获并放入行囊','Harvest into your bag'] as Words}]:p.needsWater?[{id:'water-crop',label:['浇水 · 可湿润生长12小时','Water · 12 hours of growth'] as Words}]:[])];
}
export const cropItems=Object.fromEntries(Object.entries(crops).flatMap(([id,c])=>[['seed-'+id,{name:[c.name[0]+'种子',c.name[1]+' seed'] as Words,description:[`在山坡花园播种；湿润生长${c.minutes/60}小时后收获。`,`Plant at Hillside Garden; harvest after ${c.minutes/60} hours of watered growth.`] as Words,kind:'objects' as const}],['crop-'+id,{name:c.name,description:[`可在街角杂货铺06:00–17:00出售，每份$${c.price}。不会腐坏。`,`Sell at Corner Grocer, 06:00–17:00, for $${c.price} each. Does not spoil.`] as Words,kind:'objects' as const}]]));
export function applyCrop(s:GardenState,target:string,verb:string):Words{
 const fail=(condition:unknown,code:string)=>{if(!condition)throw Error(code)};
 fail(cropChoices(s,target).some(c=>c.id===verb),target==='crop-counter'&&!shopOpen(s)?'SHOP_CLOSED':'CROP_ACTION_UNAVAILABLE');
 if(verb==='claim-seeds'){for(const id of Object.keys(crops))s.items['seed-'+id]=(s.items['seed-'+id]??0)+1;s.flags.push('crop-starter');return ['三种种子放进行囊了。先选一块菜畦种下，再浇水。成熟后带到街角杂货铺出售。','Three kinds of seeds go into your bag. Plant one bed, then water it. Sell the harvest at Corner Grocer.']}
 const [action,id]=verb.split(':') as [string,CropId];const c=crops[id];
 if(action==='buy-seed'){fail(s.cash>=c.cost,'NOT_ENOUGH_CASH');s.cash-=c.cost;s.items['seed-'+id]=(s.items['seed-'+id]??0)+1;return [`你买了1颗${c.name[0]}种子。`,`You bought one ${c.name[1]} seed.`]}
 if(action==='sell-crop'){fail(s.cash+c.price<=999,'PURSE_FULL');s.items['crop-'+id]--;if(!s.items['crop-'+id])delete s.items['crop-'+id];s.cash+=c.price;return [`售出1份${c.name[0]}，收入$${c.price}。可以购种再种一轮。`,`Sold one ${c.name[1]} for $${c.price}. You can buy seed for another crop.`]}
 fail(s.energy>=2,'REST_NEEDED');s.energy-=2;const now=townMinutes(s);s.plots??={};
 if(action==='plant'){s.items['seed-'+id]--;if(!s.items['seed-'+id])delete s.items['seed-'+id];s.plots[target]={crop:id,grown:0,updatedAt:now,wetUntil:now};return [`${c.name[0]}已播种。现在给它浇水，才会开始生长。`,`${c.name[1]} is planted. Water it now to start growth.`]}
 const p=plotStatus(s,target)!;
 if(verb==='water-crop'){s.plots[target]={crop:p.crop,grown:p.grown,updatedAt:now,wetUntil:now+720};return ['水渗进土里，可供十二小时生长。土干后只暂停，不会枯死。','The watered soil supports twelve hours of growth. Dry soil only pauses growth; the crop will not die.']}
 const crop=crops[p.crop];s.items['crop-'+p.crop]=(s.items['crop-'+p.crop]??0)+crop.yield;delete s.plots[target];return [`${crop.yield}份${crop.name[0]}放进行囊。去车站街的杂货铺，06:00–17:00可以卖给店主。`,`${crop.yield} ${crop.name[1]} go into your bag. Sell them at Corner Grocer on Station Street, 06:00–17:00.`];
}
export function validPlots(s:GardenState){return s.plots===undefined||!!s.plots&&typeof s.plots==='object'&&!Array.isArray(s.plots)&&Object.entries(s.plots).every(([id,p])=>plotIds.includes(id)&&p&&Object.hasOwn(crops,p.crop)&&[p.grown,p.updatedAt,p.wetUntil].every(n=>Number.isSafeInteger(n)&&n>=0)&&p.updatedAt<=townMinutes(s)&&p.grown<=crops[p.crop].minutes&&p.wetUntil<=p.updatedAt+720)}
