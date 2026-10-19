import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
import first from '../server/content/reviewed-evening-gull-watch.json';
import second from '../server/content/phase2-quiet-after-gulls.json';
import {AnimalContentRegistry,builtInCommissions,canonical,contentHash} from '../server/animal-content';
import {compileAnimalStoryChoice} from '../server/animal-grounding';
import {compileQuietAfterGulls} from '../server/animal-phase2-copy';
import {animalContractHash,inspectAnimalChoice,assertBoundAnimalReview} from '../server/animal-grounded-review';
import {createAnimalProposalPipeline} from '../server/animal-proposals';
import {createReviewedAnimalArcLife,reviewedAnimalArcRegistry} from '../server/reviewed-animal-life';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {withWildMint} from '../server/wild-mint';
import {withBasilPlantUses} from '../server/plant-basil';
import {configuredNews} from '../server/news/configured';
import {runtime} from '../server/runtime';
import {inspectFutureAnimalAdmission} from '../server/animal-species-admission';
import type {AnimalCommission,AnimalRef} from '../src/animal-life/types';
import {parseBoundAnimalReview} from '../server/animal-grounded-review';
import {playStory} from './animal-m3-playthrough';
import {makeAssembly,createReadyJourney,owner,worldId,AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from './animal-m4-context';
// @ts-expect-error pinned local fixture gateway; transport below never reaches a provider
import {createModelGateway} from '../vendor/dynamic-runtime/packages/dynamic-pipeline/model-gateway.mjs';

test('offline candidate uses existing bounded generator, independent review, immutable artifact and explicit adoption',async()=>{
 const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId,gameId:worldId,environment:'test'});let calls=0;
 try{
  const gateway=await createModelGateway({store,budgetId:'animal-phase2-fixture-only',maximum:2,ownerLimits:{[owner]:2},transport:async(payload:any)=>{
   calls++;const context=JSON.parse(payload.messages[1].content);
   if(calls===1){assert.ok(context.schema);return JSON.stringify(second.groundedChoice)}
   assert.equal(Object.hasOwn(context.packet,'issues'),false);return JSON.stringify(second.independentReview);
  }});
  const pipeline=createAnimalProposalPipeline(store,gateway,worldId),assembly=makeAssembly(pipeline),authority=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store),{head}=await createReadyJourney(authority,randomUUID());
  const request=randomUUID(),artifact=await pipeline.propose(owner,head,request);
  assert.equal(calls,2);assert.deepEqual(await authority.get(owner,head.id),head);
  assert.equal(second.choiceHash,contentHash(second.groundedChoice));
  // The ordinary proposal compiler remains generic. The authored continuation
  // is a separate, pinned local pack and is never silently substituted here.
  const generated=compileAnimalStoryChoice(second.groundedChoice,['dani']);
  assert.equal(artifact.prepared.ref.hash,new AnimalContentRegistry([generated]).ref(generated.id,generated.revision).hash);
  assert.deepEqual(artifact.prepared.definition,generated);
  assert.deepEqual(await pipeline.propose(owner,head,request),artifact);assert.equal(calls,2);
  const action={action_id:randomUUID(),expected_version:head.version,scene:head.scene,position:head.position,target:'animal-notebook',action:'animal-life:adopt',payload:{artifactHash:artifact.prepared.artifact_hash}};
  const adopted=(await authority.action(owner,head.id,action)).head;
  assert.equal(adopted.animalNotebookV1.adopted[0].ref.hash,artifact.prepared.ref.hash);
  assert.deepEqual((await authority.action(owner,head.id,action)).head,adopted);
  assert.equal(adopted.relations.dani,head.relations.dani);assert.deepEqual(adopted.items,head.items);assert.equal(adopted.cash,head.cash);
 }finally{await store.close()}
});

test('reviewed two-chapter story stays hidden until the original page, then completes with ordinary saved observations',async()=>{
 assert.equal(second.contractHash,animalContractHash);assert.equal(second.choiceHash,contentHash(second.groundedChoice));
 assert.equal(second.continuationHash,contentHash(second.continuation));
 assert.deepEqual(second.prerequisite,first.ref);
 assert.deepEqual(inspectAnimalChoice(second.groundedChoice,['dani'],[...builtInCommissions,first.definition as AnimalCommission]).issues,[]);
 assertBoundAnimalReview(parseBoundAnimalReview(JSON.stringify(second.independentReview)),inspectAnimalChoice(second.groundedChoice,['dani'],[...builtInCommissions,first.definition as AnimalCommission]));
 assert.deepEqual(compileQuietAfterGulls(second.groundedChoice),second.definition);
 const legacy=new AnimalContentRegistry();const registry=reviewedAnimalArcRegistry();
 for(const d of builtInCommissions)assert.deepEqual(registry.ref(d.id,d.revision),legacy.ref(d.id,d.revision));
 assert.deepEqual(registry.ref(first.ref.id,first.ref.revision),first.ref);assert.deepEqual(registry.ref(second.ref.id,second.ref.revision),second.ref);
 const time={value:100000},config={path:':memory:',worldId:'animal-phase2-arc',gameId:'animal-phase2-arc',environment:'test'},localOwner='animal-phase2-only';
 const store=openAsyncSqliteAuthorityStore(config),options={now:()=>time.value,boot:'animal-phase2-local',crabEnabled:true,createLife:createReviewedAnimalArcLife,
  decorateLife:(life:any)=>withWildMint(withBasilPlantUses(life,{enabled:true,newStarts:true}),{enabled:true,newStarts:true}),
  decorateRuntime:(r:any)=>configuredNews(r,new URL('../server/news/frozen-catalog-20261006.json',import.meta.url).pathname),
  initial:(l:any,id:string)=>({...initial(l,id),scene:'coast',position:{...rooms.coast.spawn},known:['mara','ruth','owen','dani'],visited:Object.keys(rooms),flags:['key','unpacked','route-open','market-open'],items:{key:1}})};
 const assembly=createExplorationAssembly(options),authority=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store);
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('ANIMAL_PHASE2_NETWORK_FORBIDDEN')};
 try{
  let head=await authority.create(localOwner,randomUUID(),'en');head=(await authority.action(localOwner,head.id,{action_id:randomUUID(),expected_version:head.version,scene:head.scene,position:head.position,target:'home',action:'travel-map'})).head;
  assert.equal(assembly.animalProject(head).commissions.some((c:any)=>c.ref.id===second.ref.id),false);
  assert.equal(registry.canStart(second.ref as AnimalRef,head),false);
  const firstResult=await playStory(authority,assembly,localOwner,head,first.groundedChoice as any,time);
  assert.equal(firstResult.head.animalNotebookV1.pages.find((p:any)=>p.ref.id===first.ref.id).ref.hash,first.ref.hash);
  assert.equal(assembly.animalProject(firstResult.head).commissions.some((c:any)=>c.ref.id===second.ref.id),true);
  assert.deepEqual(assembly.animalProject(firstResult.head).commissions.find((c:any)=>c.ref.id===second.ref.id).continuation,second.continuation);
  assert.equal(registry.canStart(second.ref as AnimalRef,firstResult.head),true);
  const secondResult=await playStory(authority,assembly,localOwner,firstResult.head,second.groundedChoice as any,time,true);
  assert.equal(secondResult.report.counts.observations,1);
  assert.equal(secondResult.report.observations[0].animal,'harbor-cat-3');
  assert.equal(secondResult.head.animalNotebookV1.pages.filter((p:any)=>p.ref.id===second.ref.id).length,1);
  assert.equal(secondResult.head.animalNotebookV1.pages.find((p:any)=>p.ref.id===second.ref.id).ref.hash,second.ref.hash);
  assert.equal(secondResult.head.relations.dani,(head.relations.dani??0)+2);
  assert.equal(secondResult.head.animalNotebookV1.adopted,undefined);
  assert.deepEqual(secondResult.head.items,head.items);assert.equal(secondResult.head.cash,head.cash);
  assert.equal(secondResult.report.realAdditionalModelCalls,0);
  const tampered=structuredClone(secondResult.head);
  tampered.animalNotebookV1.pages=tampered.animalNotebookV1.pages.filter((p:any)=>p.ref.id!==first.ref.id);
  assert.throws(()=>assembly.runtime.assertReadable(tampered),/ANIMAL_STORY_SEQUENCE_INVALID/);
  const frozen=canonical(secondResult.head);assert.deepEqual((await authority.action(localOwner,head.id,secondResult.shareAction)).head,secondResult.head);assert.equal(canonical(secondResult.head),frozen);
 }finally{globalThis.fetch=originalFetch;await store.close()}
});

test('future animal admission stays closed without native art, full motion and rights evidence',()=>{
 const unavailable={id:'harbor-dog-99',species:'dog'};
 const missing=inspectFutureAnimalAdmission(unavailable);
 assert.equal(missing.runtimeAdmitted,false);assert.equal(missing.readyForOwnerReview,false);
 assert.ok(missing.missing.includes('rights'));assert.ok(missing.missing.includes('native-media'));
 const hash='a'.repeat(64),complete={id:'harbor-dog-99',species:'dog',rights:{source:'fixed-original',scope:'private-game',reviewed:true},media:{atlasSha256:hash,portraitSha256:hash,poseSha256:Array(9).fill(hash)},profile:{width:384,height:512,footX:64,footY:122,scale:0.5},behavior:{scheduleFacts:4,observationContract:true,collisionReviewed:true},qa:{renderer320Sha256:hash,renderer390Sha256:hash,continuousMotion:true,saveCompatibility:true}};
 assert.deepEqual(inspectFutureAnimalAdmission(complete),{readyForOwnerReview:true,runtimeAdmitted:false,missing:[]});
 assert.equal(inspectFutureAnimalAdmission({...complete,id:'harbor-cat-1'}).readyForOwnerReview,false);
});
