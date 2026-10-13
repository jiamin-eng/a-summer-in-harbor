import type {Save} from '../story/state';
import type {Point,Rect,World} from '../engine/world';
import {rooms} from '../world/data';
import {landWorld} from '../life/land';
import {dynamicWorld} from '../dynamic-assets/layout';
import {acceptedAnimals} from './art';
import {createAnimalRuntime,periodAt} from './behavior';
import {gameAnimalContext} from './game';
import {createNativeCrab,nativeCrabBody,type CrabFrame,type CrabPrototypeDef} from './native-crab';
import {nativeCrabProfile} from './native-crab-profile';
import {chooseNativeCrabLane,chooseNativePlayerStart} from './native-crab-lanes';
import {previewClear,type Geometry,type PreviewContext} from './display-space';
import geometryFile from './display-space-geometry.json';
import manifest from './native-crab-manifest.json';
import {nativeCrabId,nativeCrabPin,nativeCrabPlaces} from './native-crab-config';
import type {AnimalSample} from '../animal-life/types';
export type NativeEvent={minute:number;sourceAction:string};
export type NativeSample=AnimalSample&{quietMs:number};
export type NativeCrabSave={schema:1;pin:typeof nativeCrabPin;minute:number;scene:string;frame:CrabFrame;sample?:NativeSample;observation?:NativeEvent;brief?:NativeEvent;plan?:NativeEvent;page?:NativeEvent};
const geometry=geometryFile as unknown as Geometry;
const minute=(s:Pick<Save,'townMinutes'>)=>s.townMinutes??540;
const relative=manifest.displayEnvelope;
const pixel=(p:Point)=>({x:Math.round(p.x),y:Math.round(p.y)});
const record=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:any,lo=0,hi=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const point=(p:any)=>record(p)&&Object.keys(p).sort().join(',')==='x,y'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=10000&&Math.abs(p.y)<=10000;
const event=(e:any,m:number)=>record(e)&&Object.keys(e).sort().join(',')==='minute,sourceAction'&&integer(e.minute,0,m)&&typeof e.sourceAction==='string'&&/^[-a-zA-Z0-9]{16,80}$/.test(e.sourceAction);
/** The same authored lanes and complete display protection serve the renderer,
 * compact authority and observation. Planning never supplies a player proof. */
export function nativeCrabEngine(s:Pick<Save,'scene'|'townMinutes'|'flags'|'landV1'>,p:Point,paused=false){
 const world=landWorld(dynamicWorld(s.flags,false),s.landV1),ctx=gameAnimalContext(s,p,{world,paused});
 const oldEngine=createAnimalRuntime(acceptedAnimals),old=oldEngine.tick(0,ctx);
 const schedule:CrabPrototypeDef['schedule']={};
 const periods={morning:{scene:'coast',facing:'down'},afternoon:{scene:'beach',facing:'left'},evening:{scene:'dock',facing:'up'},night:{scene:'coast',facing:'right'}} as const;
 const period=periodAt(minute(s)),slot=periods[period];
 const planning={...ctx,scene:slot.scene,paused:true,player:{x:-10000,y:-10000,w:16,h:12}};
 const plannedOld=createAnimalRuntime(acceptedAnimals).tick(0,planning);
 const lane=chooseNativeCrabLane(nativeCrabPlaces[slot.scene],slot.scene,world.scenes[slot.scene].interior,relative,{context:planning,states:plannedOld,geometry},slot.facing);
 if(lane)schedule[period]=lane;
 // A structurally unavailable lane is a hidden candidate, never a new route.
 const fallback={scene:slot.scene,region:{...world.scenes[slot.scene].interior},ends:[nativeCrabPlaces[slot.scene],{...nativeCrabPlaces[slot.scene],...(slot.facing==='down'||slot.facing==='up'?{x:nativeCrabPlaces[slot.scene].x+64}:{y:nativeCrabPlaces[slot.scene].y+64})}],facing:slot.facing} as const;
 const contexts=new WeakMap<object,PreviewContext>();
 const display=(foot:Point,id:string,r:Rect,c:typeof ctx)=>{let input=contexts.get(c);if(!input){input={context:c,states:old,geometry};contexts.set(c,input)}return !!lane&&previewClear(pixel(foot),id,r,relative,input)};
 const runtime=createNativeCrab([{id:nativeCrabId,visualVersion:'shore-crab-native-c1-v2',schedule:lane?schedule:{[period]:fallback}}],{displayClear:display});
 return {runtime,context:ctx,old,definitionLane:lane};
}
export function nativeCrabFrame(s:Pick<Save,'scene'|'townMinutes'|'flags'|'landV1'|'nativeCrabV1'>,p:Point,paused=false){
 const e=nativeCrabEngine(s,p,paused),n=s.nativeCrabV1,m=minute(s);
 const consecutive=n&&n.minute+1===m&&periodAt(n.minute)===periodAt(m)&&n.frame.scene===s.scene&&!!e.definitionLane&&JSON.stringify(n.frame.lane)===JSON.stringify(e.definitionLane);
 if(n&&n.scene===s.scene&&(n.minute===m||consecutive)){try{e.runtime.restore([n.frame],e.context)}catch{throw Error('UNSUPPORTED_NATIVE_CRAB')}}
 return {engine:e,frame:e.runtime.tick(0,e.context)[0]};
}
/** Shape/pins are strict; a valid archived pose may be older than the current
 * town time after a compatible old runtime action. Reading never rewrites it. */
export function validNativeCrabField(n:any,version:number,m:number){
 if(n===undefined)return true;
 if(!record(n)||n.schema!==1||!record(n.pin)||Object.keys(n.pin).sort().join(',')!==Object.keys(nativeCrabPin).sort().join(',')||Object.entries(nativeCrabPin).some(([k,v])=>n.pin[k]!==v)||!integer(n.minute,0,m)||!rooms[n.scene]||Object.keys(n).some(k=>!['schema','pin','minute','scene','frame','sample','observation','brief','plan','page'].includes(k))||JSON.stringify(n).length>8192)return false;
 const validFrame=(f:any)=>record(f)&&f.id===nativeCrabId&&f.species==='crab'&&f.visualVersion==='shore-crab-native-c1-v2'&&f.profileRevision===2&&['down','left','right','up'].includes(f.direction)&&['stand','walkA','walkB'].includes(f.pose)&&['hidden','idle','sidewalk','retreat','alert'].includes(f.phase)&&typeof f.visible==='boolean'&&point(f.foot)&&[f.distance,f.quiet,f.wait].every(v=>Number.isFinite(v)&&v>=0&&v<=1e7)&&[0,1].includes(f.waypoint)&&Array.isArray(f.route)&&f.route.length<=1&&f.route.every(point)&&Object.keys(f).every(k=>['id','species','visualVersion','profileRevision','scene','lane','foot','direction','pose','phase','visible','distance','quiet','wait','waypoint','route','reason'].includes(k))&&(!f.visible||!!f.lane&&f.scene===f.lane.scene)&&(!f.reason||typeof f.reason==='string'&&f.reason.length<=80)&&(!f.lane||record(f.lane)&&rooms[f.lane.scene]&&['down','left','right','up'].includes(f.lane.facing)&&Array.isArray(f.lane.ends)&&f.lane.ends.length===2&&f.lane.ends.every(point)&&record(f.lane.region)&&['x','y','w','h'].every(k=>Number.isFinite(f.lane.region[k]))&&f.lane.region.w>0&&f.lane.region.h>0);
 if(!validFrame(n.frame)||['observation','brief','plan','page'].some(k=>n[k]!==undefined&&!event(n[k],m))||n.plan&&!n.brief||n.page&&(!n.plan||!n.observation))return false;
 if(n.sample){const q=n.sample;if(!record(q)||Object.keys(q).sort().join(',')!=='behavior,frame,minute,player,quietMs,scene,sourceAction,version'||!event({minute:q.minute,sourceAction:q.sourceAction},m)||!integer(q.version,0,version)||!rooms[q.scene]||!point(q.player)||q.behavior!=='shore-space'||q.quietMs!==400||!validFrame(q.frame)||q.frame.scene!==q.scene||!q.frame.visible||q.frame.phase!=='idle'||q.frame.pose!=='stand')return false}
 return true;
}
export function assertNativeCrab(s:Pick<Save,'nativeCrabV1'|'townMinutes'|'version'>){if(!validNativeCrabField(s.nativeCrabV1,s.version,minute(s)))throw Error('UNSUPPORTED_NATIVE_CRAB')}
/** Advances only the already validated active foreground budget. Pure motion
 * reconciles changed obstacles/feet with zero elapsed time. No other head field. */
export function advanceNativeCrab(s:Save,seconds:number,enabled:boolean){
 assertNativeCrab(s);if(!Number.isFinite(seconds)||seconds<0||seconds>3)throw Error('INVALID_NATIVE_BUDGET');
 if(!s.nativeCrabV1&&(!enabled||!['coast','beach','dock'].includes(s.scene)))return;
 const {engine,frame}=nativeCrabFrame(s,s.position),old=s.nativeCrabV1;
 let current=frame,remaining=seconds;
 while(remaining>1e-9){const dt=Math.min(.04,remaining);current=engine.runtime.tick(dt,engine.context)[0];remaining-=dt}
 s.nativeCrabV1={...(old??{}),schema:1,pin:{...nativeCrabPin},minute:minute(s),scene:s.scene,frame:current};
 if(seconds>0||!old||old.minute!==minute(s)||JSON.stringify(old.frame)!==JSON.stringify(current))delete s.nativeCrabV1.sample;
 assertNativeCrab(s);
}
export function nativeCrabCollision(s:Pick<Save,'nativeCrabV1'|'scene'|'townMinutes'>):Rect[]{const n=s.nativeCrabV1;return n&&n.minute===minute(s)&&n.scene===s.scene&&n.frame.visible&&n.frame.scene===s.scene?[nativeCrabBody(pixel(n.frame.foot),n.frame.direction)]:[]}
export function currentNativeSample(s:Save,p=s.position){const q=s.nativeCrabV1?.sample;return q&&q.version===s.version&&q.minute===minute(s)&&q.scene===s.scene&&Math.hypot(p.x-q.player.x,p.y-q.player.y)<=2?q:undefined}
// Standing beside the crab keeps it in view above the existing mobile controls.
// Reuse the admitted nearby-ground search and its safe fallbacks; body facing is
// unchanged, and the target remains read-only at the actual rendered foot.
export function nativeCrabTargets(frame:CrabFrame,scene:string,world:World){const approach=chooseNativePlayerStart(pixel(frame.foot),'left',world,scene);return frame.visible&&frame.scene===scene&&approach?[{id:frame.id,animalId:frame.id,kind:'object' as const,label:['岸边的蟹','Shore crab'] as [string,string],at:pixel(frame.foot),approach,actions:[] as string[]}]:[]}
export const nativeQuietSeconds=nativeCrabProfile.quietTime;
