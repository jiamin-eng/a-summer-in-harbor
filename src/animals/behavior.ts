import {advanceRoute} from '../engine/distance-motion';
import type {Point} from '../engine/world';
import {profiles} from './config';
import {familiarCatGreeting} from './familiarity';
import {animalPath,finitePoint,freePoint,pointClear,terrainClear,candidates} from './spatial';
import type {AnimalDef,AnimalState,Context,Facing,Period,Pose,Slot,SpeciesProfile} from './types';
export function periodAt(minutes:number):Period{if(!Number.isSafeInteger(minutes)||minutes<0)throw Error('INVALID_TOWN_TIME');const m=minutes%1440;return m<360||m>=1260?'night':m<720?'morning':m<1020?'afternoon':'evening'}
export const slotAt=(a:AnimalDef,m:number):Slot|null=>a.schedule[periodAt(m)]??null;
export const contextSlot=(a:AnimalDef,ctx:Context):Slot|null=>ctx.animalSlots?.[a.id]??slotAt(a,ctx.townMinutes);
const face=(from:Point,to:Point,previous:Facing):Facing=>{const x=to.x-from.x,y=to.y-from.y;if(Math.abs(x)+Math.abs(y)<1e-7)return previous;return Math.abs(x)>Math.abs(y)?x>0?'right':'left':y>0?'down':'up'};
const initial=(a:AnimalDef):AnimalState=>({id:a.id,species:a.species,visualVersion:a.visualVersion,scene:null,slot:null,foot:{x:0,y:0},direction:'down',pose:'stand',phase:'hidden',visible:false,distance:0,elevation:0,attention:0,cooldown:0,route:[],flightDistance:0,flightTotal:0,wingTime:0,waypoint:0,wait:0});
/** Observed movement is ephemeral; only committed townMinutes selects a schedule. */
export function createAnimalRuntime(defs:readonly AnimalDef[],options:{profiles?:Partial<typeof profiles>;displayClear?:(p:Point,slot:Slot,ctx:Context)=>boolean;holdOccupied?:boolean;preserveVisibleSlot?:boolean}={}){
 const effective={...profiles,...options.profiles};
 const clear=(p:Point,slot:Slot,profile:SpeciesProfile,ctx:Context,others:readonly AnimalState[])=>pointClear(p,slot,profile,ctx,others)&&(!options.displayClear||options.displayClear(p,slot,ctx));
 const free=(preferred:Point,slot:Slot,profile:SpeciesProfile,ctx:Context,others:readonly AnimalState[],minimum=0)=>{
  if(!options.displayClear)return freePoint(preferred,slot,profile,ctx,others,minimum);
  const player={x:ctx.player.x+ctx.player.w/2,y:ctx.player.y+ctx.player.h/2};
  return [preferred,...candidates(slot)].filter(p=>Math.hypot(p.x-preferred.x,p.y-preferred.y)<=96).sort((a,b)=>Math.hypot(a.x-preferred.x,a.y-preferred.y)-Math.hypot(b.x-preferred.x,b.y-preferred.y)).find(p=>clear(p,slot,profile,ctx,others)&&Math.hypot(p.x-player.x,p.y-player.y)>=minimum);
 };
 if(new Set(defs.map(a=>a.id)).size!==defs.length)throw Error('DUPLICATE_ANIMAL_ID');
 const states=new Map(defs.map(a=>[a.id,initial(a)])),greeted=new Set<string>();let signature='',lastMinutes=-1,visitScene='';
 const reconcile=(ctx:Context)=>{
  if(visitScene!==ctx.scene){visitScene=ctx.scene;greeted.clear()}
  periodAt(ctx.townMinutes);const nextSignature=ctx.scene+':'+ctx.townMinutes+':'+JSON.stringify(ctx.animalSlots??{});
  // First lazy activation may replace an ordinary old58 slot. Preserve its
  // actual visible foot too, rather than resetting a walking cat to spawn.
  // A cat's existing attention duration is foreground elapsed time. A matching
  // adjacent-minute confirmation must not erase the remaining greeting/call.
  if(nextSignature===signature)return;const preserve=new Set(defs.filter(a=>{const state=states.get(a.id)!,slot=contextSlot(a,ctx);return state.visible&&state.scene===ctx.scene&&slot?.scene===ctx.scene&&(options.preserveVisibleSlot&&JSON.stringify(state.slot)===JSON.stringify(slot)||a.species==='cat'&&(!!slot.shelter&&lastMinutes>=0&&periodAt(lastMinutes)===periodAt(ctx.townMinutes)||state.attention>0&&lastMinutes>=0&&ctx.townMinutes===lastMinutes+1&&periodAt(lastMinutes)===periodAt(ctx.townMinutes)&&JSON.stringify(state.slot)===JSON.stringify(slot)))}).map(a=>a.id));signature=nextSignature;lastMinutes=ctx.townMinutes;
  // Hide first so old-scene bodies cannot reserve space in a new scene.
  for(const state of states.values()){if(preserve.has(state.id))continue;state.visible=false;state.route=[];state.elevation=0;state.attention=0;state.cooldown=0;state.flightDistance=0;state.wingTime=0;state.distance=0;state.wait=0;state.waypoint=0}
  for(const def of defs){const state=states.get(def.id)!,slot=contextSlot(def,ctx),oldActivity=state.slot?.activity;state.scene=slot?.scene??null;state.slot=slot;if(preserve.has(def.id)){if(oldActivity!==slot?.activity){state.route=[];state.wait=0;state.pose='stand'}continue}state.phase='hidden';state.pose='stand';state.reason=slot?'other-scene':'schedule-away';if(!slot||slot.scene!==ctx.scene)continue;
   const offset=defs.indexOf(def)%slot.points.length,preferred=slot.shelter?.homePoint??slot.points[offset];
   const foot=free(preferred,slot,effective[def.species],ctx,[...states.values()].filter(a=>a.id!==def.id));
   if(!foot){state.reason='no-safe-position';continue}state.foot={...foot};state.waypoint=offset;state.visible=true;state.reason=undefined;state.phase=slot.activity==='sleep'?'sleep':slot.activity==='sun-rest'?'sun-rest':'idle';state.pose=state.phase==='sleep'?'sleep':state.phase==='sun-rest'?'sun-rest':'stand';
  }
 };
 const tick=(dt:number,ctx:Context)=>{
  if(!Number.isFinite(dt)||dt<0)throw Error('INVALID_FRAME_TIME');reconcile(ctx);
  // Same frame budget as the existing renderer; no background catch-up.
  dt=ctx.paused?0:Math.min(dt,.04);
  for(const def of defs){const s=states.get(def.id)!,slot=s.slot;if(!slot||slot.scene!==ctx.scene)continue;const profile=effective[def.species],others=[...states.values()].filter(a=>a.id!==s.id);
   if(!s.visible){const q=free(slot.points[s.waypoint%slot.points.length],slot,profile,ctx,others);if(!q)continue;s.foot={...q};s.visible=true;s.reason=undefined}
   // Old saves / newly present residents can overlap the animal. Move only it.
   if(!clear(s.foot,slot,profile,ctx,others)){
    // Native dog: pause at its existing valid ground foot while a player or
    // resident occupies the display gap. Retry ordinary speed-limited follow
    // once that space clears; never jump to a newly selected nearby point.
    if(options.holdOccupied){s.route=[];s.elevation=0;s.phase='idle';s.pose='stand';s.reason='space-occupied';if(!terrainClear(s.foot,slot,profile,ctx)){s.visible=false;s.phase='hidden';s.reason='no-safe-position'}continue}
    const q=free(s.foot,slot,profile,ctx,others);if(!q){s.visible=false;s.phase='hidden';s.reason='no-safe-position';s.route=[];s.elevation=0;continue}s.foot={...q};s.route=[];s.elevation=0;s.flightDistance=0;s.distance=0
   }
   // Dog ownership is observed even while a panel pauses the scene. Never
   // chase a missing/outpaced resident, or silently follow the player.
   if(def.species==='dog'&&slot.activity==='follow'){
    const owner=def.ownerId?ctx.people[def.ownerId]:undefined;
    const reason=!owner||owner.scene!==slot.scene||!finitePoint(owner.foot)?'owner-away':Math.hypot(owner.foot.x-s.foot.x,owner.foot.y-s.foot.y)>profile.followMax?'owner-outpaced':undefined;
    if(reason){s.phase='idle';s.pose='stand';s.route=[];s.reason=reason;continue}
    s.reason=undefined;
   }
   if(!dt){if(def.species==='dog'){s.phase='idle';s.pose='stand';s.route=[]}continue}
   s.cooldown=Math.max(0,s.cooldown-dt);s.attention=Math.max(0,s.attention-dt);s.wait=Math.max(0,s.wait-dt);
   const player={x:ctx.player.x+ctx.player.w/2,y:ctx.player.y+ctx.player.h/2},near=Math.hypot(player.x-s.foot.x,player.y-s.foot.y);
   // Recognition uses saved familiarity, but never adds proof/save fields or
   // interrupts sunning/sleep/shelter. One pause per approach; distance hysteresis
   // prevents jitter from retriggering it. No movement, reward or player following.
   if(def.species==='cat'){
    if(near>familiarCatGreeting.rearmDistance)greeted.delete(def.id);
    const familiarity=ctx.catFamiliarities?.[def.id]??0;
    if(slot.activity==='wander'&&Number.isSafeInteger(familiarity)&&familiarity>=familiarCatGreeting.minimum&&familiarity<=3&&near<=familiarCatGreeting.distance&&!greeted.has(def.id)&&s.attention===0){
     greeted.add(def.id);s.attention=familiarCatGreeting.seconds;s.route=[];
    }
   }
   if(s.attention>0){s.phase='attention';s.pose='stand';s.direction=face(s.foot,player,s.direction);s.route=[];continue}
   if(slot.shelter){
    const r=slot.shelter.homeRegion,b={x:s.foot.x-profile.collision.w/2,y:s.foot.y-profile.collision.h,w:profile.collision.w,h:profile.collision.h},home=b.x>=r.x&&b.y>=r.y&&b.x+b.w<=r.x+r.w&&b.y+b.h<=r.y+r.h;
    const target=slot.activity==='shelter'?slot.shelter.point:!home?slot.shelter.homePoint:undefined;
    if(target){
     if(Math.hypot(s.foot.x-target.x,s.foot.y-target.y)<.1){s.phase='idle';s.pose='stand';s.route=[];s.reason=slot.activity==='shelter'?'rain-shelter':undefined;continue}
     // The parking foot itself must be clear. Never substitute an uncovered
     // nearby point and call it shelter; blocked routes wait at a safe foot.
     if(!s.route.length)s.route=clear(target,slot,profile,ctx,others)?animalPath(s.foot,target,slot,profile,ctx,others):[];
     if(!s.route.length){s.phase='idle';s.pose='stand';s.reason='shelter-route-blocked';continue}
     const previous=s.foot,result=advanceRoute(s.foot,s.route,profile.speed*dt,q=>clear(q,slot,profile,ctx,others));s.foot=result.position;s.route.splice(0,result.consumed);s.distance+=result.distance;s.direction=face(previous,s.foot,s.direction);s.phase=result.distance>0?'walk':'idle';s.pose=result.distance>0?(['walkA','stand','walkB','stand'] as Pose[])[Math.floor(s.distance/profile.stride*4)%4]:'stand';s.reason=result.blocked?'shelter-route-blocked':result.arrived&&slot.activity==='shelter'?'rain-shelter':undefined;if(result.blocked||result.arrived)s.route=[];continue;
    }
   }
   if(slot.activity==='sleep'){s.phase='sleep';s.pose='sleep';s.route=[];s.elevation=0;continue}
   if(def.species==='gull'&&near<profile.retreatDistance&&s.cooldown===0&&s.phase!=='flight'){
    const desired=free({x:s.foot.x+(s.foot.x-player.x),y:s.foot.y+(s.foot.y-player.y)},slot,profile,ctx,others,profile.landingDistance);
    const route=desired?animalPath(s.foot,desired,slot,profile,ctx,others):[];
    if(route.length){s.route=route;s.flightTotal=route.reduce((n,p,i)=>n+Math.hypot(p.x-(route[i-1]??s.foot).x,p.y-(route[i-1]??s.foot).y),0);s.flightDistance=0;s.wingTime=0;s.phase='flight';}
    else{s.phase='idle';s.pose='stand';s.cooldown=profile.cooldown;s.reason='no-safe-retreat';}
   }
   if(s.phase==='flight'){
    const result=advanceRoute(s.foot,s.route,profile.flightSpeed*dt,q=>clear(q,slot,profile,ctx,others));const before=s.foot;s.foot=result.position;s.route.splice(0,result.consumed);s.direction=face(before,s.foot,s.direction);s.flightDistance+=result.distance;s.wingTime+=dt;s.elevation=profile.flightHeight*Math.sin(Math.PI*Math.min(1,s.flightDistance/Math.max(.001,s.flightTotal)));s.pose=(Math.floor(s.wingTime*profile.wingHz*2)%2?'wing-down':'wing-up');
    if(result.arrived||result.blocked){s.phase='idle';s.pose='stand';s.route=[];s.elevation=0;s.cooldown=profile.cooldown;s.wait=1;s.reason=result.blocked?'retreat-blocked':undefined}continue;
   }
   if(slot.activity==='sun-rest'){s.phase='sun-rest';s.pose='sun-rest';s.route=[];continue}
   // An owner leaving the scene is observed immediately, including during rests.
   if(slot.activity==='follow'){
    const owner=def.ownerId?ctx.people[def.ownerId]:undefined;
    if(!owner||owner.scene!==slot.scene||!finitePoint(owner.foot)){s.phase='idle';s.pose='stand';s.route=[];s.reason='owner-away';continue}
   }
   if(s.wait>0){s.phase='idle';s.pose='stand';continue}
   let target:Point|undefined;
   if(slot.activity==='follow'){
    const owner=def.ownerId?ctx.people[def.ownerId]:undefined;
    if(!owner||owner.scene!==slot.scene||!finitePoint(owner.foot)){s.phase='idle';s.pose='stand';s.route=[];s.reason='owner-away';continue}
    const d=Math.hypot(owner.foot.x-s.foot.x,owner.foot.y-s.foot.y);if(d<=profile.followStop){s.phase='idle';s.pose='stand';s.route=[];continue}
    target=free({x:owner.foot.x+(s.foot.x-owner.foot.x)/d*profile.followStop,y:owner.foot.y+(s.foot.y-owner.foot.y)/d*profile.followStop},slot,profile,ctx,others);s.phase='follow';s.reason=d>profile.followMax?'owner-outpaced':undefined;
    // Repath only if owner moved far enough to invalidate the existing end point.
    if(target&&s.route.length&&Math.hypot(s.route.at(-1)!.x-target.x,s.route.at(-1)!.y-target.y)>12)s.route=[];
   }else{target=slot.points[(s.waypoint+1)%slot.points.length];s.phase='walk'}
   if(!s.route.length){const safe=target?free(target,slot,profile,ctx,others):undefined;s.route=safe?animalPath(s.foot,safe,slot,profile,ctx,others):[]}
   if(!s.route.length){s.phase='idle';s.pose='stand';s.wait=.5;continue}
   const before=s.foot,result=advanceRoute(s.foot,s.route,profile.speed*dt,q=>clear(q,slot,profile,ctx,others));s.foot=result.position;s.route.splice(0,result.consumed);s.distance+=result.distance;s.direction=face(before,s.foot,s.direction);
   s.pose=result.distance>1e-7?(['walkA','stand','walkB','stand'] as Pose[])[Math.floor(s.distance/profile.stride*4)%4]:'stand';
   if(result.arrived||result.blocked){s.route=[];s.phase='idle';s.pose='stand';s.wait=result.blocked?.5:1.5;s.waypoint=(s.waypoint+1)%slot.points.length}
  }
  return snapshot();
 };
 const snapshot=()=>structuredClone([...states.values()]);
 return {tick,snapshot,reconcile,reset:()=>{signature='';lastMinutes=-1;visitScene='';greeted.clear();for(const def of defs)states.set(def.id,initial(def))},react:(id:string,verb:'call'|'pet',ctx:Context)=>{reconcile(ctx);const s=states.get(id);if(!s?.visible||s.species!=='cat'||s.slot?.activity==='sleep')return false;greeted.add(id);s.attention=verb==='call'?2:1.2;s.phase='attention';s.pose='stand';s.direction=face(s.foot,{x:ctx.player.x+ctx.player.w/2,y:ctx.player.y+ctx.player.h/2},s.direction);s.route=[];return true},committedMinute:()=>lastMinutes};
}
