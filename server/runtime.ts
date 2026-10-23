import {validNeighborChapter} from '../src/story/neighbor-chapter';
import {validPriestState} from '../src/story/chapel-priest';
import {validChapelState} from '../src/story/chapel';
import {townMinutes} from '../src/world/residents';
import {commitPlayerSociety,collectPlayerReturns,notePlayerMove,recordPlayerTalk} from './npc-chat';
import {keepNewerNpcLoop} from './npc-clock';
import type {DayFacts,DayReflection,NpcView} from '../src/npc/town';
import {validRelationshipGrowth} from '../src/story/relationship-growth';
import {validClock,createMovingClock} from './candidate-clock';
import {validNomadMemory} from '../src/story/tech-nomads';
import {nomadDeferral} from '../src/world/tech-nomads';
import {validAnimalSave} from '../src/animals/memory';
import {animals} from '../src/animals/config';
import {validTurnBattle} from '../src/story/turn-battle';
// @ts-expect-error game-specific async request context
import {requestContext} from './dynamic-assets/policy.mjs';
import {validNewsState} from '../src/story/news-edition';
import {validPlots} from '../src/story/crops';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {admitSpatialAction,spatialBinding,spatialSnapshot} from '../src/story/binding';
import {initial,applyAction,validateQuestion,type Save,type Action,type DialogueResolution} from '../src/story/state';
import {world,worldWithFlags} from '../src/world/data';import {walkable} from '../src/engine/world';
import type {createFieldNotes} from './fieldnotes';
type Notes=Awaited<ReturnType<typeof createFieldNotes>>;
export const createRuntime=(resolveDialogue?:(s:Save,a:Action,owner:string)=>Promise<DialogueResolution>,notes?:Notes,motion?:ReturnType<typeof createMovingClock>,options:{relationshipClock?:(s:Save)=>number;afterRainResolve?:(s:Save,a:Action,person:string)=>[string,string];npcDecide?:(view:NpcView)=>Promise<import('../src/npc/town').NpcIntent | import('../src/npc/town').NpcIntent[]>;npcConverse?:(speaker:NpcView,listener:NpcView)=>Promise<import('../src/npc/town').PresenceRound[]>;npcNarrate?:(view:NpcView,scene:string)=>Promise<import('../src/npc/town').Words>;npcReview?:(facts:DayFacts)=>Promise<DayReflection>}={})=>({
 initial,upgrade:(s:Save)=>s,scene:(s:Save)=>s.scene,
 assertReadable(s:Save){if(!s||!validNeighborChapter(s)||!validChapelState(s)||!validPriestState(s)||!validClock(s)||!validRelationshipGrowth(s)||!validNomadMemory(s)||!validAnimalSave(s.animalsV1,animals,s.townMinutes??540)||!validTurnBattle(s)||!validNewsState(s)||!validPlots(s)||(s.awakeMinutes!==undefined&&(!Number.isSafeInteger(s.awakeMinutes)||s.awakeMinutes<0))||(s.townMinutes!==undefined&&(!Number.isSafeInteger(s.townMinutes)||s.townMinutes<0))||(s.fernStartedAt!==undefined&&(!Number.isSafeInteger(s.fernStartedAt)||s.fernStartedAt<0||s.fernStartedAt>(s.townMinutes??540)))||s.mapVersion!==1||!s.id||!Number.isSafeInteger(s.version)||!world.scenes[s.scene]||!Array.isArray(s.flags)||!Array.isArray(s.known)||!walkable(dynamicWorld(s.flags,!!requestContext.getStore()?.dynamicGeometry),s.scene,s.position))throw Error('UNSUPPORTED_SAVE')},
 spatialContext(s:Save){if(s.movingClock)throw Error('MOTION_CHECKPOINT_REQUIRED');return s},
 position(s:Save,p:{x:number;y:number}){if(!p||!walkable(dynamicWorld(s.flags,!!requestContext.getStore()?.dynamicGeometry),s.scene,p))throw Error('INVALID_POSITION');return {x:p.x,y:p.y}},
 validateAction(a:Action){if(!a||typeof a.action!=='string'||a.action.length>160||typeof a.target!=='string'||a.target.length>160||!a.position||!Number.isFinite(a.position.x)||!Number.isFinite(a.position.y))throw Error('INVALID_ACTION')},
 async prepare(s:Save,a:Action,_cancel?:unknown,context?:{owner:string}){if(a.action.startsWith('candidate-')){if(!motion)throw Error('CANDIDATE_CLOSED');if(a.action!=='candidate-clock-enable'&&s.movingClock?.transport)throw Error('MOTION_CHANNEL_REQUIRED');return motion(s,a)}if(s.movingClock&&Math.hypot(a.position.x-s.position.x,a.position.y-s.position.y)>4)throw Error('UNVERIFIED_POSITION');if(!walkable(dynamicWorld(s.flags,!!requestContext.getStore()?.dynamicGeometry),s.scene,a.position))throw Error('INVALID_POSITION');const actionWorld=dynamicWorld(s.flags,!!requestContext.getStore()?.dynamicGeometry);
 // Authored weather responses use the existing question admission, after all
 // original movement/world guards. Outer life/time/pending/CAS remain intact.
 if(a.action==='weather-after-rain'){
  if(!options.afterRainResolve)throw Error('AFTER_RAIN_CLOSED');
  const gate={...a,action:'ask',payload:{text:'What changed after the recent rain?'}};
  const bound=admitSpatialAction(s,gate,actionWorld),{person}=validateQuestion(s,gate);
  const text=options.afterRainResolve(s,a,person),head=structuredClone(s);
  head.position={...a.position};head.version++;head.cursor++;
  head.history.push({id:a.action_id,kind:'talk',person,text});head.history=head.history.slice(-500);
  spatialBinding.assertTransition(spatialSnapshot(s),spatialSnapshot(head),bound,s.scene);
  return {head,text,kind:'action',accepted:true,actionId:a.action};
 }
 if(a.action.startsWith('society-')){if(a.expected_version!==s.version)throw Error('VERSION_CONFLICT');if(a.scene!==s.scene||!walkable(actionWorld,s.scene,a.position))throw Error('INVALID_POSITION');const done=commitPlayerSociety(s,a,townMinutes(s));return {head:done.head,text:done.text,kind:'action',accepted:true,actionId:a.action}}
 const boundKey=admitSpatialAction(s,a,actionWorld);if(a.action==='notes-generate'||a.action==='notes-observe'){if(!notes)throw Error('NOTES_UNAVAILABLE');return a.action==='notes-generate'?notes.generate(s,a,context!.owner):notes.observe(s,a,context!.owner)}const question=a.action==='ask'?validateQuestion(s,a):undefined;const defer=question?nomadDeferral(question.person,s):undefined;const resolution=a.action==='ask'&&!defer?(resolveDialogue?await resolveDialogue(s,a,context!.owner):undefined):undefined;const result=applyAction(s,defer?{...a,action:'talk:nomads-v1-defer'}:a,resolution,actionWorld,options.relationshipClock??townMinutes);if((a.action==='travel'||a.action==='travel-map')&&result.head.scene!==s.scene)result.head.npcLoopV1=notePlayerMove(result.head.npcLoopV1??s.npcLoopV1,result.head.scene,townMinutes(result.head));const npcLedger=result.head.npcLoopV1??s.npcLoopV1;if(question&&resolution&&npcLedger){try{const heard=await recordPlayerTalk(npcLedger,question.person,townMinutes(result.head),question.question,result.text);if(heard)result.head.npcLoopV1=heard}catch{/* the reply stands; a missed memory write does not undo it */}}if(defer)result.head.history.at(-1)!.question=question!.question;if(notes&&result.head.scene!==s.scene)await notes.travel(s,result.head,context!.owner);if(a.action!=='travel-map'&&!a.action.startsWith('battle-')&&a.action!=='snack-eat')spatialBinding.assertTransition(spatialSnapshot(s),spatialSnapshot(result.head),boundKey,s.scene);return {...result,kind:'action',accepted:true,actionId:a.action}},
 preserveConcurrent(next:Save,current:Save){keepNewerNpcLoop(next,current);collectPlayerReturns(next);return next},
});
export const runtime=createRuntime();
