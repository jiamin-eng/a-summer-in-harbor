import {outdoors} from './outdoors';
import {terrainAt} from './road-boundaries';
import {terrainZoneVisible} from './terrain-ownership';
import {globalPoint,localPoint,zonesFor,renderScene} from '../candidate/continuity';
import {rooms} from './data';
import {walkable,type Point,type Rect,type World} from '../engine/world';
export const castReach=96;
export type WaterKind='saltwater'|'stream';
export type ShoreTarget={at:Point;water:WaterKind;zone:string;distance:number};
export type ShoreCheck={ok:true;target:ShoreTarget}|{ok:false;reason:'NO_WATER'|'WATER_TOO_FAR'|'CAST_BLOCKED'|'INVALID_STANDING'};
const inside=(r:Rect,p:Point)=>p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.w&&p.y<r.y+r.h;
function material(zone:string,p:Point){const l=outdoors[zone];if(!l)return;const top=terrainAt(l,p);if(inside(l.bounds,p))return top;return top==='water'?'water':l.patches[0]?.material;}
/** Uses terrain areas, never authored fishing-point IDs. Coordinates are logical-local. */
export function waterAt(scene:string,p:Point):{zone:string;water:WaterKind}|null{
 const gp=globalPoint(scene,p),zones=zonesFor(scene).filter(z=>outdoors[z]&&terrainZoneVisible(z,gp));
 const zone=zones.find(z=>inside(outdoors[z].bounds,localPoint(z,gp)))??zones.find(z=>{const q=localPoint(z,gp);return q.x>=0&&q.y>=0&&q.x<1440&&q.y<1088})??(zones.includes(scene)?scene:zones[0]);
 if(!zone||material(zone,localPoint(zone,gp))!=='water')return null;
 return {zone,water:zone==='path'?'stream':'saltwater'};
}
type WaterCell=Rect&{zone:string;water:WaterKind};
const cells=new Map<string,WaterCell[]>();
/** Partition the same top-terrain rectangles and owner masks into water areas. */
export function shoreWaterCells(scene:string):WaterCell[]{
 const key=renderScene(scene);let cached=cells.get(key);if(cached)return cached;
 const zones=zonesFor(scene).filter(z=>outdoors[z]);if(!zones.length)return [];
 const xs=new Set<number>([-128,0,1235,2035]),ys=new Set<number>([-128,0,260,650,805,820]);
 for(const z of zones){const l=outdoors[z],o=globalPoint(z,{x:0,y:0});for(const r of [l.bounds,...l.patches,{x:-128,y:-128,w:1696,h:1344}]){xs.add(o.x+r.x);xs.add(o.x+r.x+r.w);ys.add(o.y+r.y);ys.add(o.y+r.y+r.h)}}
 const xx=[...xs].sort((a,b)=>a-b),yy=[...ys].sort((a,b)=>a-b),out:WaterCell[]=[];
 for(let j=0;j<yy.length-1;j++)for(let i=0;i<xx.length-1;i++){const r={x:xx[i],y:yy[j],w:xx[i+1]-xx[i],h:yy[j+1]-yy[j]},at={x:r.x+r.w/2,y:r.y+r.h/2},w=waterAt(scene,localPoint(scene,at));if(w)out.push({...r,...w})}
 cells.set(key,out);return out;
}
function clearCast(scene:string,from:Point,to:Point,world:World){
 const blockers=zonesFor(scene).flatMap(z=>rooms[z]?.props.filter(p=>p.footprint&&p.footprint.w>0&&p.footprint.h>0).map(p=>{const q=globalPoint(z,p.footprint!);return {...q,w:p.footprint!.w,h:p.footprint!.h}})??[]),a=globalPoint(scene,from),b=globalPoint(scene,to),steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/3));
 for(let i=1;i<=steps;i++){const gp={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};if(blockers.some(r=>inside(r,gp)))return false;const p=localPoint(scene,gp);if(!waterAt(scene,p)&&world.scenes[scene]?.obstacles.some(o=>inside(o,p)))return false;}
 return true;
}
export function checkShore(scene:string,standing:Point,world:World,aim?:Point):ShoreCheck{
 if(!world.scenes[scene]||!walkable(world,scene,standing))return {ok:false,reason:'INVALID_STANDING'};
 const water=shoreWaterCells(scene);if(!water.length)return {ok:false,reason:'NO_WATER'};
 const foot={x:standing.x+world.actor.w/2,y:standing.y+world.actor.h/2};
 if(aim){if(!Number.isFinite(aim.x)||!Number.isFinite(aim.y)||!waterAt(scene,aim))return {ok:false,reason:'NO_WATER'};const distance=Math.hypot(aim.x-foot.x,aim.y-foot.y);if(distance>castReach)return {ok:false,reason:'WATER_TOO_FAR'};if(!clearCast(scene,foot,aim,world))return {ok:false,reason:'CAST_BLOCKED'};return {ok:true,target:{at:{...aim},...waterAt(scene,aim)!,distance}}}
 const gf=globalPoint(scene,foot),candidates:ShoreTarget[]=[];
 for(const r of water){const x=Math.max(r.x+.25,Math.min(r.x+r.w-.25,gf.x)),y=Math.max(r.y+.25,Math.min(r.y+r.h-.25,gf.y));for(const offset of [0,-24,24,-48,48])for(const axis of ['x','y']as const){const gp={x:Math.max(r.x+.25,Math.min(r.x+r.w-.25,x+(axis==='x'?offset:0))),y:Math.max(r.y+.25,Math.min(r.y+r.h-.25,y+(axis==='y'?offset:0)))},p=localPoint(scene,gp),distance=Math.hypot(gp.x-gf.x,gp.y-gf.y);if(distance<=castReach&&waterAt(scene,p))candidates.push({at:p,zone:r.zone,water:r.water,distance})}}
 candidates.sort((a,b)=>a.distance-b.distance);for(const target of candidates)if(clearCast(scene,foot,target.at,world))return {ok:true,target};
 return {ok:false,reason:candidates.length?'CAST_BLOCKED':'WATER_TOO_FAR'};
}
