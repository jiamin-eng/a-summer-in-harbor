import {boundaryPieces} from '../world/outdoor-boundaries';
import {waterBanks} from '../world/strong-ground-edges';
import {localPoint} from '../candidate/continuity';
import type {Rect} from '../engine/world';
/** Renderer dressing is not a collision obstacle. These masks only keep rain
 * impacts off its visible pixels and off the newly dressed shoreline. */
export function weatherSceneMasks(scene:string):Rect[]{
 const pieces=boundaryPieces(scene).map(p=>({...localPoint(scene,p.rect),w:p.rect.w,h:p.rect.h}));
 const banks=waterBanks(scene).map(e=>({x:Math.min(e.from.x,e.to.x)-16,y:Math.min(e.from.y,e.to.y)-16,w:Math.abs(e.to.x-e.from.x)+32,h:Math.abs(e.to.y-e.from.y)+32}));
 return [...pieces,...banks];
}
