import {createHash} from 'node:crypto';
import type {AnimalCommission,AnimalRef,AnimalLifeSave,Observation} from '../src/animal-life/types';
import {acceptedAnimals} from '../src/animals/art';
import {slotAt} from '../src/animals/behavior';
import {animalContractLimits,animalIdSchema,contractViolations} from './animal-contract-schema';
import type {Words} from '../src/world/data';
import courtyardSunTurns from './content/authored-courtyard-sun-turns.json';

export const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export const contentHash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export const sameAnimalRef=(a:AnimalRef,b:AnimalRef)=>canonical(a)===canonical(b);
export const builtInCommissions:AnimalCommission[]=[
 {schema:1,id:'animals:station-cat',revision:1,capability:'animal-notebook-v1',resident:'mara',title:['车站猫的一天','A day with the station cat'],brief:['“别叫醒它。上午在车站看它晒太阳，夜里去庭院看看它睡在哪儿，再回来讲给我听。没有期限。”','“Let it rest. Watch it sunning on Station Street in the morning and sleeping in the courtyard at night, then tell me. No deadline.”'],page:['我与Mara交换了车站猫的两种日常。它有自己的作息，不需要跟着我。','Mara and I compared two moments in the station cat’s day. It has its own routine; it needn’t follow me.'],requirements:[{animal:'harbor-cat-1',behavior:'sun-rest'},{animal:'harbor-cat-1',behavior:'sleep'}]},
 {schema:1,id:'animals:shore-space',revision:1,capability:'animal-notebook-v1',resident:'ruth',title:['给岸边的海鸥留点空间','Room for the shore gulls'],brief:['“找两只不同的海鸥，退开一点，静静看。不要用食物引它们。愿意的话，回来讲讲。没有期限。”','“Find two different gulls, leave them some space, and watch quietly. Don’t lure them with food. Tell me if you like. No deadline.”'],page:['我与Ruth留下一页岸边笔记：看见两只海鸥，也学会不追着它们走。','Ruth and I kept a shore note: two gulls observed, with room left for them to move.'],requirements:[{animal:'harbor-gull-1',behavior:'shore-space'},{animal:'harbor-gull-2',behavior:'shore-space'}]},
 // Locally authored fixed story, not a Game Chat proposal or model-reviewed pack.
 // It uses only existing cat schedules and the original knowledge/+1 contract.
 courtyardSunTurns as AnimalCommission,
];
export function validateCommission(v:unknown):asserts v is AnimalCommission{
 const d=v as AnimalCommission;
 if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).sort().join(',')!=='brief,capability,id,page,requirements,resident,revision,schema,title')throw Error('ANIMAL_CONTENT_FIELDS');
 if(d.schema!==1||contractViolations(d.id,animalIdSchema).length||!Number.isSafeInteger(d.revision)||d.revision<1||d.revision>100||d.capability!=='animal-notebook-v1'||!['mara','ruth','owen','dani'].includes(d.resident))throw Error('ANIMAL_CAPABILITY_UNAVAILABLE');
 for(const [k,max] of Object.entries(animalContractLimits.compiledTextCodeUnits) as [keyof typeof animalContractLimits.compiledTextCodeUnits,number][]){const w=d[k];if(!Array.isArray(w)||w.length!==2||w.some(t=>typeof t!=='string'||!t.trim()||t.length>max||/[<>]|https?:|javascript:|\b(eval|fetch|script)\s*\(/i.test(t)))throw Error('ANIMAL_TEXT');}
 if(!Array.isArray(d.requirements)||d.requirements.length<animalContractLimits.minimumObservations||d.requirements.length>animalContractLimits.maximumObservations)throw Error('ANIMAL_REQUIREMENTS');
 const identities=new Set<string>();
 for(const r of d.requirements){
  if(!r||Object.keys(r).sort().join(',')!=='animal,behavior')throw Error('ANIMAL_REQUIREMENTS');
  const a=acceptedAnimals.find(a=>a.id===r.animal),key=r.animal+':'+r.behavior;
  if(!a||identities.has(key))throw Error('ANIMAL_REQUIREMENTS');identities.add(key);
  if(r.behavior==='shore-space'){if(a.species!=='gull')throw Error('ANIMAL_BEHAVIOR_UNAVAILABLE')}
  else if(!(['sun-rest','sleep'] as Observation[]).includes(r.behavior)||a.species!=='cat'||![540,780,1080,1300].some(m=>slotAt(a,m)?.activity===r.behavior))throw Error('ANIMAL_BEHAVIOR_UNAVAILABLE');
 }
}
const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
export class AnimalContentRegistry{
 private readonly entries=new Map<string,{ref:AnimalRef;definition:AnimalCommission}>();
 private readonly enabled:Set<string>;
 private readonly prerequisites:Readonly<Record<string,AnimalRef>>;
 private readonly bridges:Readonly<Record<string,Words>>;
 constructor(defs:AnimalCommission[]=builtInCommissions,enabled=defs.map(d=>d.id+'@'+d.revision),prerequisites:Readonly<Record<string,AnimalRef>>={},bridges:Readonly<Record<string,Words>>={}){
  this.enabled=new Set(enabled);for(const d of defs){validateCommission(d);const key=d.id+'@'+d.revision,hash=contentHash(d),old=this.entries.get(key);if(old&&old.ref.hash!==hash)throw Error('ANIMAL_REVISION_CONFLICT');this.entries.set(key,freeze({ref:{id:d.id,revision:d.revision,hash,capability:d.capability},definition:structuredClone(d)}));}
  for(const [key,required] of Object.entries(prerequisites)){
   const target=this.entries.get(key),source=this.entries.get(required.id+'@'+required.revision);
   if(!target||!source||key===required.id+'@'+required.revision||!sameAnimalRef(source.ref,required))throw Error('ANIMAL_STORY_PREREQUISITE_INVALID');
  }
  for(const [key,words] of Object.entries(bridges))if(!prerequisites[key]||!Array.isArray(words)||words.length!==2||words.some(w=>typeof w!=='string'||!w.trim()||w.length>200||/[<>]/.test(w)))throw Error('ANIMAL_STORY_BRIDGE_INVALID');
  this.prerequisites=structuredClone(prerequisites);
  this.bridges=structuredClone(bridges);
 }
 ref(id:string,revision=1){const e=this.entries.get(id+'@'+revision);if(!e)throw Error('ANIMAL_CONTENT_UNKNOWN');return {...e.ref}}
 get(ref:AnimalRef){if(!ref||Object.keys(ref).sort().join(',')!=='capability,hash,id,revision')throw Error('ANIMAL_REF_MISMATCH');const e=this.entries.get(ref.id+'@'+ref.revision);if(!e||!sameAnimalRef(e.ref,ref))throw Error('ANIMAL_REF_MISMATCH');return e.definition}
 isVisible(ref:AnimalRef,s?:AnimalLifeSave){this.get(ref);const required=this.prerequisites[ref.id+'@'+ref.revision];return !required||!!s?.animalNotebookV1?.pages.some(p=>sameAnimalRef(p.ref,required))}
 canStart(ref:AnimalRef,s?:AnimalLifeSave){return this.isVisible(ref,s)&&this.enabled.has(ref.id+'@'+ref.revision)}
 continuation(ref:AnimalRef){this.get(ref);const words=this.bridges[ref.id+'@'+ref.revision];return words?[...words] as Words:null}
 assertSavedContinuity(s:AnimalLifeSave){
  const pages=s.animalNotebookV1?.pages??[];
  for(const [key,required] of Object.entries(this.prerequisites)){
   const index=pages.findIndex(p=>p.ref.id+'@'+p.ref.revision===key);
   if(index>=0&&!pages.slice(0,index).some(p=>sameAnimalRef(p.ref,required)))throw Error('ANIMAL_STORY_SEQUENCE_INVALID');
   const active=s.animalNotebookV1?.active;
   if(active&&active.ref.id+'@'+active.ref.revision===key&&!pages.some(p=>sameAnimalRef(p.ref,required)))throw Error('ANIMAL_STORY_SEQUENCE_INVALID');
  }
 }
 list(){return [...this.entries.values()].map(e=>({ref:{...e.ref},definition:structuredClone(e.definition)}))}
}
