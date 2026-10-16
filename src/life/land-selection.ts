import type {Point} from '../engine/world';
/** Placement previews remain interactive while foreground time and movement
 * are paused. They never become a walking command or an authoritative write. */
export function landClick(at:Point,selecting:string|undefined,paused:boolean,onPick:((at:Point)=>void)|undefined,onWalk:(at:Point)=>void){
 if(selecting){if(!onPick)return 'blocked';onPick({x:Math.round(at.x/4)*4,y:Math.round(at.y/4)*4});return 'preview'}
 if(paused)return 'blocked';onWalk(at);return 'walk';
}
