import type {Point} from '../engine/world';
import type {ShoreCheck} from './shore-water';
export type ShoreSample={journey:string;scene:string;standing:Point;value:ShoreCheck};
/** A load/new journey/scene must not display a previous journey's sampled point. */
export function sampledShore(sample:ShoreSample|null,save:{id:string;scene:string}|null|undefined):ShoreCheck{
 return sample&&save&&sample.journey===save.id&&sample.scene===save.scene?sample.value:{ok:false,reason:'WATER_TOO_FAR'};
}
/** Presentation only: the target is supplied by checkShore, never recomputed here. */
export type ShorePreview={scene:string;standing:Point;target:Point};
export function projectShorePreview(preview:ShorePreview|undefined,scene:string,standing:Point,project:(p:Point)=>Point):Point|null{
 if(!preview||preview.scene!==scene||Math.hypot(preview.standing.x-standing.x,preview.standing.y-standing.y)>24)return null;
 const p=project(preview.target);return Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;
}
