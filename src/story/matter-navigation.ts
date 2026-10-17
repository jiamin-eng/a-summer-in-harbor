import {globalPoint,localPoint,sameCluster,continuousPath} from '../candidate/continuity';
import {rooms,worldWithFlags,type Entity} from '../world/data';
import {entranceReachable,mapRoute,walkingEntrance} from '../world/map-navigation';
import {presentEntity} from '../world/residents';
import type {Save} from './state';
import {objectivePlace} from './navigation';

type MatterDestination={id:string;place?:string;person?:string};

/** Resolve the selected card to a real walking point. Crossing a separate room
 * stops at its next entrance, where the player still chooses whether to enter. */
export function matterWalkingTarget(save:Save,matter:MatterDestination):Entity|undefined{
 let scene=matter.place,entity:Entity|undefined;
 if(matter.id==='journey'){
  const goal=objectivePlace(save);if(!goal)return;
  scene=goal.scene;entity=rooms[scene]?.entities.find(e=>e.id===goal.entity);
 }else if(matter.person){
  for(const [id,room] of Object.entries(rooms)){
   const resident=room.entities.find(e=>e.person===matter.person&&presentEntity({...save,scene:id},e));
   if(resident){scene=id;entity=resident;break}
  }
  if(!entity)return;
 }else if(scene){
  const preferred=matter.id==='paused-bout'?'idris':matter.id==='snap-pea-order'||matter.id==='basil-order'?'theo':matter.id==='garden-crops'?'crop-bed-1':undefined;
  entity=preferred?rooms[scene]?.entities.find(e=>e.id===preferred):undefined;
 }
 if(!scene||!rooms[scene])return;
 if(scene!==save.scene){
  if(mapRoute(save,scene).failure)return;
  if(!sameCluster(save.scene,scene))return entranceReachable(save,scene)?walkingEntrance(save,scene):undefined;
 }
 const point=entity?.approach??rooms[scene].spawn;
 if(scene!==save.scene){
  if(!continuousPath(worldWithFlags(save.flags),save.scene,globalPoint(save.scene,save.position),scene,globalPoint(scene,point)).length)return;
 }
 const at=scene===save.scene?point:localPoint(save.scene,globalPoint(scene,point));
 return scene===save.scene&&entity?entity:{id:'matter-walk--'+matter.id,kind:'object',label:entity?.label??rooms[scene].title,at,approach:at};
}
