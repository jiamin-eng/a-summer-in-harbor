import {rooms} from './data';
import {internalPassage} from '../candidate/continuity';
import type {Point} from '../engine/world';
/** Only explicit reciprocal-door arrivals. Shared walking and distant save restores retain pose. */
export function arrivalFacing(from:string|undefined,to:string,position:Point):Point|undefined{
 if(!from||from===to||internalPassage(from,to))return;
 const door=rooms[to]?.entities.find(e=>e.kind==='portal'&&e.destination===from);
 if(!door||Math.hypot(position.x-door.approach.x,position.y-door.approach.y)>1)return;
 const dx=door.approach.x+8-door.at.x,dy=door.approach.y+6-door.at.y;
 if(Math.hypot(dx,dy)<1)return;
 return {x:position.x+dx,y:position.y+dy};
}
