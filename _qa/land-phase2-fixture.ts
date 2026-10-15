/** Synthetic settled journey. Cross-scene moves/clock jumps in unit setup are
 * explicit fixtures, never player movement or a write to a real journey. */
import {randomUUID} from 'node:crypto';
import {initial,type Action} from '../src/story/state';
import {rooms,entityAt} from '../src/world/data';
import {landEntity,landRegion} from '../src/life/land';
import type {Command,LifeSave} from '../src/life/types';
import {createLifePlantsB2} from '../server/life-plants-b2';
import {runtime} from '../server/runtime';
export const beds=[
 {region:'hill-edge',at:{x:484,y:840}},
 {region:'courtyard-common',at:{x:288,y:604}},
 {region:'hill-edge',at:{x:484,y:784}},
 {region:'hill-edge',at:{x:548,y:784}},
];
export const start=(id:string=randomUUID()):LifeSave=>({...initial('en',id),scene:'hill',position:rooms.hill.spawn,visited:Object.keys(rooms),known:['mara','theo','dani'],flags:['key','unpacked','bag-returned','garden-agreed','alternative-route','route-open','market-open'],items:{key:1,'seed-basil':1,'seed-radish':1,'seed-tomato':1}});
export const move=(s:LifeSave,scene:string,position=rooms[scene].spawn):LifeSave=>({...s,scene,position:{...position}});
export function command(s:LifeSave,c:Command):Action{
 let e;
 if(c.verb==='permit-land'||c.verb==='expand-land'||c.verb==='cultivate')e=landEntity(c.region,c.verb==='cultivate'?c.at:undefined);
 else if(c.verb==='clear-bed'||c.verb==='plant'||c.verb==='water'||c.verb==='harvest'){
  const id=c.verb==='clear-bed'?c.plot:c.plot.replace('life-','land-'),b=s.landV1?.plots.find(p=>p.id===id);
  if(b)e={...landEntity(b.region,b.at),id:b.id};
 }else if(c.verb==='buy-seed'||c.verb==='sell')e=entityAt(s.scene,'crop-counter');
 return {action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:e?.approach??s.position,target:e?.id??'life-bag',action:'life:'+c.verb,payload:{command:c}};
}
export const step=async(s:LifeSave,c:Command,host=createLifePlantsB2(runtime))=>(await host.runtime.prepare(s,command(s,c))).head as LifeSave;
export async function twoBeds(){
 let s=start();
 for(const b of beds.slice(0,2)){
  s=move(s,landRegion(b.region)!.scene);
  s=await step(s,{verb:'permit-land',region:b.region});s=await step(s,{verb:'cultivate',...b});
 }
 return move(s,'hill',landEntity('hill-edge').approach);
}
export async function fourBeds(){
 let s=await twoBeds();s=await step(s,{verb:'expand-land',region:'hill-edge'});
 for(const b of beds.slice(2)){s=move(s,landRegion(b.region)!.scene);s=await step(s,{verb:'cultivate',...b})}
 return s;
}
