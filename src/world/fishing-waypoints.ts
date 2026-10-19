import {rooms,type Entity} from './data';
/** Read-only map routes, not authority fishing targets or obstacles. */
export function fishingWaypoints(scene:string):Entity[]{
 if(scene==='harbor')return [{id:'fishing-route',kind:'object',label:['钓鱼 · 前往钓点','Fishing · walk to spot'],at:{x:805,y:880},approach:{x:797,y:886},actions:[]}];
 const gear=scene==='dock'?rooms.dock.props.find(p=>p.id==='tackle'||p.art==='fishing-kit'):undefined;
 return gear?[{id:'fishing-borrow-route',kind:'object',label:['钓鱼 · 借竿处','Fishing · borrow a rod'],at:{...gear.at},approach:{x:gear.at.x-8,y:gear.at.y+42},actions:[]}]:[];
}
