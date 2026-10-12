import {advanceRoute} from '../engine/distance-motion';
import type {Point,Rect} from '../engine/world';
import {periodAt} from './behavior';
import {finitePoint,overlaps} from './spatial';
import {nativeCrabProfile} from './native-crab-profile';
const inside=(r:Rect,b:Rect)=>b.x>=r.x&&b.y>=r.y&&b.x+b.w<=r.x+r.w&&b.y+b.h<=r.y+r.h;
export const nativeCrabBody=(p:Point,d:Facing):Rect=>{const b=nativeCrabProfile.ground[d];return {...b,x:b.x+p.x,y:b.y+p.y}};
export function nativeCrabClear(p:Point,d:Facing,id:string,r:Rect,c:Context,occupied:readonly Rect[]=[]){const s=c.world.scenes[id],b=nativeCrabBody(p,d);return !!s&&finitePoint(p)&&inside(s.interior,b)&&inside(r,b)&&![...s.obstacles,...(c.forbidden[id]??[]),...occupied,...Object.values(c.people).filter(p=>p.scene===id).map(p=>p.body),...(c.scene===id?[c.player]:[])].some(t=>overlaps(b,t))}
import type {Context,Facing,Period} from './types';

/** Native support-sweep profile fixed to nine authorized originals. Not a save or species registration. */
export {nativeCrabProfile} from './native-crab-profile';
export type CrabLane={scene:string;region:Rect;ends:readonly [Point,Point];facing:Facing};
export type CrabPrototypeDef={id:string;visualVersion:'shore-crab-native-c1-v2';schedule:Partial<Record<Period,CrabLane>>};
export type CrabFrame={id:string;species:'crab';visualVersion:'shore-crab-native-c1-v2';profileRevision:2;scene:string|null;lane:CrabLane|null;foot:Point;direction:Facing;pose:'stand'|'walkA'|'walkB';phase:'hidden'|'idle'|'sidewalk'|'retreat'|'alert';visible:boolean;distance:number;quiet:number;wait:number;waypoint:0|1;route:Point[];reason?:string};
const EPS=1e-7,P=nativeCrabProfile;
const axis=(facing:Facing)=>facing==='down'||facing==='up'?'x':'y';
const other=(a:'x'|'y')=>a==='x'?'y':'x';
const validRect=(r:Rect)=>r&&[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>0&&r.h>0;
const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
const initial=(d:CrabPrototypeDef):CrabFrame=>({id:d.id,species:'crab',visualVersion:d.visualVersion,profileRevision:2,scene:null,lane:null,foot:{x:0,y:0},direction:'down',pose:'stand',phase:'hidden',visible:false,distance:0,quiet:0,wait:0,waypoint:0,route:[]});
export type CrabPreviewGuard={displayClear:(foot:Point,scene:string,region:Rect,context:Context)=>boolean};
/** Optional extra display guard only tightens engineering safety; it never admits
 * artwork, changes the frozen collider, or creates an authority observation. */
export function createNativeCrab(input:readonly CrabPrototypeDef[],previewGuard?:CrabPreviewGuard){
 if(!input.length||input.length>3||new Set(input.map(d=>d.id)).size!==input.length)throw Error('CRAB_DEFINITIONS');
 for(const d of input){if(!/^[a-z][a-z0-9-]{2,60}$/.test(d.id)||d.visualVersion!=='shore-crab-native-c1-v2'||!d.schedule||!Object.keys(d.schedule).length)throw Error('CRAB_DEFINITIONS');
  for(const [period,lane] of Object.entries(d.schedule)){if(!['morning','afternoon','evening','night'].includes(period)||!lane||!lane.scene||!validRect(lane.region)||lane.region.w>2048||lane.region.h>2048||!['down','left','right','up'].includes(lane.facing)||lane.ends?.length!==2||!lane.ends.every(finitePoint))throw Error('CRAB_LANE');
   const a=axis(lane.facing),b=other(a);if(Math.abs(lane.ends[0][b]-lane.ends[1][b])>EPS||Math.abs(lane.ends[0][a]-lane.ends[1][a])<(a==='x'?P.ground[lane.facing].w:P.ground[lane.facing].h)+8)throw Error('CRAB_SIDE_AXIS');
  }
 }
 const defs=freeze(structuredClone(input)) as readonly CrabPrototypeDef[],states=new Map(defs.map(d=>[d.id,initial(d)]));let signature='',minutes=-1;
 const occupied=(s:CrabFrame,ctx:Context,reserved:readonly Rect[])=>[...reserved,...[...states.values()].filter(t=>t.id!==s.id&&t.visible&&t.scene===ctx.scene).map(t=>nativeCrabBody(t.foot,t.direction))];
 const clear=(p:Point,s:CrabFrame,ctx:Context,reserved:readonly Rect[])=>!!s.lane&&nativeCrabClear(p,s.direction,s.lane.scene,s.lane.region,ctx,occupied(s,ctx,reserved))&&(!previewGuard||previewGuard.displayClear(p,s.lane.scene,s.lane.region,ctx)===true);
 const clamp=(p:Point,lane:CrabLane)=>{const a=axis(lane.facing),b=other(a),q={...p};q[a]=Math.max(Math.min(...lane.ends.map(e=>e[a])),Math.min(Math.max(...lane.ends.map(e=>e[a])),q[a]));q[b]=lane.ends[0][b];return q};
 const line=(from:Point,to:Point,s:CrabFrame,ctx:Context,reserved:readonly Rect[],structural=false)=>{
  const a=axis(s.direction),b=other(a);if(Math.abs(from[b]-to[b])>EPS)return false;const count=Math.max(1,Math.ceil(Math.abs(from[a]-to[a])));
  for(let i=1;i<=count;i++){const q={...from,[a]:from[a]+(to[a]-from[a])*i/count};
   if(structural){const c={...ctx,people:{},player:{x:-10000,y:-10000,w:1,h:1}};if(!nativeCrabClear(q,s.direction,s.lane!.scene,s.lane!.region,c)||previewGuard&&previewGuard.displayClear(q,s.lane!.scene,s.lane!.region,c)!==true)return false}
   else if(!clear(q,s,ctx,reserved))return false;
  }return true;
 };
 const spawn=(preferred:Point,s:CrabFrame,ctx:Context,reserved:readonly Rect[],rescue=false)=>{
  const lane=s.lane!,a=axis(lane.facing),lo=Math.min(...lane.ends.map(e=>e[a])),hi=Math.max(...lane.ends.map(e=>e[a]));const options=[clamp(preferred,lane)];
  for(let t=lo;t<=hi;t+=4)options.push({...lane.ends[0],[a]:t});options.push({...lane.ends[1]});
  return options.filter(q=>clear(q,s,ctx,reserved)&&(!rescue||Math.abs(q[a]-preferred[a])<=24&&line(preferred,q,s,ctx,reserved,true))).sort((x,y)=>Math.abs(x[a]-preferred[a])-Math.abs(y[a]-preferred[a]))[0];
 };
 const reconcile=(ctx:Context,reserved:readonly Rect[])=>{
  periodAt(ctx.townMinutes);if(!validRect(ctx.player)||reserved.some(r=>!validRect(r)))throw Error('CRAB_CONTEXT');const sig=ctx.scene+':'+ctx.townMinutes;if(sig===signature)return;
  // A foreground minute confirmation is not a new visit or elapsed motion.
  // Keep only an identical current-scene lane; ordinary tick safety still runs.
  const consecutive=minutes>=0&&ctx.townMinutes===minutes+1&&periodAt(minutes)===periodAt(ctx.townMinutes),preserved=new Set(defs.filter(d=>{const s=states.get(d.id)!,lane=d.schedule[periodAt(ctx.townMinutes)];return consecutive&&s.scene===ctx.scene&&lane?.scene===ctx.scene&&JSON.stringify(s.lane)===JSON.stringify(lane)}).map(d=>d.id));signature=sig;minutes=ctx.townMinutes;
  for(const d of defs)if(!preserved.has(d.id))states.set(d.id,initial(d));
  defs.forEach((d,index)=>{if(preserved.has(d.id))return;const s=states.get(d.id)!,lane=d.schedule[periodAt(ctx.townMinutes)];s.lane=lane??null;s.scene=lane?.scene??null;s.reason=lane?'other-scene':'schedule-away';if(!lane||lane.scene!==ctx.scene)return;s.direction=lane.facing;const a=axis(lane.facing),start={...lane.ends[0],[a]:lane.ends[0][a]+Math.sign(lane.ends[1][a]-lane.ends[0][a])*index*24};const q=spawn(start,s,ctx,reserved);if(!q){s.reason='no-safe-position';return}s.visible=true;s.foot={...q};s.phase='idle';s.wait=P.endPause;s.reason=undefined;
  });
 };
 const snapshot=()=>structuredClone([...states.values()]);
 const tick=(elapsed:number,ctx:Context,reserved:readonly Rect[]=[])=>{
  if(!Number.isFinite(elapsed)||elapsed<0)throw Error('INVALID_FRAME_TIME');reconcile(ctx,reserved);const dt=ctx.paused?0:Math.min(elapsed,.04),player={x:ctx.player.x+ctx.player.w/2,y:ctx.player.y+ctx.player.h/2};
  for(const s of states.values()){if(!s.lane||s.scene!==ctx.scene)continue;
   if(!s.visible||!clear(s.foot,s,ctx,reserved)){const rescue=s.reason==='blocked-safety'||s.visible,q=spawn(s.foot,s,ctx,reserved,rescue);s.route=[];s.pose='stand';s.quiet=0;s.distance=0;if(!q){s.visible=false;s.phase='hidden';s.reason=rescue?'blocked-safety':'no-safe-position';continue}s.visible=true;s.foot={...q};s.phase='idle';s.wait=P.endPause;s.reason=undefined}
   if(!dt)continue;const near=Math.hypot(player.x-s.foot.x,player.y-s.foot.y),a=axis(s.direction);let motionDt=dt;
   if(near<P.stopDistance&&s.phase!=='retreat'){
    const sign=Math.sign(s.foot[a]-player[a])||1,perpendicular=s.foot[other(a)]-player[other(a)],offset=Math.sqrt(Math.max(0,P.targetDistance**2-perpendicular**2));const wanted=clamp({...s.foot,[a]:s.foot[a]+sign*Math.min(P.maxRetreat,Math.max(0,offset-Math.abs(s.foot[a]-player[a])))},s.lane);
    if(Math.abs(wanted[a]-s.foot[a])>EPS&&clear(wanted,s,ctx,reserved)&&line(s.foot,wanted,s,ctx,reserved)){s.phase='retreat';s.route=[wanted];s.wait=0;s.reason=undefined}
    else{s.phase='alert';s.pose='stand';s.route=[];s.quiet+=dt;s.reason='no-safe-side-retreat';continue}
   }
   if(s.phase==='retreat'&&near>=P.resumeDistance){s.phase='idle';s.pose='stand';s.route=[];s.wait=P.endPause;s.quiet=0;continue}
   if(s.phase==='alert'&&near>=P.resumeDistance){s.phase='idle';s.wait=P.endPause;s.reason=undefined}
   if(s.phase==='alert'){s.pose='stand';s.quiet+=dt;continue}
   if(s.wait>0){const spent=Math.min(s.wait,motionDt);s.wait=Math.max(0,s.wait-spent);motionDt-=spent;s.quiet+=spent;if(motionDt<=EPS){s.pose='stand';continue}}
   if(!s.route.length){const to=s.lane.ends[s.waypoint===0?1:0];if(!clear(to,s,ctx,reserved)||!line(s.foot,to,s,ctx,reserved)){s.phase='idle';s.pose='stand';s.quiet+=motionDt;s.reason='side-lane-blocked';continue}s.route=[{...to}];s.phase='sidewalk';s.reason=undefined}
   const retreat=s.phase==='retreat',speed=retreat?P.retreatSpeed:P.speed,result=advanceRoute(s.foot,s.route,speed*motionDt,q=>clear(q,s,ctx,reserved));s.foot=result.position;s.route.splice(0,result.consumed);
   if(result.distance>EPS){s.distance+=result.distance;s.quiet=0;s.pose=Math.floor(s.distance/P.stride*2)%2?'walkB':'walkA'}else{s.pose='stand';s.quiet+=motionDt}
   if(result.arrived||result.blocked){s.route=[];s.phase=retreat?'alert':'idle';s.pose='stand';const unused=Math.max(0,motionDt-result.distance/speed);s.wait=Math.max(0,P.endPause-unused);if(result.distance>EPS)s.quiet=unused;if(!retreat&&!result.blocked)s.waypoint=s.waypoint===0?1:0;s.reason=result.blocked?'side-lane-blocked':retreat?'retreat-limit':undefined}
  }return snapshot();
 };
 return {tick,snapshot,committedMinute:()=>minutes,restore:(frames:readonly CrabFrame[],ctx:Context)=>{
  reconcile(ctx,[]);if(frames.length!==defs.length)throw Error('CRAB_RESTORE');
  for(const d of defs){const s=frames.find(f=>f.id===d.id);if(!s||s.species!=='crab'||s.visualVersion!==d.visualVersion||s.profileRevision!==2||JSON.stringify(s.lane)!==JSON.stringify(d.schedule[periodAt(ctx.townMinutes)]??null))throw Error('CRAB_RESTORE');states.set(d.id,structuredClone(s))}
 },reset:()=>{signature='';minutes=-1;for(const d of defs)states.set(d.id,initial(d))},observe:(id:string,ctx:Context,reserved:readonly Rect[]=[])=>{
  tick(0,ctx,reserved);const s=states.get(id);if(!s?.visible||s.scene!==ctx.scene)throw Error('CRAB_AWAY');const distance=Math.hypot(ctx.player.x+ctx.player.w/2-s.foot.x,ctx.player.y+ctx.player.h/2-s.foot.y);
  if(distance<72||distance>112)throw Error('CRAB_OBSERVATION_DISTANCE');if(s.phase!=='idle'||s.pose!=='stand'||s.quiet<P.quietTime)throw Error('CRAB_NEEDS_QUIET_MOMENT');
  return {fixtureOnly:true as const,activationAllowed:false as const,profile:P.id,profileRevision:P.revision,minute:ctx.townMinutes,scene:ctx.scene,behavior:'shore-space' as const,frame:structuredClone(s)};
 }};
}
