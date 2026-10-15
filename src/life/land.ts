import {rooms,type Entity,type Words} from '../world/data';
import {dynamicWorld} from '../dynamic-assets/layout';
import {animals} from '../animals/config';
import {overlaps,protectionForRoom} from '../animals/spatial';
import {patrolRadius,advanceTown} from '../world/residents';
import {findPath,walkable,type Point,type Rect,type World} from '../engine/world';
import {advanceAwake} from '../story/fatigue';
import {battleLocksWorld} from '../story/turn-battle';
import type {Save} from '../story/state';
import type {Admission,Intent,LifeResult,LifeSave} from './types';
import {landMaximum,landBedIds} from './land-contract';

type LandBase={permissions:Record<string,{revision:1;sourceAction:string;minute:number}>;plots:{id:string;region:string;geometryRevision:1;at:Point;sourceAction:string;minute:number}[]};
export type LandState=LandBase&({schema:1}|{schema:2;expansion:{revision:1;sourceAction:string;minute:number}});
export const landRegions=[
 {id:'hill-edge',scene:'hill',name:['山坡公共种植区','Hill community growing area'] as Words,rect:{x:460,y:760,w:120,h:84},sign:{x:560,y:865},approach:{x:552,y:900},permission:['公共土地告示：这片边缘草地可供住户开小菜畦。保留道路、住户和动物的活动空间；先开两畦，取得两地许可后可扩为四畦。','Public land notice: residents may make small beds in this edge of grass. Keep paths and neighbors’ and animals’ space clear. Start with two beds; permissions at both growing areas allow expansion to four.'] as Words},
 {id:'courtyard-common',scene:'courtyard',name:['院落公共种植区','Courtyard community growing area'] as Words,rect:{x:250,y:560,w:90,h:68},sign:{x:340,y:610},approach:{x:332,y:644},permission:['住户共同许可：院落西南这片草地可开小菜畦。此许可只授予种植，不改变原有借道时段；保留出入口和街坊活动空间。','Residents’ shared permission: small beds may be made in this southwest patch of grass. This grants cultivation only and does not change existing passage hours. Keep entrances and neighbors’ space clear.'] as Words},
] as const;
export const landRegion=(id:string)=>landRegions.find(r=>r.id===id);
export const landFootprint=(at:Point):Rect=>({x:at.x-24,y:at.y-24,w:48,h:24});
export const landApproach=(at:Point):Point=>({x:at.x-8,y:at.y+18});
export const permitTarget=(region:string)=>'land-permit:'+region;
export const candidateTarget=(region:string,at:Point)=>`land-candidate:${region}:${at.x}:${at.y}`;
export const landEntity=(region:string,at?:Point):Entity=>{
 const r=landRegion(region);if(!r)throw Error('LAND_REGION_UNKNOWN');
 return {id:at?candidateTarget(region,at):permitTarget(region),kind:'object',label:at?['待确认菜畦','Proposed bed']:r.name,at:at??r.sign,approach:at?landApproach(at):r.approach,landRegion:region,landAt:at};
};
export function landEntities(s:Pick<Save,'scene'|'landV1'>,candidate?:{region:string;at:Point}):Entity[]{
 return [...landRegions.filter(r=>r.scene===s.scene).map(r=>landEntity(r.id)),...(s.landV1?.plots??[]).filter(p=>landRegion(p.region)?.scene===s.scene).map(p=>({...landEntity(p.region,p.at),id:p.id,label:['自己的空菜畦','My empty bed'] as Words,landPlot:true})),...(candidate&&landRegion(candidate.region)?.scene===s.scene?[landEntity(candidate.region,candidate.at)]:[])];
}
const integer=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).sort().join(',')===expected.sort().join(',');
const source=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=120;
export const landPoint=(v:unknown):v is Point=>object(v)&&keys(v,['x','y'])&&integer(v.x)&&integer(v.y)&&v.x%4===0&&v.y%4===0;
const inside=(outer:Rect,inner:Rect)=>inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.w<=outer.x+outer.w&&inner.y+inner.h<=outer.y+outer.h;
const expand=(r:Rect,n:number):Rect=>({x:r.x-n,y:r.y-n,w:r.w+2*n,h:r.h+2*n});
export function assertLandReadable(s:Save){
 const l=s.landV1;if(l===undefined)return;
 const bad=()=>{throw Error('UNSUPPORTED_LAND_SAVE')};
 if(!object(l)||![1,2].includes(l.schema)||!keys(l,l.schema===2?['schema','permissions','plots','expansion']:['schema','permissions','plots'])||!object(l.permissions)||!Array.isArray(l.plots)||l.plots.length>landMaximum(l))bad();
 for(const [id,p] of Object.entries(l.permissions))if(!landRegion(id)||!object(p)||!keys(p,['revision','sourceAction','minute'])||p.revision!==1||!source(p.sourceAction)||!integer(p.minute)||p.minute>(s.townMinutes??540))bad();
 if(l.schema===2){const e=l.expansion;if(!object(e)||!keys(e,['revision','sourceAction','minute'])||e.revision!==1||!source(e.sourceAction)||!integer(e.minute)||e.minute>(s.townMinutes??540)||landRegions.some(r=>!l.permissions[r.id]||l.permissions[r.id].minute>e.minute))bad();}
 const ids=new Set<string>();
 for(const p of l.plots){if(!object(p))bad();const r=landRegion(p.region);if(!keys(p,['id','region','geometryRevision','at','sourceAction','minute'])||!landBedIds(l).includes(p.id)||ids.has(p.id)||!r||p.geometryRevision!==1||!l.permissions[p.region]||!landPoint(p.at)||!inside(r.rect,landFootprint(p.at))||!source(p.sourceAction)||!integer(p.minute)||p.minute>(s.townMinutes??540)||l.schema===2&&Number(p.id.slice(-1))>2&&p.minute<l.expansion.minute)bad();ids.add(p.id)}
 for(let i=0;i<l.plots.length;i++)for(let j=0;j<i;j++)if(landRegion(l.plots[i].region)?.scene===landRegion(l.plots[j].region)?.scene&&overlaps(expand(landFootprint(l.plots[i].at),12),landFootprint(l.plots[j].at)))bad();
}
/** Confirmed coordinates feed actual rendering, pathfinding and server position validation. */
export function landWorld(base:World,l?:LandState):World{
 const scenes={...base.scenes};
 for(const p of l?.plots??[]){const r=landRegion(p.region);if(!r)throw Error('UNSUPPORTED_LAND_SAVE');const s=scenes[r.scene];scenes[r.scene]={...s,obstacles:[...s.obstacles,landFootprint(p.at)]}}
 return {...base,scenes};
}
/** Every authored resident participates, including future additions. No fixed roster list. */
export function landProtection(scene:string,entities:readonly Entity[]=rooms[scene].entities):Rect[]{
 const spawn=rooms[scene].spawn;
 return [...protectionForRoom(entities),{x:spawn.x-24,y:spawn.y-24,w:64,h:60},...entities.filter(e=>e.person).map(e=>{const radius=patrolRadius(e.person!)+28;return {x:e.at.x-radius,y:e.at.y-28,w:radius*2,h:Math.max(42,e.approach.y-e.at.y)+56}}),...animals.flatMap(a=>Object.values(a.schedule).filter(slot=>slot.scene===scene).map(slot=>expand(slot.region,20)))];
}
export function landGeometry(s:Save,region:string,at:Point,actualPosition:Point=s.position,extraProtection:Rect[]=[]):string|null{
 const r=landRegion(region);if(!r||r.scene!==s.scene)return 'LAND_SCENE';
 if(!landPoint(at)||!inside(r.rect,landFootprint(at)))return 'LAND_OUTSIDE';
 const footprint=landFootprint(at),base=dynamicWorld(s.flags,true),existing=s.landV1?.plots??[];
 if([...base.scenes[s.scene].obstacles,...landProtection(s.scene),...extraProtection].some(o=>overlaps(expand(footprint,8),o)))return 'LAND_PROTECTED';
 if(existing.some(p=>landRegion(p.region)?.scene===s.scene&&overlaps(expand(footprint,12),landFootprint(p.at))))return 'LAND_OVERLAP';
 if([s.position,actualPosition].some(p=>overlaps(footprint,{...p,...base.actor})))return 'LAND_PLAYER_SPACE';
 const trial=landWorld(base,{schema:1,permissions:{},plots:[...existing,{id:'land-preview',region,geometryRevision:1,at,sourceAction:'preview',minute:s.townMinutes??540}]}),approach=landApproach(at),scene=trial.scenes[s.scene];
 const endpoints=[s.position,actualPosition,approach,...rooms[s.scene].entities.filter(e=>e.kind==='portal').map(e=>e.approach),...existing.filter(p=>landRegion(p.region)?.scene===s.scene).map(p=>landApproach(p.at))];
 if(endpoints.some(p=>!walkable(trial,s.scene,p)||!findPath(trial,s.scene,scene.spawn,p).length))return 'LAND_NO_ROUTE';
 return null;
}
/** A projection is read-only. Expansion is a separate explicit action, never a
 * migration caused by opening an old save or accepting a permission. */
export function landPreview(s:Save,region:string,at?:Point,expansionStarts=true){
 assertLandReadable(s);const r=landRegion(region);if(!r||r.scene!==s.scene)throw Error('LAND_SCENE');
 const locked=!!s.activeChallenge||battleLocksWorld(s),permitted=!!s.landV1?.permissions[region],count=s.landV1?.plots.length??0,maximum=landMaximum(s.landV1);
 const cost=(energy:number,minutes:number)=>{const probe={energy:s.energy-energy,awakeMinutes:s.awakeMinutes};advanceAwake(probe,minutes);return {cash:0,energy,minutes,totalEnergy:Math.min(s.energy,s.energy-probe.energy)}};
 const missingPermissions=landRegions.filter(r=>!s.landV1?.permissions[r.id]).map(r=>({id:r.id,name:r.name}));
 const expansionReason=locked?'CHALLENGE_ACTIVE':s.landV1?.schema===2?'LAND_ALREADY_EXPANDED':!expansionStarts?'LAND_EXPANSION_CLOSED':missingPermissions.length?'LAND_EXPANSION_PERMISSION':count<2?'LAND_EXPANSION_NOT_READY':s.energy<4?'REST_NEEDED':null;
 const next=landBedIds(s.landV1).find(id=>!s.landV1?.plots.some(p=>p.id===id)),closed=!!next&&Number(next.slice(-1))>2&&!expansionStarts;
 const geometry=at?landGeometry(s,region,at):null;
 const reason=locked?'CHALLENGE_ACTIVE':!permitted?'LAND_PERMISSION':count>=maximum?'LAND_CAPACITY':closed?'LAND_EXPANSION_CLOSED':s.energy<4?'REST_NEEDED':geometry;
 return {schema:1 as const,snapshotVersion:s.version,region:r.id,name:r.name,permission:r.permission,permitted,rect:r.rect,sign:r.sign,approach:r.approach,at:at??null,footprint:at?landFootprint(at):null,target:at?candidateTarget(region,at):permitTarget(region),cost:cost(4,20),count,maximum,reason,canSelect:count<maximum&&!closed,canConfirm:!!at&&!reason,expansion:{expanded:s.landV1?.schema===2,maximum:4,missingPermissions,cost:cost(4,20),reason:expansionReason,canConfirm:!expansionReason}};
}
export type LandPreview=ReturnType<typeof landPreview>;
export function applyLand(before:Save,intent:Intent,admission:Admission):LifeResult{
 assertLandReadable(before);const c=intent.command;if(!['permit-land','cultivate','expand-land','clear-bed'].includes(c.verb))throw Error('INVALID_LAND_COMMAND');
 if(before.version!==intent.expectedVersion)throw Error('VERSION_CONFLICT');if(before.activeChallenge||battleLocksWorld(before))throw Error('CHALLENGE_ACTIVE');
 const cmd=c as Extract<typeof c,{verb:'permit-land'|'cultivate'|'expand-land'|'clear-bed'}>;
 const bed=cmd.verb==='clear-bed'?before.landV1?.plots.find(p=>p.id===cmd.plot):undefined;
 if(cmd.verb==='clear-bed'&&!bed)throw Error('LAND_BED_MISSING');
 const region=cmd.verb==='clear-bed'?bed!.region:cmd.region,r=landRegion(region);
 if(!r||r.scene!==before.scene||!before.visited.includes(r.scene))throw Error('LAND_SCENE');
 if(admission.land?.region!==region||admission.land.geometryRevision!==1)throw Error('LAND_ADMISSION_REQUIRED');
 const s=structuredClone(before) as LifeSave;s.landV1??={schema:1,permissions:{},plots:[]};const minute=s.townMinutes??540;let text:Words;
 const labor=(energy:number,minutes:number)=>{if(s.energy<energy)throw Error('REST_NEEDED');s.energy-=energy;advanceAwake(s,minutes);advanceTown(s,minutes)};
 if(cmd.verb==='permit-land'){
  if(s.landV1.permissions[region])throw Error('LAND_ALREADY_PERMITTED');s.landV1.permissions[region]={revision:1,sourceAction:intent.actionId,minute};text=['种植许可已记下。先选位置，看过成本后再开垦。','Cultivation permission is recorded. Choose a position and review the cost before making a bed.'];
 }else if(cmd.verb==='expand-land'){
  const preview=landPreview(before,region,undefined,admission.land.expansionAllowed===true);if(preview.expansion.reason)throw Error(preview.expansion.reason);
  labor(4,20);s.landV1={...s.landV1,schema:2,expansion:{revision:1,sourceAction:intent.actionId,minute:s.townMinutes??minute}};
  text=['种植容量已扩为全镇四畦。每块新畦仍需选址并单独确认开垦；原菜畦保持原位。','Your growing capacity is now four beds across town. Choose and confirm each new bed separately. Existing beds stay in place.'];
 }else if(cmd.verb==='clear-bed'){
  if(s.lifeV1?.plots[cmd.plot.replace('land-','life-')])throw Error('LAND_BED_OCCUPIED');
  if(admission.target!==bed!.id)throw Error('LAND_TARGET');labor(2,10);s.landV1.plots=s.landV1.plots.filter(p=>p.id!==cmd.plot);
  text=['空菜畦已收回。许可、种植容量、种子与采收记录保留，可以重新选址；原开垦精力不退回。','The empty bed is cleared. Your permissions, growing capacity, seeds and harvest records remain. Choose a new position; the original effort is not refunded.'];
 }else{
  if(!s.landV1.permissions[region])throw Error('LAND_PERMISSION');if(s.landV1.plots.length>=landMaximum(s.landV1))throw Error('LAND_CAPACITY');if(s.energy<4)throw Error('REST_NEEDED');
  const reason=landGeometry(before,region,cmd.at,admission.land.position);if(reason)throw Error(reason);
  const id=landBedIds(s.landV1).find(id=>!s.landV1!.plots.some(p=>p.id===id))!;
  if(Number(id.slice(-1))>2&&admission.land.expansionAllowed!==true)throw Error('LAND_EXPANSION_CLOSED');
  s.landV1.plots.push({id,region,geometryRevision:1,at:{...cmd.at},sourceAction:intent.actionId,minute});labor(4,20);
  text=['空菜畦已经开好，记录会保留。','Your empty bed is ready and saved.'];
 }
 assertLandReadable(s);return {head:s,text,event:{id:intent.actionId,verb:cmd.verb,minute:s.townMinutes??540,cash:0,energy:s.energy-before.energy,items:{},relations:{},facts:[]}};
}
