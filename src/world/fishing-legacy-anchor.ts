import {checkShore,clearCast,shoreWaterCells,waterAt,castReach} from './shore-water';
import {globalPoint,localPoint} from '../candidate/continuity';
import {walkable,type Point} from '../engine/world';
/** Ruth's old loan has no authoritative cast target. The scene may show a
 * longer borrowed-rod line from the real player to real clear water. This
 * bounded visual fallback never grants a cast or supplies a reward/save. */
export function legacyFishingAnchor(scene:string,standing:Point,world:Parameters<typeof checkShore>[2],renderedScene:string|null){
 if(scene!==renderedScene)return undefined;
 const check=checkShore(scene,standing,world);
 if(check.ok)return{scene,standing:{...standing},target:{...check.target.at}};
 if(scene!=='dock'||!walkable(world,scene,standing))return undefined;
 const foot={x:standing.x+world.actor.w/2,y:standing.y+world.actor.h/2},gf=globalPoint(scene,foot);
 const candidates=shoreWaterCells(scene).map(r=>localPoint(scene,{x:Math.max(r.x+.25,Math.min(r.x+r.w-.25,gf.x)),y:Math.max(r.y+.25,Math.min(r.y+r.h-.25,gf.y))}));
 candidates.sort((a,b)=>Math.hypot(a.x-foot.x,a.y-foot.y)-Math.hypot(b.x-foot.x,b.y-foot.y));
 const target=candidates.find(p=>Math.hypot(p.x-foot.x,p.y-foot.y)<=castReach*2&&waterAt(scene,p)&&clearCast(scene,foot,p,world));
 return target?{scene,standing:{...standing},target:{...target}}:undefined;
}
