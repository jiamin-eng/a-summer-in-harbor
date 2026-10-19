import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AnimalStoryChoice} from '../server/animal-grounding';
import {contentHash} from '../server/animal-content';
import {observationId} from '../src/animal-life/types';
import {sampleAnimal} from '../server/animal-life';
import {rooms} from '../src/world/data';
import {findPath,walkable,type Point} from '../src/engine/world';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {landWorld} from '../src/life/land';
import {acceptedAnimals} from '../src/animals/art';
import {slotAt,periodAt} from '../src/animals/behavior';
import {presentEntity} from '../src/world/residents';
import {motionActionId} from '../src/candidate/clock-types';
import {activePlayActionId} from '../src/candidate/active-play-types';
import {globalPoint,isCluster} from '../src/candidate/continuity';
import {nativeCrabCollision} from '../src/animals/native-crab-game';

/** No transport/model imports. Every change below is an original authority command.
 * The controlled server clock is a local fixture, never injected save progress. */
export async function playStory(authority:any,assembly:any,owner:string,head:any,choice:AnimalStoryChoice,time:{value:number},reuseExisting=false){
 let s=head;const original=structuredClone(s),client=randomUUID(),trace:any[]=[],counts={business:0,motion:0,active:0,observations:0};
 const get=async()=>s=await authority.get(owner,s.id);
 const liveWorld=()=>{const w=landWorld(dynamicWorld(s.flags,false),s.landV1),b=nativeCrabCollision(s);return b.length?{...w,scenes:{...w.scenes,[s.scene]:{...w.scenes[s.scene],obstacles:[...w.scenes[s.scene].obstacles,...b]}}}:w};
 const command=async(action:string,target:string,payload?:any)=>{
  const entity=rooms[s.scene].entities.find(e=>e.id===target),lease=s.activePlayClock?.lease;
  const input={action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target,action,...(payload?{payload}:{}),...(entity?.person?{actorPosition:entity.at}:{}),...(lease?{activePlay:{client,lease:lease.id,activeMs:Math.min(3000,time.value-lease.lastAt)}}:{})};
  const before=s;const result=await authority.action(owner,s.id,input);s=result.head;counts.business++;
  trace.push({actionId:input.action_id,action,target,beforeVersion:before.version,version:s.version,minute:s.townMinutes,scene:s.scene,position:s.position});return {input,result};
 };
 const play=async(kind:string,ms=0)=>{
  time.value+=ms;const last=s.activePlayClock?.transport?.last.ack,lease=s.activePlayClock?.lease,ordinal=(last?.ordinal??0)+1;
  await authority.activePlay(owner,s.id,{action_id:activePlayActionId(s.id,ordinal),expected_version:s.version,scene:s.scene,position:s.position,target:'',action:kind,payload:{client,ordinal,previous:last?.token??'',...(kind==='candidate-active-open'?{}:{lease:lease.id,sequence:lease.sequence+1,activeMs:ms})}});counts.active++;await get();
 };
 const motion=async(kind:string,points:Point[]=[],ms=0)=>{
  time.value+=ms;const last=s.movingClock?.transport?.last.ack,lease=s.movingClock?.lease,ordinal=(last?.ordinal??0)+1;
  const position=kind==='candidate-motion-step'&&points.length?points.at(-1)!:s.position;
  await authority.motion(owner,s.id,{action_id:motionActionId(s.id,ordinal),expected_version:s.version,scene:s.scene,position,target:'',action:kind,payload:{transport:1,ordinal,previous:last?.token??'',...(kind==='candidate-motion-open'?{}:{lease:lease.id,sequence:lease.sequence+1,points:points.map(p=>isCluster(s.scene)?globalPoint(s.scene,p):p)})}});counts.motion++;await get();
 };
 const pause=async()=>{if(s.activePlayClock?.lease)await play('candidate-active-pause')};
 const travel=async(scene:string)=>{await pause();if(s.scene!==scene)await command('travel-map',scene)};
 const walk=async(goal:Point)=>{
  await pause();const path=findPath(liveWorld(),s.scene,s.position,goal);assert.ok(path.length||Math.hypot(s.position.x-goal.x,s.position.y-goal.y)<1,'AUTHORED_ROUTE_REQUIRED');
  await motion('candidate-motion-open');for(const point of path){await motion('candidate-motion-step',[point],250)}
  assert.ok(Math.hypot(s.position.x-goal.x,s.position.y-goal.y)<1,'CONFIRMED_ACTOR_POSITION');
 };
 const waitTo=async(minute:number)=>{
  await travel('home');const bed=rooms.home.entities.find(e=>e.actions?.includes('rest'))!;assert.ok(bed);await walk(bed.approach);
  while(minute-(s.townMinutes??540)>=180)await command('rest',bed.id);
  await play('candidate-active-open');let ticks=0;while((s.townMinutes??540)<minute){assert.ok(++ticks<4000,'BOUNDED_FOREGROUND_FIXTURE');await play('candidate-active-tick',2000)}await pause();
 };
 const representatives={morning:540,afternoon:780,evening:1080,night:1300};
 const ensurePeriod=async(period:AnimalStoryChoice['observations'][number]['period'])=>{
  if(periodAt(s.townMinutes??540)===period)return;
  const now=s.townMinutes??540;let target=Math.floor(now/1440)*1440+representatives[period];if(target<=now)target+=1440;await waitTo(target);
 };
 const resident=async()=>{
  for(let attempt=0;attempt<3;attempt++){
   const found=Object.values(rooms).flatMap(room=>room.entities.filter(e=>e.person===choice.resident&&presentEntity({...s,scene:room.id},e)).map(entity=>({scene:room.id,entity})))[0];
   if(found){await travel(found.scene);if(!presentEntity(s,found.entity))continue;await walk(found.entity.approach);return found.entity;}
   const now=s.townMinutes??540;await waitTo((Math.floor(now/1440)+1)*1440+540);
  }throw Error('RESIDENT_AVAILABLE_WINDOW_REQUIRED');
 };
 const entry=s.animalNotebookV1?.adopted?.find((e:any)=>e.ref.id===choice.id)??assembly.animalProject(s).commissions.find((e:any)=>e.ref.id===choice.id);assert.ok(entry);const ref=entry.ref;
 if(!s.movingClock)await command('candidate-clock-enable','',{millisecondsPerMinute:4000});
 // The ordinary active clock is initialized and paused; movement cannot invent
 // a second time source. Later waits settle confirmed foreground ticks only.
 await play('candidate-active-open');await pause();
 let person=await resident();await command('animal-life:brief',person.id,{command:{verb:'brief',ref}});await command('animal-life:accept',person.id,{command:{verb:'accept',ref}});
 const ordered=[...choice.observations].filter(o=>!reuseExisting||!s.lifeV1?.collections[observationId(o.animal,o.behavior)]).sort((a,b)=>representatives[a.period]-representatives[b.period]);
 for(const o of ordered){
  await ensurePeriod(o.period);await travel(o.scene);assert.equal(periodAt(s.townMinutes),o.period,'REAL_SELECTED_PERIOD');
  const animal=acceptedAnimals.find(a=>a.id===o.animal)!,slot=slotAt(animal,s.townMinutes)!;assert.equal(slot.scene,o.scene);let point:Point|undefined;
  outer:for(const q of slot.points)for(let y=-112;y<=112;y+=4)for(let x=-112;x<=112;x+=4){
   const p={x:q.x+x-8,y:q.y+y-6};if(!walkable(liveWorld(),s.scene,p))continue;
   try{const sample=sampleAnimal(s,o.animal,p);if(sample.behavior!==o.behavior)continue;if(findPath(liveWorld(),s.scene,s.position,p).length){point=p;break outer}}catch{}
  }assert.ok(point,'REACHABLE_AUTHORITY_OBSERVATION_POINT');await walk(point);assert.equal(periodAt(s.townMinutes),o.period);
  const derived=sampleAnimal(s,o.animal,s.position);assert.equal(derived.behavior,o.behavior);assert.equal(derived.frame.scene,o.scene);
  await command('animal-life:sample',o.animal,{command:{verb:'sample'}});assert.equal(s.animalNotebookV1.sample.frame.id,o.animal);
  await command('animal-life:record',o.animal,{command:{verb:'record'}});assert.ok(s.lifeV1.collections['observe:'+o.animal+':'+o.behavior]);counts.observations++;
 }
 person=await resident();const before=structuredClone(s),share=await command('animal-life:share',person.id,{command:{verb:'share',ref}});
 assert.equal(s.relations[choice.resident],(before.relations[choice.resident]??0)+1);assert.deepEqual(s.items,original.items);assert.equal(s.cash,original.cash);
 assert.deepEqual((await authority.action(owner,s.id,share.input)).head,s);assert.equal(s.animalNotebookV1.pages.filter((p:any)=>p.ref.id===choice.id).length,1);
 assert.equal(s.animalNotebookV1.pages.find((p:any)=>p.ref.id===choice.id).ref.hash,contentHash(entry.definition));
 assembly.runtime.assertReadable(s);assert.equal(assembly.lifeProject(s).plantUses.basilEnabled,true);assert.ok(s.nativeCrabV1);
 return {head:s,shareAction:share.input,shareResult:share.result,report:{passed:true,scope:'isolated published authority composition, synthetic server clock and normal commands; no renderer/MiniApp/phone claim',observations:ordered,counts,trace,relationshipReward:1,inventoryUnchanged:true,cashUnchanged:true,pagePinned:true,shareReplayIdempotent:true,nativeCrabRetained:true,basilRetained:true,realAdditionalModelCalls:0}};
}
