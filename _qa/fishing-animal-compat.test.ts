import {checkShore} from '../src/world/shore-water';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Save,Action} from '../src/story/state';
import {entityAt,rooms,worldWithFlags} from '../src/world/data';
import {fernInBag,fernQaAssembly,fernCommand} from './ornamental-fern-fixture';
import {createReviewedAnimalArcLife} from '../server/reviewed-animal-life';
import {observationId,type AnimalRef} from '../src/animal-life/types';
import type {LifeSave} from '../src/life/types';
import {pinLegacy} from '../src/life/save';
import {createPlantsRegistry} from '../server/life-plants-b2';
import {fishingInitial,fishingStep,recordFishing,type FishingRun} from '../src/challenges/fishing';
import first from '../server/content/reviewed-evening-gull-watch.json';
import second from '../server/content/phase2-quiet-after-gulls.json';
// @ts-expect-error frozen async authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

test('merged actual SQLite keeps fern provenance and Dani root through legacy/shore fishing, chapter share, move, replay and reopen',async()=>{
 const template=await fernInBag();template.scene='garden';template.position={...entityAt('garden','dani')!.approach};template.visited=Object.keys(rooms);
 const prep=fernQaAssembly({createLife:createReviewedAnimalArcLife});let save=template;
 for(const verb of ['introduce','talk:rg-personal'])save=(await prep.runtime.prepare(save,{action_id:randomUUID(),expected_version:save.version,scene:save.scene,position:save.position,target:'dani',action:verb})).head;
 // Synthetic pre-completed animal observations; this is a seam test, not a player journey.
 save=pinLegacy(save,createPlantsRegistry());const minute=save.townMinutes??540;save.known.push('ruth');save.scene='dock';save.position={...entityAt('dock','ruth')!.approach};save.items.fish=99;
 save.animalNotebookV1={schema:1,briefs:[second.ref as AnimalRef],pages:[{ref:first.ref as AnimalRef,sourceAction:randomUUID(),minute}],active:{ref:second.ref as AnimalRef,sourceAction:randomUUID(),minute}};
 for(const [animal,behavior,visualVersion] of [['harbor-gull-3','shore-space','coastal-gull-v1'],['harbor-cat-3','sleep','domestic-cat-v1']]){const id=observationId(animal,behavior as any);(save as LifeSave).lifeV1!.collections[id]={id,sourceAction:randomUUID(),minute,source:{kind:'animal-schedule',id:animal,visualVersion}}}
 const dir=mkdtempSync('/tmp/harbor-fishing-animal-'),config={path:join(dir,'authority.sqlite'),worldId:'fishing-animal-compat',gameId:'fishing-animal-compat'};
 const assembly=fernQaAssembly({createLife:createReviewedAnimalArcLife,initial:(_l:unknown,id:string)=>{const s=structuredClone(save);s.id=id;s.version=0;s.cursor=0;s.ornamentalFernV1!.plant!.ownerJourney=id;return s}});
 let store=openAsyncSqliteAuthorityStore(config),authority=new AsyncSessionAuthority(store,assembly.runtime);const owner='synthetic-merged-owner';
 try{
  let s:Save=await authority.create(owner,randomUUID(),'en');const fern=structuredClone(s.ornamentalFernV1),dani=structuredClone(s.relationshipNextV1),animal=structuredClone(s.animalNotebookV1),beforeDani=s.relations.dani??0,beforeEnergy=s.energy,cash=s.cash;
  const command=(target:string,verb:string,payload?:unknown):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,target)?.approach??s.position,target,action:verb,payload});
  s=(await authority.action(owner,s.id,command('ruth','challenge-start:fishing'))).head;
  await assert.rejects(authority.action(owner,s.id,command('animal-notebook','animal-life:cancel',{command:{verb:'cancel',ref:second.ref}})),/CHALLENGE_ACTIVE/);
  let f=fishingInitial();const fishing:FishingRun[]=[];while(f.result==='playing'){const hold=f.tension<.7;recordFishing(fishing,hold);f=fishingStep(f,hold)}
  const finish=command(s.activeChallenge!.id,'challenge-finish',{fishing}),caught=await authority.action(owner,s.id,finish);s=caught.head;assert.deepEqual(await authority.action(owner,s.id,finish),caught);
  assert.deepEqual([s.items.fish,s.energy,s.cash],[100,beforeEnergy-2,cash]);assert.deepEqual(s.ornamentalFernV1,fern);assert.deepEqual(s.relationshipNextV1,dani);assert.deepEqual(s.animalNotebookV1,animal);
  const ruthAfterBorrow=s.relations.ruth;
  s=(await authority.action(owner,s.id,command('fishing-kit','fishing-kit:claim'))).head;const shore=checkShore(s.scene,s.position,worldWithFlags(s.flags));assert.ok(shore.ok);
  s=(await authority.action(owner,s.id,command('shore-water','fishing:start',{cast:shore.target.at}))).head;let line=fishingInitial();const runs:FishingRun[]=[];while(line.result==='playing'){recordFishing(runs,true);line=fishingStep(line,true,'first')}assert.equal(line.result,'caught');
  const shoreFinish=command(s.activeChallenge!.id,'challenge-finish',{shore:{hookTick:45,waitTicks:45,runs}}),shoreReceipt=await authority.action(owner,s.id,shoreFinish);s=shoreReceipt.head;assert.deepEqual(await authority.action(owner,s.id,shoreFinish),shoreReceipt);assert.equal(s.items.fish,101);assert.equal(s.energy,beforeEnergy-4);assert.equal(s.relations.ruth,ruthAfterBorrow);assert.deepEqual(s.ornamentalFernV1,fern);assert.deepEqual(s.relationshipNextV1,dani);assert.deepEqual(s.animalNotebookV1,animal);
  s=(await authority.action(owner,s.id,command('garden','travel-map'))).head;const share=command('dani','animal-life:share',{command:{verb:'share',ref:second.ref}}),shared=await authority.action(owner,s.id,share);s=shared.head;assert.deepEqual(await authority.action(owner,s.id,share),shared);
  assert.equal(s.relations.dani,beforeDani+1);assert.equal(s.items.fish,101);assert.deepEqual(s.relationshipNextV1,dani);assert.deepEqual(s.ornamentalFernV1,fern);assert.equal(s.animalNotebookV1!.pages.length,2);
  await assert.rejects(authority.action(owner,s.id,command('dani','animal-life:share',{command:{verb:'share',ref:second.ref}})),/COMMISSION_MISMATCH/);
  s=(await authority.action(owner,s.id,command('home','travel-map'))).head;const energy=s.energy,now=s.townMinutes??540,move=fernCommand(s,'place'),placed=await authority.action(owner,s.id,move);s=placed.head;assert.deepEqual(await authority.action(owner,s.id,move),placed);
  assert.deepEqual(s.ornamentalFernV1!.plant!.source,fern!.plant!.source);assert.deepEqual(s.relationshipNextV1,dani);assert.equal(s.items.fish,101);assert.equal(s.energy,energy-4);assert.equal(s.townMinutes,now+20);assert.equal(s.cash,cash);
  await store.close();store=openAsyncSqliteAuthorityStore(config);authority=new AsyncSessionAuthority(store,assembly.runtime);assert.deepEqual(await authority.get(owner,s.id),s);assembly.runtime.assertReadable(s);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
test('authorized public entry selects the reviewed animal continuation registry',()=>{const s=readFileSync('server/public.ts','utf8');assert.match(s,/createLife:createReviewedAnimalArcLife/);assert.doesNotMatch(s,/createLife:createReviewedAnimalLife[,}]/)});
