import {rooms, type Entity} from '../world/data';
import {presentEntity, patrolRadius} from '../world/residents';
import {dynamicWorld} from '../dynamic-assets/layout';
import type {Point, World} from '../engine/world';
import type {Save, Action} from '../story/state';
import {acceptedAnimals} from './art';
import {harborContext} from './harbor-adapter';
import {applyAnimalInteraction} from './memory';
import type {Context} from './types';
import {weatherAnimalSlots} from '../weather/animal-shelter';
import {catFamiliarities} from './familiarity';

/** Current admitted roster (22 configured; pending art is absent). Server conservatively reserves each legal
 * stroll corridor because transient NPC movement is not persisted. Renderer
 * supplies live feet and uses the same corridors for action safety. */
export function animalPeople(save: Pick<Save,'townMinutes'|'flags'>, positions?: ReadonlyMap<string,Point>): Context['people'] {
 const people: Context['people'] = {};
 for (const room of Object.values(rooms)) for (const entity of room.entities) {
  if (!entity.person || !presentEntity({...save,scene:room.id},entity)) continue;
  const foot = positions?.get(room.id+'/'+entity.id) ?? entity.at;
  const radius = patrolRadius(entity.person);
  people[entity.person] = {scene:room.id, foot:{...foot}, body:{x:entity.at.x-radius-9,y:entity.at.y-8,w:18+2*radius,h:8}};
 }
 return people;
}
export function gameAnimalContext(save: Pick<Save,'scene'|'townMinutes'|'flags'|'weatherV1'|'weatherEcologyV1'|'animalsV1'>, position:Point, options:{world?:World;positions?:ReadonlyMap<string,Point>;paused?:boolean;dynamic?:boolean;weatherShelter?:boolean}={}):Context {
 return {...harborContext(save, options.world ?? dynamicWorld(save.flags, !!options.dynamic), rooms, position, animalPeople(save,options.positions), !!options.paused),catFamiliarities:catFamiliarities(save.animalsV1),...(save.weatherEcologyV1&&options.weatherShelter!==false?{animalSlots:weatherAnimalSlots(save)}:{})};
}
export function gameAnimalInteraction(save:Save, action:Action, spatialWorld?:World) {
 const entity:Entity|undefined=rooms[save.scene]?.entities.find(e=>e.id===action.target);
 if (!entity?.animalId || !acceptedAnimals.some(def=>def.id===entity.animalId)) throw Error('ANIMAL_UNAVAILABLE');
 if (!['animal-call','animal-pet'].includes(action.action)) throw Error('ANIMAL_ACTION_UNAVAILABLE');
 if (!action.actorPosition) throw Error('INVALID_ANIMAL_POSITION');
 return applyAnimalInteraction(save.animalsV1,acceptedAnimals,gameAnimalContext(save,action.position,{world:spatialWorld}),{
  target:entity.animalId,verb:action.action==='animal-call'?'call':'pet',foot:action.actorPosition,
 });
}
