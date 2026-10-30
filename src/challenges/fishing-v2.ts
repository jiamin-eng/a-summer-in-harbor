import {baitCatalog,baitIds,basicBait,fishCatalog,fishItem,paidBaits,speciesIds,type SpeciesId,type BaitId} from './fishing-catalog';
import type {Save,Action} from '../story/state';
import type {WaterKind} from '../world/shore-water';
import type {Words} from '../world/data';
import {shopOpen} from '../story/crops';
export type FishingTicket={species:SpeciesId;bait:BaitId;water:WaterKind;zone:string;minute:number;cycle:number};
export type FishingV2={schema:1;selected:BaitId;cycles:Record<WaterKind,number>;tickets:Partial<Record<WaterKind,FishingTicket>>;codex:Partial<Record<SpeciesId,{count:number;firstMinute:number;lastMinute:number}>>;lastCatch?:{species:SpeciesId;bait:BaitId;minute:number}};
const gate=(v:unknown,c:string)=>{if(!v)throw Error(c)};
export const ensureFishingV2=(s:Save)=>s.fishingV2??=( {schema:1,selected:basicBait,cycles:{saltwater:0,stream:0},tickets:{},codex:{}});
function available(s:Save,bait:BaitId){return (s.items[bait]??0)-Object.values(s.fishingV2?.tickets??{}).filter(t=>t?.bait===bait).length}
export function currentBait(s:Save,water?:WaterKind):BaitId{const m=s.fishingV2,ticket=water&&m?.tickets[water];if(ticket)return ticket.bait;const selected=m?.selected??basicBait;return selected===basicBait||available(s,selected)>0?selected:basicBait}
function fraction(text:string){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>16),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);return ((h^(h>>>16))>>>0)/4294967296}
export function fishingTicket(s:Save,water:WaterKind,zone:string,minute:number):FishingTicket{
 const m=ensureFishingV2(s);if(m.tickets[water])return m.tickets[water]!;
 const bait=currentBait(s,water),cycle=m.cycles[water],night=minute%1440<360||minute%1440>=1020;
 const pool=speciesIds.filter(id=>fishCatalog[id].water===water).map(id=>({id,weight:1+(fishCatalog[id].prefer===bait?3:0)+(night&&id==='night-mullet'?2:0)+(zone==='harbor'&&id==='harbor-goby'?2:0)}));
 let roll=fraction(s.id+':'+water+':'+cycle)*pool.reduce((n,v)=>n+v.weight,0),species=pool.at(-1)!.id;for(const p of pool){roll-=p.weight;if(roll<0){species=p.id;break}}
 return m.tickets[water]={species,bait,water,zone,minute,cycle};
}
export function settleSpecies(s:Save,t:FishingTicket){
 const m=ensureFishingV2(s),old=m.tickets[t.water];gate(old&&JSON.stringify(old)===JSON.stringify(t),'FISHING_TICKET_MISMATCH');
 if(t.bait!==basicBait){gate(s.items[t.bait]>=1,'FISHING_BAIT_NEEDED');s.items[t.bait]--;if(!s.items[t.bait])delete s.items[t.bait]}
 s.items[fishItem(t.species)]=(s.items[fishItem(t.species)]??0)+1;
 const minute=s.townMinutes??t.minute,record=m.codex[t.species];m.codex[t.species]=record?{...record,count:record.count+1,lastMinute:minute}:{count:1,firstMinute:minute,lastMinute:minute};m.lastCatch={species:t.species,bait:t.bait,minute};m.cycles[t.water]++;delete m.tickets[t.water];if(m.selected!==basicBait&&!s.items[m.selected])m.selected=basicBait;
}
export function selectFishingBait(s:Save,a:Action):Words{gate(!s.activeChallenge&&!s.turnBattle,'CHALLENGE_ACTIVE');gate(s.items['basic-fishing-rod']>0&&s.items[basicBait]>0,'FISHING_KIT_NEEDED');const bait=(a.payload as {bait?:BaitId})?.bait;gate(bait&&baitIds.includes(bait),'INVALID_FISHING_BAIT');gate(bait===basicBait||(s.items[bait!]??0)>0,'FISHING_BAIT_NEEDED');ensureFishingV2(s).selected=bait!;return ['已选择下一次新钓局用饵。未完成的水域尝试沿用原饵，钓获后才结束。','Selected for your next new attempt. Unfinished attempts keep their current bait until caught.']}
export function buyFishingBait(s:Save,bait:string):Words{gate(shopOpen(s),'SHOP_CLOSED');gate(paidBaits.some(id=>id===bait),'INVALID_FISHING_BAIT');const b=baitCatalog[bait as BaitId];gate(s.cash>=b.price,'NOT_ENOUGH_CASH');gate((s.items[bait]??0)<999,'FISHING_BAIT_FULL');s.cash-=b.price;s.items[bait]=(s.items[bait]??0)+1;return [`买入1份${b.name[0]}，花费$${b.price}。`,`Bought 1 ${b.name[1]} for $${b.price}.`]}
export const totalFish=(s:Pick<Save,'items'>)=>(s.items.fish??0)+speciesIds.reduce((n,id)=>n+(s.items[fishItem(id)]??0),0);
export function validFishingV2(s:Save){
 const m=s.fishingV2;if(m===undefined)return !['shore-fishing-v2','shore-fishing-c-v1'].includes(s.activeChallenge?.fishing?.rules??'');const integer=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0;
 if(!m||m.schema!==1||!baitIds.includes(m.selected)||!m.cycles||!['saltwater','stream'].every(w=>integer(m.cycles[w as WaterKind]))||!m.tickets||!m.codex||Array.isArray(m.tickets)||Array.isArray(m.codex))return false;
 for(const [water,t]of Object.entries(m.tickets)){if(!['saltwater','stream'].includes(water)||!t||t.water!==water||!speciesIds.includes(t.species)||fishCatalog[t.species].water!==water||!baitIds.includes(t.bait)||!integer(t.minute)||!integer(t.cycle)||t.cycle!==m.cycles[t.water]||typeof t.zone!=='string')return false}
 for(const id of paidBaits){const n=s.items[id]??0;if(!integer(n)||n>999||n<Object.values(m.tickets).filter(t=>t?.bait===id).length)return false}
 for(const id of speciesIds)if(!integer(s.items[fishItem(id)]??0))return false;
 for(const [id,r]of Object.entries(m.codex))if(!speciesIds.includes(id as SpeciesId)||!r||!integer(r.count)||r.count<1||!integer(r.firstMinute)||!integer(r.lastMinute)||r.lastMinute<r.firstMinute)return false;
 const total=Object.values(m.codex).reduce((n,r)=>n+r!.count,0);if(total!==m.cycles.saltwater+m.cycles.stream)return false;
 const last=m.lastCatch;if(last&&(!speciesIds.includes(last.species)||!baitIds.includes(last.bait)||!integer(last.minute)||!m.codex[last.species]))return false;
 const active=s.activeChallenge?.fishing;if(active&&['shore-fishing-v2','shore-fishing-c-v1'].includes(active.rules)){const ticket=m.tickets[active.water];if(!ticket||JSON.stringify(ticket)!==JSON.stringify(active.ticket)||active.species!==ticket.species)return false}
 return true;
}
