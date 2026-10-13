import {neighborTopicIds} from './neighbor-chapter';
import {priestTopicIds} from './chapel-priest';
import {chapelTopicIds} from './chapel';
import {growthTopicIds,growthObservationVerbs,relationshipProfiles} from './relationship-growth';
import {nomadTopicIds} from './tech-nomads';
import {nextTopicIds} from './next-neighbors';
import {newsTopicIds} from './town-news';
import {lifeTopicIds} from './resident-life';
import {presentEntity,observedActor,residentRoutes} from '../world/residents';
import {compileSpatialBinding,type SpatialSnapshot} from '../engine/spatial-binding';
import {rooms,world,people,type Entity} from '../world/data';
import {walkable} from '../engine/world';
import {topics,type Save,type Action} from './state';
import {GAME_UUID} from '../game-id';
import {gameAnimalInteraction} from '../animals/game';
import type {World} from '../engine/world';
const key=(scene:string,entity:string,verb:string)=>scene+'/'+entity+'/'+verb;
const rpgChapelActor=(e:Entity)=>rooms.chapel.entities.includes(e)&&['dani','samira'].includes(e.person??'');
function verbs(e:Entity):string[]{
 if(e.kind==='portal')return ['travel'];
 if(e.person)return ['introduce','ask',...(e.person==='june'&&rooms.workshop.entities.includes(e)?['notes-generate']:[]),...(topics[e.person]??[]).map(t=>'talk:'+t.id),...[...(relationshipProfiles[e.person]?growthTopicIds:[]),...lifeTopicIds(e.person),...priestTopicIds(e.person),...(rpgChapelActor(e)?chapelTopicIds:[]),...nextTopicIds(e.person),...nomadTopicIds(e.person),...neighborTopicIds(e.person)].map(id=>'talk:'+id),...(e.person==='idris'?['talk:class-invite']:[]),...(e.person==='dani'?newsTopicIds.map(id=>'talk:'+id):[]),...(e.person==='idris'?['sparring','footwork','endurance']:e.person==='ruth'?['fishing']:[]).map(id=>'challenge-start:'+id)];
 return [...growthObservationVerbs(e.id),...(e.actions??[]),...(e.id==='terrace'?['challenge-start:repair']:e.id==='old-map'?['challenge-start:map']:[])];
}
const entityDefs=Object.values(rooms).flatMap(r=>r.entities.map(e=>({
 id:r.id+'/'+e.id,scene:r.id,position:{x:e.at.x-8,y:e.at.y-6},approach:e.approach,states:['present'],
 actions:verbs(e).map(v=>key(r.id,e.id,v)),
})));
const rules=Object.values(rooms).flatMap(r=>r.entities.flatMap(e=>verbs(e).map(v=>({id:key(r.id,e.id,v),effects:e.destination?[{type:'map',nodeId:e.destination}]:[]}))));
const initialMap=Object.values(rooms).map(r=>({id:r.id,current:r.id==='station'}));
const characters=Object.keys(people).map(id=>({id}));
export const spatialBinding=compileSpatialBinding({id:GAME_UUID,initialMap,characters,domainRules:{rules}},{
 version:1,cartridgeId:GAME_UUID,mapVersion:'harbor-map-v1',actionScope:'scene',interactionDistance:75,
 scenes:Object.values(rooms).map(r=>({id:r.id,spawn:r.spawn})),entities:entityDefs,
 characters:characters.map(p=>({id:p.id,kind:'physical',travels:!!residentRoutes[p.id],entities:Object.values(rooms).flatMap(r=>r.entities.filter(e=>e.person===p.id).map(e=>r.id+'/'+e.id))})),
 portals:Object.values(rooms).flatMap(r=>r.entities.filter(e=>e.destination).map(e=>({
  actionId:key(r.id,e.id,'travel'),fromScene:r.id,scene:e.destination!,
  position:rooms[e.destination!].entities.find(back=>back.destination===r.id)?.approach??rooms[e.destination!].spawn,
 }))),
},(scene,p)=>walkable(world,scene,p));
// A deferred resident can remain in an old save without belonging to this release's map.
export const spatialSnapshot=(s:Save):SpatialSnapshot=>({cartridgeId:GAME_UUID,map:initialMap.map(r=>({id:r.id,current:r.id===s.scene})),characters:s.known.filter(id=>people[id]).map(id=>({id}))});
export function admitSpatialAction(s:Save,a:Action,spatialWorld?:World){
 if(a.action.startsWith('battle-')||a.action==='snack-eat'||['travel-map','challenge-finish'].includes(a.action))return null; // domain-specific gates remain authoritative
 const e=rooms[s.scene].entities.find(e=>e.id===a.target);if(e&&!presentEntity(s,e))throw Error('PERSON_AWAY');
 const actionKey=key(s.scene,a.target,a.action);
 if(e?.animalId)gameAnimalInteraction(s,a,spatialWorld);
 const at=e?.animalId?a.actorPosition:e?observedActor(e,a.actorPosition):null;const offset=e&&at?{x:at.x-e.at.x,y:at.y-e.at.y}:{x:0,y:0};
 if(!spatialBinding.admits(actionKey,s.scene+'/'+a.target,s.scene,{x:a.position.x-offset.x,y:a.position.y-offset.y}))throw Error('SPATIAL_ACTION_NOT_ADMITTED');
 return actionKey;
}
