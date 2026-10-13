import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {animalChoiceSchema,animalBoundReviewSchema,animalContractLimits,contractViolations,describeContractFields} from '../server/animal-contract-schema';
import {inspectAnimalChoice,parseBoundAnimalReview,assertBoundAnimalReview,AnimalReviewUntrustedError,animalChoiceExample,animalChoiceFieldGuide,animalReviewFieldGuide,isRegisteredAnimalScheduleFact,admittedAnimalObservationFacts,observationFactId,renderAnimalViolation} from '../server/animal-grounded-review';
import {compileAnimalStoryChoice,parseAnimalSemanticReview,type AnimalStoryChoice} from '../server/animal-grounding';
import {createAnimalProposalPipeline,registryForAnimals} from '../server/animal-proposals';
import {AnimalContentRegistry,canonical,contentHash} from '../server/animal-content';
import {makeAssembly,createReadyJourney,owner,worldId,AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from './animal-m3-context';
// @ts-expect-error unchanged durable gateway; pure in-memory fixture transports
import {createModelGateway} from '../vendor/dynamic-runtime/packages/dynamic-pipeline/model-gateway.mjs';

const known=['mara','ruth','owen','dani'];
const choice:AnimalStoryChoice={schema:1,id:'animals:separate-routines-v5',revision:1,resident:'dani',theme:'compare-routines',observations:[
 {animal:'harbor-cat-2',behavior:'sun-rest',period:'morning',scene:'courtyard'},
 {animal:'harbor-cat-3',behavior:'sun-rest',period:'afternoon',scene:'courtyard'},
 {animal:'harbor-cat-2',behavior:'sleep',period:'night',scene:'courtyard'},
 {animal:'harbor-cat-3',behavior:'sleep',period:'night',scene:'courtyard'},
]};
const accepted=()=>({format:'harbor-animal-review-v2' as const,passed:true,findings:[]});
const history=join(import.meta.dirname,'fixtures/animal-ai-history-v5');
const original=(batch:string,n:number)=>JSON.parse(readFileSync(join(history,`${batch}-call-${n}-response.json`),'utf8')).choices[0].message.content;
const hash=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
const problem=(v:any)=>({observationId:v.observationId,factId:v.factId,ruleId:v.ruleId});

test('all 12 M1/M2/M3 original requests and envelopes remain byte-for-byte frozen',()=>{
 const manifest=JSON.parse(readFileSync(join(history,'MANIFEST.json'),'utf8'));
 assert.equal(Object.keys(manifest).length,12);
 for(const [name,record] of Object.entries(manifest) as [string,any][]){const bytes=readFileSync(join(history,name));assert.equal(bytes.length,record.bytes);assert.equal(hash(bytes),record.sha256)}
});

test('one executable schema supplies the prompt field guide, legal example and exact inclusive bounds',()=>{
 const example=animalChoiceExample(known);assert.deepEqual(contractViolations(example,animalChoiceSchema),[]);
 assert.deepEqual(inspectAnimalChoice(example,known).issues,[]);compileAnimalStoryChoice(example,known);
 assert.deepEqual(animalChoiceFieldGuide.slice(0,describeContractFields(animalChoiceSchema).length),describeContractFields(animalChoiceSchema));
 assert.deepEqual(animalReviewFieldGuide.slice(0,describeContractFields(animalBoundReviewSchema).length),describeContractFields(animalBoundReviewSchema));
 for(const n of [2,3,4]){
  const observations=n===2?example.observations:choice.observations.slice(0,n);
  assert.deepEqual(inspectAnimalChoice({...choice,observations},known).issues,[]);
 }
 assert.ok(inspectAnimalChoice({...choice,observations:choice.observations.slice(0,2)},known).issues.some(i=>i.ruleId==='ANIMAL_COSMETIC_DUPLICATE'));
 for(const n of [0,1,5]){
  const observations=n===5?[...choice.observations,{animal:'harbor-gull-3',behavior:'shore-space',period:'afternoon',scene:'dock'}]:choice.observations.slice(0,n);
  assert.ok(inspectAnimalChoice({...choice,observations},known).issues.some(i=>i.ruleId==='ANIMAL_OBSERVATION_COUNT'));
  assert.throws(()=>compileAnimalStoryChoice({...choice,observations},known),/GROUNDED_OBSERVATIONS/);
 }
 const shortest={...example,id:'animals:abc'},longest={...example,id:'animals:a'+'b'.repeat(40)};
 compileAnimalStoryChoice(shortest,known);compileAnimalStoryChoice(longest,known);
 for(const bad of [{...example,id:'animals:ab'},{...example,id:longest.id+'b'},{...example,revision:2}])assert.throws(()=>compileAnimalStoryChoice(bad,known),/GROUNDED_FIELDS/);
});

test('exactly four correct individual observations include both courtyard night sleeps; cat2 afternoon market-wander truth does not add a notebook ability',()=>{
 const packet=inspectAnimalChoice(choice,known);assert.equal(packet.observations.length,4);assert.deepEqual(packet.issues,[]);
 assert.ok(isRegisteredAnimalScheduleFact({animal:'harbor-cat-2',period:'afternoon',scene:'market',activity:'wander'}));
 assert.equal(isRegisteredAnimalScheduleFact({animal:'harbor-cat-2',period:'afternoon',scene:'courtyard',activity:'sun-rest'}),false);
 assert.ok(isRegisteredAnimalScheduleFact({animal:'harbor-cat-3',period:'afternoon',scene:'courtyard',activity:'sun-rest'}));
 assertBoundAnimalReview(accepted(),packet);
 assert.throws(()=>compileAnimalStoryChoice({...choice,observations:[{animal:'harbor-cat-2',behavior:'wander',period:'afternoon',scene:'market'},choice.observations[3]]},known),/GROUNDED_OBSERVATIONS/);
});

test('M1 shore-cat prose stays rejected; separate authored reproduction of its wrong location receives an exact observation/fact/rule diagnosis',()=>{
 const raw=original('m1',1);assert.match(raw,/sun-resting by the shore/);
 assert.throws(()=>compileAnimalStoryChoice(JSON.parse(raw),known),/GROUNDED_FIELDS/);
 assert.throws(()=>parseAnimalSemanticReview(original('m1',2)),/REVIEW_INVALID/);
 // This authored negative fixture reproduces the claim, never repairs the raw.
 const wrong=structuredClone(choice);wrong.observations[0].scene='coast';
 const packet=inspectAnimalChoice(wrong,known),issue=packet.issues.find(i=>i.ruleId==='ANIMAL_SCHEDULE_MISMATCH')!;
 assert.equal(issue.observationId,'obs-1');assert.equal(issue.factId,observationFactId(wrong.observations[0]));
 assert.match(renderAnimalViolation(issue).en,/registered schedule/);
 assert.throws(()=>compileAnimalStoryChoice(wrong,known),/SCHEDULE_MISMATCH/);
 assert.equal(original('m1',1),raw);
});

test('M2 mixed-cat afternoon claim and its original 599-unit finding reject; historical 300/301 and UTF-16 boundaries never truncate',()=>{
 const raw=original('m2',1),reviewRaw=original('m2',2);assert.match(raw,/cats sun-resting in the afternoon/);
 assert.equal(JSON.parse(reviewRaw).findings[0].length,599);assert.throws(()=>parseAnimalSemanticReview(reviewRaw),/REVIEW_INVALID/);
 const wrong=structuredClone(choice);wrong.observations[0].period='afternoon';
 assert.throws(()=>compileAnimalStoryChoice(wrong,known),/SCHEDULE_MISMATCH/);
 const packet=inspectAnimalChoice(wrong,known);assert.equal(packet.issues[0].observationId,'obs-1');
 const historical=(text:string)=>JSON.stringify({format:'harbor-animal-review-v1',passed:false,findings:[text]});
 assert.equal(parseAnimalSemanticReview(historical('x'.repeat(300))).findings[0].length,300);
 assert.throws(()=>parseAnimalSemanticReview(historical('x'.repeat(301))),/REVIEW_INVALID/);
 assert.equal(parseAnimalSemanticReview(historical('𐐀'.repeat(150))).findings[0].length,300);
 assert.throws(()=>parseAnimalSemanticReview(historical('𐐀'.repeat(150)+'x')),/REVIEW_INVALID/);
 assert.equal(original('m2',2),reviewRaw);assert.equal(animalContractLimits.legacyFindingCodeUnits,300);
});

test('M3 raw statement fields produce four bound field violations, no invented count or schedule violation; real originals remain rejected and unchanged',()=>{
 const raw=original('m3',1),candidate=JSON.parse(raw),packet=inspectAnimalChoice(candidate,known);
 assert.equal(candidate.observations.length,4);assert.equal(packet.issues.length,4);
 for(const [i,issue] of packet.issues.entries()){
  assert.equal(issue.ruleId,'ANIMAL_OBSERVATION_FIELDS');assert.equal(issue.observationId,`obs-${i+1}`);
  assert.equal(issue.factId,packet.observations[i].factId);assert.equal(candidate.observations[i].statement.length>0,true);
 }
 assert.throws(()=>compileAnimalStoryChoice(candidate,known),/GROUNDED_OBSERVATIONS/);
 const review=parseBoundAnimalReview(JSON.stringify({format:'harbor-animal-review-v2',passed:false,findings:packet.issues.map(problem)}));
 assert.deepEqual(assertBoundAnimalReview(review,packet),{trusted:true,passed:false});
 assert.throws(()=>assertBoundAnimalReview(accepted(),packet),(e:any)=>e.code==='ANIMAL_REVIEW_UNTRUSTED'&&e.reasons.includes('ACCEPTS_DETERMINISTIC_VIOLATION'));
 const legacy=parseAnimalSemanticReview(original('m3',2));assert.equal(legacy.passed,false);assert.equal(legacy.findings.length,8);
 assert.throws(()=>parseBoundAnimalReview(original('m3',2)),/REVIEW_INVALID/);
 assert.equal(original('m3',1),raw);
});

test('a reviewer cannot claim exact four exceeds four, swap individual facts, cite a phantom observation, or omit a deterministic violation',()=>{
 const packet=inspectAnimalChoice(choice,known);
 const count={format:'harbor-animal-review-v2' as const,passed:false,findings:[{observationId:null,factId:null,ruleId:'ANIMAL_OBSERVATION_COUNT'}]};
 assert.throws(()=>assertBoundAnimalReview(count,packet),(e:any)=>e instanceof AnimalReviewUntrustedError&&e.reasons.includes('REJECTS_DETERMINISTICALLY_VALID_FACTS'));
 const rawM3=JSON.parse(original('m3',1)),badPacket=inspectAnimalChoice(rawM3,known);
 const legitimate=badPacket.issues.map(problem),swapped=structuredClone(legitimate);swapped[0].factId=swapped[1].factId;
 for(const findings of [swapped,legitimate.slice(0,3),[...legitimate,legitimate[0]]]){
  const review=parseBoundAnimalReview(JSON.stringify({format:'harbor-animal-review-v2',passed:false,findings}));
  const saved=canonical(review);assert.throws(()=>assertBoundAnimalReview(review,badPacket),/ANIMAL_REVIEW_UNTRUSTED/);assert.equal(canonical(review),saved);
 }
 const phantom={...count,findings:[{observationId:'obs-4',factId:'fact:'+'0'.repeat(64),ruleId:'ANIMAL_SCHEDULE_MISMATCH'}]};
 assert.throws(()=>assertBoundAnimalReview(phantom,packet),/ANIMAL_REVIEW_UNTRUSTED/);
});

test('bound review schema forbids free reasons, positive approval findings, invalid paired ids, unknown rules, nine findings and wrong id lengths',()=>{
 const packet=inspectAnimalChoice(JSON.parse(original('m3',1)),known),finding=problem(packet.issues[0]);
 const rejected={format:'harbor-animal-review-v2',passed:false,findings:[finding]};
 for(const bad of [
  {...accepted(),findings:[finding]}, {...rejected,findings:[]}, {...rejected,findings:[{...finding,reason:'free prose'}]},
  {...rejected,findings:[{...finding,observationId:'obs-9'}]}, {...rejected,findings:[{...finding,observationId:null}]},
  {...rejected,findings:[{...finding,ruleId:'MODEL_RULE'}]}, {...rejected,findings:[{...finding,factId:finding.factId+'0'}]},
  {...rejected,findings:Array(9).fill(finding)}, {...accepted(),extra:true},
 ])assert.throws(()=>parseBoundAnimalReview(JSON.stringify(bad)),/REVIEW_INVALID/);
});

test('duplicate requirements, existing commissions, unknown residents and leave-space without a gull are deterministic, never model-authored rules',()=>{
 const duplicate={...choice,observations:[choice.observations[0],choice.observations[0]]};
 assert.ok(inspectAnimalChoice(duplicate,known).issues.some(i=>i.ruleId==='ANIMAL_DUPLICATE_REQUIREMENT'));
 assert.ok(inspectAnimalChoice({...choice,theme:'leave-space'},known).issues.some(i=>i.ruleId==='ANIMAL_THEME_MISMATCH'));
 assert.ok(inspectAnimalChoice(choice,['mara']).issues.some(i=>i.ruleId==='ANIMAL_UNKNOWN_RESIDENT'));
 const compiled=compileAnimalStoryChoice(choice,known);
 assert.ok(inspectAnimalChoice(choice,known,[compiled]).issues.some(i=>i.ruleId==='ANIMAL_COSMETIC_DUPLICATE'));
 const example=animalChoiceExample(known,[compiled]);assert.deepEqual(inspectAnimalChoice(example,known,[compiled]).issues,[]);
});

test('every admitted 2–4 observation grouping that meets the deterministic rules compiles within the shared authored text limits',context=>{
 let groups=0;
 const visit=(observations:unknown[],start:number)=>{
  if(observations.length>=2){
   const candidate={...choice,observations};
   if(!inspectAnimalChoice(candidate,known).issues.length){
    const definition=compileAnimalStoryChoice(candidate,known);
    for(const [field,maximum] of Object.entries(animalContractLimits.compiledTextCodeUnits))for(const text of (definition as any)[field])assert.ok(text.length<=maximum);
    groups++;
   }
  }
  if(observations.length===4)return;
  for(let i=start;i<admittedAnimalObservationFacts.length;i++)visit([...observations,admittedAnimalObservationFacts[i]],i+1);
 };
 visit([],0);assert.ok(groups>500);context.diagnostic(`author-rendered admitted groupings checked: ${groups}; real model calls: 0`);
});

test('untrusted rejection is cached with original review, writes no artifact and changes no head; generation/review both receive schema-derived contracts',async()=>{
 const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId,gameId:worldId,environment:'test'});let calls=0;let rawReview='';
 try{
  const gateway=await createModelGateway({store,budgetId:'free-v5-untrusted',maximum:2,ownerLimits:{[owner]:2},transport:async(payload:any)=>{
   calls++;const context=JSON.parse(payload.messages[1].content);
   if(calls===1){assert.deepEqual(context.schema,animalChoiceSchema);assert.deepEqual(context.fieldGuide,animalChoiceFieldGuide);assert.deepEqual(inspectAnimalChoice(context.example,known).issues,[]);return JSON.stringify(choice)}
   assert.deepEqual(context.schema,animalBoundReviewSchema);assert.deepEqual(context.fieldGuide,animalReviewFieldGuide);
   assert.equal(Object.hasOwn(context.packet,'issues'),false,'INDEPENDENT_REVIEW_MUST_NOT_RECEIVE_DETERMINISTIC_ANSWER');assert.equal(context.packet.observations.length,4);
   return rawReview=JSON.stringify({format:'harbor-animal-review-v2',passed:false,findings:[{observationId:null,factId:null,ruleId:'ANIMAL_OBSERVATION_COUNT'}]});
  }}),pipeline=createAnimalProposalPipeline(store,gateway,worldId),assembly=makeAssembly(pipeline);
  const authority=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store),{head}=await createReadyJourney(authority,randomUUID()),request=randomUUID();
  for(let i=0;i<2;i++)await assert.rejects(pipeline.propose(owner,head,request),(e:any)=>e.code==='ANIMAL_REVIEW_UNTRUSTED'&&canonical(e.originalReview)===canonical(JSON.parse(rawReview)));
  assert.equal(calls,2);assert.deepEqual(await authority.get(owner,head.id),head);
  await assert.rejects(pipeline.load(owner,'0'.repeat(64)),/ARTIFACT_UNAVAILABLE/);
 }finally{await store.close()}
});

test('parallel proposals use their own bound packets without a shared current-draft closure; one untrusted review cannot approve or corrupt another',async()=>{
 const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId,gameId:worldId,environment:'test'});let calls=0;const heads:any[]=[];
 try{
  const gateway=await createModelGateway({store,budgetId:'free-v5-parallel',maximum:4,ownerLimits:{[owner]:4},transport:async(payload:any)=>{
   calls++;const i=heads.findIndex(h=>h.id===payload.binding.session),context=JSON.parse(payload.messages[1].content);assert.ok(i>=0);
   const candidate={...choice,id:`animals:parallel-v5-${i}`};
   if(!context.packet)return JSON.stringify(candidate);
   assert.equal(context.packet.rawCandidateHash,contentHash(candidate));
   return JSON.stringify(i===0?accepted():{format:'harbor-animal-review-v2',passed:false,findings:[{observationId:null,factId:null,ruleId:'ANIMAL_OBSERVATION_COUNT'}]});
  }}),pipeline=createAnimalProposalPipeline(store,gateway,worldId),assembly=makeAssembly(pipeline),authority=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store);
  for(let i=0;i<2;i++)heads.push((await createReadyJourney(authority,randomUUID())).head);
  const results=await Promise.allSettled(heads.map(h=>pipeline.propose(owner,h,randomUUID())));
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
  if(results[0].status==='fulfilled'){const artifact=results[0].value;assert.equal(artifact.prepared.binding.session,heads[0].id);assert.deepEqual(await pipeline.load(owner,artifact.prepared.artifact_hash),artifact)}
  if(results[1].status==='rejected')assert.equal(results[1].reason.code,'ANIMAL_REVIEW_UNTRUSTED');
  for(const head of heads)assert.deepEqual(await authority.get(owner,head.id),head);assert.equal(calls,4);
 }finally{await store.close()}
});

test('already adopted versioned definitions retain their exact hash when new starts close; revision2 knowledge stays readable without becoming a new proposal',()=>{
 const definition={...compileAnimalStoryChoice(choice,known),revision:2},registry=new AnimalContentRegistry([definition]);
 const ref=registry.ref(definition.id,2),head:any={animalNotebookV1:{schema:1,briefs:[],pages:[],adopted:[{artifactHash:'a'.repeat(64),definition,ref}]}};
 const saved=canonical(head);assert.deepEqual(registryForAnimals(head,false).get(ref),definition);assert.equal(registryForAnimals(head,false).canStart(ref),false);
 assert.equal(canonical(head),saved);assert.throws(()=>compileAnimalStoryChoice({...choice,revision:2},known),/GROUNDED_FIELDS/);
});
