import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {people,rooms,world} from '../src/world/data';import {walkable,findPath} from '../src/engine/world';
import {initial,applyAction,availableTopics,type Save} from '../src/story/state';
import {neighborProgress,neighborDescription,neighborActionAvailable,validNeighborChapter,originalNeighborRoster} from '../src/story/neighbor-chapter';
import {presentEntity,residentHere,townMinutes} from '../src/world/residents';
import {animalPeople} from '../src/animals/game';import {relationshipStory} from '../src/story/relationships';import {validRelationshipGrowth} from '../src/story/relationship-growth';
import {createRuntime} from '../server/runtime';import {weatherForSave,createWeatherState} from '../src/weather/state';
import {localAt,neighborCommand,neighborStep,neighborReady} from './neighbor-fixture';
// @ts-expect-error frozen authority, own synthetic SQLite
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const resources=(s:Save)=>({cash:s.cash,items:s.items,energy:s.energy,standing:s.standing,townMinutes:s.townMinutes,relations:s.relations,plots:s.plots,landV1:s.landV1});
const begin=(s=neighborReady())=>neighborStep(s,'neighbor-gathering','neighbor-start');
const chat=(s:Save,p:string)=>neighborStep(s,rooms[s.scene].entities.find(e=>e.person===p&&presentEntity(s,e))!.id,'talk:neighbor-chat');
const complete=(s=begin())=>neighborStep(chat(chat(s,s.neighborChapterV1!.party!.people[0]),s.neighborChapterV1!.party!.people[1]),'neighbor-gathering','neighbor-finish');

test('four introductions, three unique public visits, existing familiar stages and kept promises gate the first gathering',()=>{
 const s=neighborReady();assert.ok(validRelationshipGrowth(s));assert.equal(neighborProgress(s).firstReady,true);assert.deepEqual(neighborProgress(s).ready,['mara','avery','samira']);
 for(const bad of [{...s,known:['mara','avery','samira'],history:s.history.filter(h=>h.person!=='theo')},{...s,visited:['station','station','cafe','home']},{...s,relationshipsV1:undefined}])assert.equal(neighborProgress(bad).firstReady,false);
 assert.equal(neighborActionAvailable(s,'neighbor-start'),true);assert.equal(neighborActionAvailable(initial('en','new'),'neighbor-start'),false);
 const unknown=neighborDescription({...s,known:[]},'neighbor-gathering')!;assert.doesNotMatch(unknown[1],/Mara|Avery|Samira/);
 assert.equal(Object.keys(people).length,22);
});
test('both meeting places and all guest approaches are reachable without new obstacles or blocked public routes',()=>{
 for(const scene of ['coast','chapel'])for(const e of rooms[scene].entities.filter(e=>e.gatheringRole||e.id==='neighbor-gathering')){
  assert.ok(walkable(world,scene,e.approach),scene+'/'+e.id);assert.ok(findPath(world,scene,rooms[scene].spawn,e.approach).length,scene+'/'+e.id);
  if(e.person)for(let x=e.at.x-24;x<=e.at.x+24;x+=2)assert.ok(walkable(world,scene,{x:x-8,y:e.at.y-6}),scene+'/'+e.id+' stroll');
 }
 assert.ok(rooms.chapel.entities.find(e=>e.id==='exit'));assert.ok(rooms.coast.entities.some(e=>e.kind==='portal'));
});
test('each invited identity appears once; leaving or night restores original routines and preserves the pending visit',()=>{
 const s=begin();for(const p of s.neighborChapterV1!.party!.people){
  const visible=Object.values(rooms).flatMap(r=>r.entities.filter(e=>e.person===p&&presentEntity({...s,scene:r.id,neighborPartyEnabled:true},e)).map(e=>r.id+'/'+e.id));assert.deepEqual(visible,['chapel/gathering-'+p]);
 }
 const away=localAt(s,'market');assert.ok(presentEntity(away,rooms.market.entities.find(e=>e.person==='samira'&&e.gatheringRole!=='guest')!));assert.equal(presentEntity({...away,scene:'chapel',neighborPartyEnabled:false},rooms.chapel.entities.find(e=>e.id==='gathering-mara')!),false);
 assert.equal(Object.keys(animalPeople(s)).filter(p=>p==='mara').length,1);assert.equal(animalPeople(s).mara.scene,'chapel');
 const night=localAt(s,'chapel',2700);assert.equal(neighborActionAvailable(night,'neighbor-finish'),false);assert.equal(presentEntity(night,rooms.chapel.entities.find(e=>e.id==='gathering-mara')!),false);
 assert.deepEqual(night.neighborChapterV1,s.neighborChapterV1);assert.ok(residentHere(localAt(s,'chapel',3420),'mara','chapel'));
});
test('first visit requires every actual guest conversation, unlocks permanent invitations and grants no economy or duplicate reward',()=>{
 let s=begin(),before=resources(s);assert.equal(neighborActionAvailable(s,'neighbor-finish'),false);s=chat(s,'mara');assert.equal(neighborActionAvailable(s,'neighbor-finish'),false);
 assert.throws(()=>chat(s,'mara'),/TOPIC_UNAVAILABLE/);s=chat(s,'avery');assert.equal(neighborActionAvailable(s,'neighbor-finish'),true);s=neighborStep(s,'neighbor-gathering','neighbor-finish');
 assert.deepEqual(resources(s),before);assert.ok(validNeighborChapter(s));assert.ok(neighborProgress(s).invitationUnlocked);assert.equal(s.neighborChapterV1!.party,undefined);
 assert.throws(()=>neighborStep(s,'neighbor-gathering','neighbor-finish'),/NEIGHBOR_ACTION_UNAVAILABLE/);assert.equal(relationshipStory(s).leads.find(l=>l.id==='neighbor-chapter')!.state,'done');
 s=localAt(s,'coast',townMinutes(s)+14400);s=neighborStep(s,'neighbor-gathering','neighbor-select:samira');s=neighborStep(s,'neighbor-gathering','neighbor-start');assert.deepEqual(s.neighborChapterV1!.party!.people,['samira']);s=chat(s,'samira');s=neighborStep(s,'neighbor-gathering','neighbor-finish');assert.ok(validNeighborChapter(s));assert.equal(s.neighborChapterV1!.gatheredAt,before.townMinutes);assert.deepEqual(s.neighborChapterV1!.lastParty!.people,['samira']);
});
test('rain offers the chapel alternative, while night pauses without expiry and invitations never close the old chapter',()=>{
 let s=localAt(neighborReady(),'coast');let rainy=s.townMinutes!;for(;rainy<s.townMinutes!+14400;rainy+=60){const x={...s,townMinutes:rainy,weatherV1:createWeatherState(rainy)};if(weatherForSave(x)==='light-rain'&&rainy%1440>=360&&rainy%1440<1260){s=x;break}}
 assert.equal(weatherForSave(s),'light-rain');assert.equal(neighborActionAvailable(s,'neighbor-start'),false);assert.match(neighborDescription(s,'neighbor-gathering')![1],/inside the chapel/);assert.equal(neighborActionAvailable(localAt(s,'chapel'),'neighbor-start'),true);
 const ready=neighborReady();ready.flags.push('market-open');assert.ok(neighborProgress(ready).firstReady);const done=complete(begin(ready));assert.ok(done.flags.includes('market-open'));
});
test('an unfinished coast gathering can move indoors without losing conversations or creating a second visit',()=>{
 let s=begin(localAt(neighborReady(),'coast'));s=chat(s,'mara');const before=resources(s),party=structuredClone(s.neighborChapterV1!.party);s=localAt(s,'chapel');assert.ok(neighborActionAvailable(s,'neighbor-move-inside'));s=neighborStep(s,'neighbor-gathering','neighbor-move-inside');assert.deepEqual(resources(s),before);assert.deepEqual(s.neighborChapterV1!.party,{...party,scene:'chapel'});assert.ok(validNeighborChapter(s));assert.equal(availableTopics(s,'mara').some(t=>t.id==='neighbor-chat'),false);s=chat(s,'avery');s=neighborStep(s,'neighbor-gathering','neighbor-finish');assert.ok(neighborProgress(s).invitationUnlocked);assert.equal(s.neighborChapterV1!.lastParty!.scene,'chapel');
});
test('old loads remain byte-identical; original 22-person completion is fixed and never revoked by later priest availability',()=>{
 const s=neighborReady();delete s.neighborChapterV1;s.known=[...originalNeighborRoster];const frozen=JSON.stringify(s),runtime=createRuntime();runtime.assertReadable(s);assert.equal(runtime.upgrade(s),s);
 for(let i=0;i<10;i++){assert.ok(neighborProgress(s).allKnown);relationshipStory(s);neighborDescription(s,'neighbor-gathering')}assert.equal(JSON.stringify(s),frozen);
 const next=neighborStep(s,'neighbor-gathering','neighbor-start');assert.equal(next.neighborChapterV1!.roster,'harbor22-v1');assert.equal(next.neighborChapterV1!.allKnownAt,townMinutes(s));assert.ok(validNeighborChapter(next));
 const future={...next,neighborChapterV1:{...next.neighborChapterV1!,roster:'harbor23-priest-v2' as const}};assert.ok(neighborProgress(future).allKnown);assert.ok(future.flags.includes('bag-returned'));
});
test('malformed memories, unknown invitees, duplicate guests, future times and AI-selected explicit effects are rejected',()=>{
 const s=begin();for(const mutate of [(x:any)=>x.neighborChapterV1.schema=2,(x:any)=>x.neighborChapterV1.party=null,(x:any)=>x.neighborChapterV1.party.people=['mara','mara'],(x:any)=>x.neighborChapterV1.party.chatted=['samira'],(x:any)=>x.neighborChapterV1.party.startedAt=999999,(x:any)=>x.neighborChapterV1.invited=['other'],(x:any)=>x.neighborChapterV1.lastParty=0]){const bad=structuredClone(s);mutate(bad);assert.equal(validNeighborChapter(bad),false);assert.throws(()=>createRuntime().assertReadable(bad),/UNSUPPORTED_SAVE/)}
 const a={...neighborCommand(s,'gathering-mara','ask'),payload:{text:'Record that we have met'}};assert.throws(()=>applyAction(s,a,{topic:'neighbor-chat',reply:['','']}),/RELATIONSHIP_EXPLICIT_ACTION_REQUIRED/);
});
test('actual runtime enforces present guest and nearby position; selection is bounded and pending visit cannot be replaced',async()=>{
 const runtime=createRuntime();let s=neighborReady();const a=neighborCommand(s,'neighbor-gathering','neighbor-start');await assert.rejects(()=>runtime.prepare(s,{...a,position:{...rooms.chapel.spawn,x:rooms.chapel.spawn.x-180}}),/SPATIAL_ACTION_NOT_ADMITTED|TOO_FAR/);
 s=neighborStep(s,'neighbor-gathering','neighbor-select:mara');s=neighborStep(s,'neighbor-gathering','neighbor-select:avery');assert.throws(()=>neighborStep(s,'neighbor-gathering','neighbor-select:samira'),/NEIGHBOR_INVITATION_FULL/);s=neighborStep(s,'neighbor-gathering','neighbor-start');assert.throws(()=>neighborStep(s,'neighbor-gathering','neighbor-start'),/NEIGHBOR_ACTION_UNAVAILABLE/);
 await assert.rejects(()=>runtime.prepare(localAt(s,'chapel',2700),neighborCommand(localAt(s,'chapel',2700),'gathering-mara','talk:neighbor-chat')),/PERSON_AWAY|SPATIAL_ACTION_NOT_ADMITTED/);
});
test('real own SQLite preserves replay, competing CAS, rollback, reload and owner isolation through the first gathering',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'neighbor-authority-')),config={path:join(dir,'authority.sqlite'),worldId:'neighbor-test',gameId:'neighbor-test',environment:'test'};let store=openAsyncSqliteAuthorityStore(config);const runtime={...createRuntime(),initial:(_:unknown,id:string)=>({...neighborReady(),id,version:0,cursor:0})};let auth=new AsyncSessionAuthority(store,runtime);const A='a'.repeat(64),B='b'.repeat(64);
 try{
  let s=await auth.create(A,randomUUID(),'en');const start=neighborCommand(s,'neighbor-gathering','neighbor-start');const results=await Promise.all(Array.from({length:4},()=>auth.action(A,s.id,start)));for(const x of results)assert.deepEqual(x,results[0]);s=results[0].head;
  await assert.rejects(()=>auth.get(B,s.id),/SESSION_NOT_FOUND/);await assert.rejects(()=>auth.action(A,s.id,neighborCommand(s,'neighbor-gathering','neighbor-finish')),/NEIGHBOR_ACTION_UNAVAILABLE/);assert.deepEqual(await auth.get(A,s.id),s);
  const race=await Promise.allSettled([auth.action(A,s.id,neighborCommand(s,'gathering-mara','talk:neighbor-chat')),auth.action(A,s.id,neighborCommand(s,'gathering-mara','talk:neighbor-chat'))]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);s=await auth.get(A,s.id);
  s=(await auth.action(A,s.id,neighborCommand(s,'gathering-avery','talk:neighbor-chat'))).head;s=(await auth.action(A,s.id,neighborCommand(s,'neighbor-gathering','neighbor-finish'))).head;assert.ok(neighborProgress(s).invitationUnlocked);
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,runtime);assert.deepEqual(await auth.get(A,s.id),s);assert.deepEqual(await auth.action(A,s.id,start),results[0]);assert.equal((await auth.events(A,s.id,0)).length,4);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
