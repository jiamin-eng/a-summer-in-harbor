import {rainCatShelterActive} from '../src/weather/animal-shelter';
import {createLifePlantsB2,createPlantsRegistry} from './life-plants-b2';
import type {createRuntime} from './runtime';
import {AnimalContentRegistry,sameAnimalRef,canonical,contentHash} from './animal-content';
import type {AnimalCommand,AnimalLifeSave,AnimalNotebook,AnimalSample} from '../src/animal-life/types';
import {observationId} from '../src/animal-life/types';
import {currentAnimalSample} from '../src/animal-life/presentation';
import type {Action} from '../src/story/state';
import {acceptedAnimals} from '../src/animals/art';
import {createAnimalRuntime} from '../src/animals/behavior';
import {gameAnimalContext} from '../src/animals/game';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {landWorld} from '../src/life/land';
import {pinLegacy,assertLifeReadable} from '../src/life/save';
import {applyLife} from '../src/life/rules';
import {presentEntity,observedActor} from '../src/world/residents';
import {rooms} from '../src/world/data';
import {battleLocksWorld} from '../src/story/turn-battle';
import type {Point} from '../src/engine/world';

const now=(s:AnimalLifeSave)=>s.townMinutes??540;
const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const record=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
const source=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(v);
const point=(v:any)=>record(v)&&Object.keys(v).sort().join(',')==='x,y'&&Number.isFinite(v.x)&&Number.isFinite(v.y);
const notebook=(s:AnimalLifeSave):AnimalNotebook=>s.animalNotebookV1??{schema:1,briefs:[],pages:[]};
/** A server-owned deterministic sampler. No pose, behavior, foot or proof is
 * accepted from the action payload. This frame is also the renderer input. */
export function sampleAnimal(s:AnimalLifeSave,target:string,p:Point){
 // Immutable old sample proofs keep their original frame contract. New rain
 // shelter is not a sun-rest observation; live sampling rejects it separately.
 const engine=createAnimalRuntime(acceptedAnimals),ctx=gameAnimalContext(s,p,{world:landWorld(dynamicWorld(s.flags,false),s.landV1),paused:true,weatherShelter:false});
 const frame=engine.tick(0,ctx).find(a=>a.id===target);
 if(!frame?.visible||frame.scene!==s.scene)throw Error('ANIMAL_AWAY');
 const behavior=frame.species==='gull'?'shore-space':frame.phase==='sun-rest'?'sun-rest':frame.phase==='sleep'?'sleep':undefined;
 if(!behavior)throw Error('OBSERVATION_NOT_AVAILABLE');
 const distance=Math.hypot(p.x+8-frame.foot.x,p.y+6-frame.foot.y);
 if(behavior==='shore-space'&&distance<72)throw Error('LEAVE_GULL_SPACE');
 if(distance>(behavior==='shore-space'?112:64))throw Error('TOO_FAR');
 return {frame,behavior} as const;
}
export function assertAnimalNotebook(s:AnimalLifeSave,content:AnimalContentRegistry){
 const n=s.animalNotebookV1;if(n===undefined)return;
 const bad=()=>{throw Error('UNSUPPORTED_ANIMAL_NOTEBOOK')};
 if(!record(n)||n.schema!==1||Object.keys(n).some(k=>!['schema','sample','briefs','active','pages','adopted'].includes(k))||!Array.isArray(n.briefs)||!Array.isArray(n.pages)||n.briefs.length>16||n.pages.length>16)bad();
 if(n.adopted!==undefined){if(!Array.isArray(n.adopted)||n.adopted.length>4)bad();const adoptedIds=new Set<string>();for(const e of n.adopted){if(!e||Object.keys(e).sort().join(',')!=='artifactHash,definition,ref'||!/^[a-f0-9]{64}$/.test(e.artifactHash)||adoptedIds.has(e.ref?.id))bad();if(contentHash(content.get(e.ref))!==contentHash(e.definition))bad();adoptedIds.add(e.ref.id)}}
 const ids=new Set<string>();for(const ref of n.briefs){content.get(ref);const k=canonical(ref);if(ids.has(k))bad();ids.add(k)}
 const pages=new Set<string>();for(const page of n.pages){if(!record(page)||Object.keys(page).sort().join(',')!=='minute,ref,sourceAction'||!source(page.sourceAction)||!int(page.minute,0,now(s)))bad();content.get(page.ref);if(pages.has(page.ref.id))bad();pages.add(page.ref.id)}
 if(n.active){const a=n.active;if(!record(a)||Object.keys(a).sort().join(',')!=='minute,ref,sourceAction'||!source(a.sourceAction)||!int(a.minute,0,now(s))||!n.briefs.some(r=>sameAnimalRef(r,a.ref))||pages.has(a.ref.id))bad();content.get(a.ref)}
 if(n.sample){const a=n.sample;if(!record(a)||Object.keys(a).sort().join(',')!=='behavior,frame,minute,player,scene,sourceAction,version'||!source(a.sourceAction)||!int(a.version,0,s.version)||!int(a.minute,0,now(s))||!point(a.player)||!rooms[a.scene]||!record(a.frame))bad();
  const projected={...s,scene:a.scene,townMinutes:a.minute};try{const derived=sampleAnimal(projected,a.frame.id,a.player);if(canonical(derived.frame)!==canonical(a.frame)||derived.behavior!==a.behavior)bad()}catch{bad()}
 }
 content.assertSavedContinuity(s);
}
export function parseAnimalCommand(a:Action):AnimalCommand{
 const p=a.payload as any,c=p?.command;
 if(!record(p)||Object.keys(p).join(',')!=='command'||!record(c)||!['sample','record','brief','accept','share','cancel'].includes(c.verb)||a.action!=='animal-life:'+c.verb||Object.keys(c).sort().join(',')!==(['sample','record'].includes(c.verb)?'verb':'ref,verb'))throw Error('INVALID_ANIMAL_COMMAND');
 return structuredClone(c);
}
function residentAdmission(s:AnimalLifeSave,a:Action,resident:string){
 if(!s.known.includes(resident))throw Error('INTRODUCE_FIRST');
 const e=rooms[s.scene].entities.find(e=>e.person===resident&&e.id===a.target);if(!e||!presentEntity(s,e))throw Error('PERSON_AWAY');
 const foot=observedActor(e,a.actorPosition);if(!foot||Math.hypot(a.position.x+8-foot.x,a.position.y+6-foot.y)>75)throw Error('TOO_FAR');
}
export function createAnimalLife(base:ReturnType<typeof createRuntime>,content=new AnimalContentRegistry(),plantStarts=true){
 const plants=createLifePlantsB2(base,plantStarts),crops=createPlantsRegistry();
 const runtime={...plants.runtime,
  assertReadable(s:AnimalLifeSave){plants.runtime.assertReadable(s);assertAnimalNotebook(s,content)},
  validateAction(a:Action){plants.runtime.validateAction(a);if(a.action.startsWith('animal-life:'))parseAnimalCommand(a)},
  async prepare(previous:AnimalLifeSave,a:Action,cancel?:unknown,context?:{owner:string}){
   assertAnimalNotebook(previous,content);
   if(!a.action.startsWith('animal-life:')){
    const r=await plants.runtime.prepare(previous,a,cancel,context),head=r.head as AnimalLifeSave;
    if(head.animalNotebookV1?.sample)delete head.animalNotebookV1.sample;
    return {...r,head};
   }
   plants.runtime.position(previous,a.position);assertLifeReadable(previous,crops);
   if(previous.scene!==a.scene)throw Error('SCENE_MISMATCH');if(previous.version!==a.expected_version)throw Error('VERSION_CONFLICT');
   if(!source(a.action_id))throw Error('INVALID_ACTION_ID');if(previous.activeChallenge||battleLocksWorld(previous))throw Error('CHALLENGE_ACTIVE');
   const c=parseAnimalCommand(a);let head:AnimalLifeSave=structuredClone(previous),text:[string,string],person:string|undefined;
   head.animalNotebookV1=structuredClone(notebook(previous));const n=head.animalNotebookV1;
   if(c.verb==='sample'){
    if(rainCatShelterActive(head,a.target))throw Error('OBSERVATION_NOT_AVAILABLE');
    const v=sampleAnimal(head,a.target,a.position);n.sample={...v,sourceAction:a.action_id,version:head.version+1,scene:head.scene,minute:now(head),player:{...a.position}};
    text=v.behavior==='shore-space'?['你留出一点距离。海鸥仍有自己的空间，可以记下这次观察。','You leave room for the gull. You can record this quiet observation.']:v.behavior==='sleep'?['它蜷着睡觉。没有叫醒它，可以把这一刻记下来。','It is curled up asleep. You let it rest; this moment can go in your notebook.']:['它在阳光里安静待着。可以把这一刻记下来。','It rests in the sunlight. This moment can go in your notebook.'];
   }else if(c.verb==='record'){
    const q=n.sample;if(!q||q.version!==previous.version||q.scene!==head.scene||q.minute!==now(head)||q.frame.id!==a.target||Math.hypot(a.position.x-q.player.x,a.position.y-q.player.y)>2)throw Error('OBSERVATION_STALE');
    const v=sampleAnimal(head,a.target,a.position);if(v.behavior!==q.behavior||canonical(v.frame)!==canonical(q.frame))throw Error('OBSERVATION_STALE');
    if(q.behavior!=='shore-space'){
     head=applyLife(head,{actionId:a.action_id,expectedVersion:head.version,command:{verb:'observe-animal',animal:a.target,behavior:q.behavior}},crops,{scene:head.scene,target:a.target,animal:{id:a.target,behavior:q.behavior,visualVersion:q.frame.visualVersion}}).head;
    }else{
     head=pinLegacy(head,crops);const collections=head.lifeV1!.collections,id=observationId(a.target,q.behavior);if(!collections[id]){if(Object.keys(collections).length>=64)throw Error('COLLECTION_CAPACITY');collections[id]={id,sourceAction:a.action_id,minute:now(head),source:{kind:'animal-schedule',id:a.target,visualVersion:q.frame.visualVersion}};}
    }
    delete head.animalNotebookV1!.sample;text=['观察已登记。它是一个发现，不是行囊里的动物或物品。','Recorded. This is a discovery, not an animal or item in your bag.'];
   }else{
    const def=content.get(c.ref);if(c.verb!=='cancel'){residentAdmission(head,a,def.resident);person=def.resident;}
    if(c.verb==='brief'){
     if(!content.canStart(c.ref,head))throw Error('ANIMAL_CONTENT_CLOSED');if(!n.briefs.some(r=>sameAnimalRef(r,c.ref))){if(n.briefs.length>=16)throw Error('ANIMAL_NOTEBOOK_CAPACITY');n.briefs.push({...c.ref})}text=[...def.brief];
    }else if(c.verb==='accept'){
     if(!content.canStart(c.ref,head))throw Error('ANIMAL_CONTENT_CLOSED');if(!n.briefs.some(r=>sameAnimalRef(r,c.ref)))throw Error('COMMISSION_PREMISE_UNREAD');if(n.active||n.pages.some(p=>p.ref.id===c.ref.id))throw Error('COMMISSION_UNAVAILABLE');
     n.active={ref:{...c.ref},sourceAction:a.action_id,minute:now(head)};text=['这份观察约定已记下。你也可以先做别的事，没有期限。','Your observation plan is saved. There is no deadline; other things can come first.'];
    }else if(c.verb==='cancel'){
     if(a.target!=='animal-notebook'||!n.active||!sameAnimalRef(n.active.ref,c.ref))throw Error('COMMISSION_MISMATCH');delete n.active;text=['约定已收起，已经发现的日常仍在收藏里。','The plan is set aside. Your observations remain in Collections.'];
    }else{
     if(!n.active||!sameAnimalRef(n.active.ref,c.ref))throw Error('COMMISSION_MISMATCH');if(!def.requirements.every(r=>(head as any).lifeV1?.collections[observationId(r.animal,r.behavior)]))throw Error('OBSERVATIONS_MISSING');
     if(n.pages.length>=16)throw Error('ANIMAL_NOTEBOOK_CAPACITY');if((head.relations[def.resident]??0)>=100)throw Error('RELATION_FULL');
     n.pages.push({ref:{...c.ref},minute:now(head),sourceAction:a.action_id});delete n.active;head.relations[def.resident]=(head.relations[def.resident]??0)+1;text=[...def.page];
    }
    delete n.sample;
   }
   head.position={...a.position};head.version=previous.version+1;head.cursor=previous.cursor+1;
   head.history.push({id:a.action_id,kind:person?'talk':'action',...(person?{person}:{}),text});head.history=head.history.slice(-500);
   this.assertReadable(head);return {head,text,kind:a.action,accepted:true,actionId:a.action};
  },
 };
 const animalProject=(s:AnimalLifeSave)=>{
  assertAnimalNotebook(s,content);const n=notebook(s);
  return {schema:1 as const,snapshotVersion:s.version,commissions:content.list().filter(e=>s.known.includes(e.definition.resident)&&content.isVisible(e.ref,s)).map(e=>({...e,...(content.continuation(e.ref)?{continuation:content.continuation(e.ref)!}:{}),enabled:content.canStart(e.ref,s),briefed:n.briefs.some(r=>sameAnimalRef(r,e.ref)),completed:n.pages.some(p=>p.ref.id===e.ref.id),active:!!n.active&&sameAnimalRef(n.active.ref,e.ref),missing:e.definition.requirements.filter(r=>!(s as any).lifeV1?.collections[observationId(r.animal,r.behavior)])})),pages:n.pages.map(p=>({...p,title:content.get(p.ref).title,text:content.get(p.ref).page})),sample:currentAnimalSample(s)??null};
 };
 return {...plants,runtime,animalProject,lifeProject:(s:AnimalLifeSave)=>({...plants.lifeProject(s),animals:animalProject(s)})};
}
