import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {initial,applyAction,availableTopics,type Save,type Action} from '../src/story/state';
import {rooms,entityAt,world} from '../src/world/data';import {findPath,walkable} from '../src/engine/world';
import {oldLife,residentRoutes,residentClearOfPlayer,observedActor,residentHere,patrolRadius,townMinutes,townPeriod,fernStage,advanceTown,sleepToMorning} from '../src/world/residents';
import {runtime,createRuntime} from '../server/runtime';import {questionExamples} from '../src/story/question-examples';import {dialogueContext} from '../server/dialogue-context';
// @ts-expect-error frozen runtime module
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const action=(s:Save,target:string,verb:string):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,target)?.approach??s.position,target,action:verb});
const act=(s:Save,target:string,verb:string)=>applyAction(s,action(s,target,verb)).head;
test('old save defaults do not mutate it; clock monotonic with four periods and sleep catch-up',()=>{
 const s=initial('en','test');delete s.townMinutes;const original=structuredClone(s);runtime.assertReadable(s);assert.equal(townMinutes(s),540);assert.deepEqual(s,original);
 for(const [m,p] of [[540,'morning'],[720,'afternoon'],[1020,'evening'],[1260,'night'],[1440,'night'],[1800,'morning']] as const)assert.equal(townPeriod({townMinutes:m}),p);
 advanceTown(s,180);assert.equal(s.townMinutes,720);assert.throws(()=>advanceTown(s,-1));s.townMinutes=1430;sleepToMorning(s);assert.equal(s.townMinutes,1980);s.townMinutes=1500;sleepToMorning(s);assert.equal(s.townMinutes,1980);sleepToMorning(s);assert.equal(s.townMinutes,3420);
 assert.throws(()=>runtime.assertReadable({...s,townMinutes:-1}));assert.throws(()=>runtime.assertReadable({...s,fernStartedAt:9000}));
});
test('a configured resident stays where the live loop left them',()=>{
 const evening={townMinutes:1093,npcLoopV1:{minute:1080,residents:[{id:'theo',scene:'cafe'}]} as Save['npcLoopV1']};
 assert.equal(residentHere({townMinutes:1093},'theo','cafe'),false);
 assert.equal(residentHere(evening,'theo','cafe'),true);
});
test('each resident occupies one location in each daytime period, none at night; full stroll and approach are reachable',()=>{
 for(const [person,routes] of Object.entries(residentRoutes))for(const [i,r] of routes.entries()){
  const clock={townMinutes:[540,780,1080][i]};assert.equal(Object.keys(rooms).filter(scene=>residentHere(clock,person,scene)).length,1);assert.ok(residentHere(clock,person,r.scene));
  for(let d=-patrolRadius(person);d<=patrolRadius(person);d+=4){assert.ok(walkable(world,r.scene,{x:r.at.x+d-8,y:r.at.y-6}),`${person}/${r.scene}/${d} feet`);assert.ok(findPath(world,r.scene,rooms[r.scene].spawn,{x:r.at.x+d-8,y:r.at.y+42}).length,`${person}/${r.scene}/${d} approach`)}
  assert.equal(Object.keys(rooms).filter(scene=>residentHere({townMinutes:1300},person,scene)).length,0);
 }
});
test('local observed moving NPC footpoint is bounded, near admission follows it; absence is rejected before model',async()=>{
 let s=initial('en','test');s=act(s,'avery','introduce');let calls=0;const rt=createRuntime(async()=>{calls++;return {topic:null,reply:['好','Fine']}});
 const e=entityAt('station','avery')!,a={...action(s,'avery','ask'),actorPosition:{x:e.at.x+24,y:e.at.y},position:{x:e.at.x+24-8,y:e.at.y+42},payload:{text:'What are you looking at?'}};
 await rt.prepare(s,a,undefined,{owner:'test'});assert.equal(calls,1);
 await assert.rejects(rt.prepare(s,{...a,actorPosition:{x:e.at.x+400,y:e.at.y}},undefined,{owner:'test'}),/INVALID_ACTOR_POSITION/);
 await assert.rejects(rt.prepare({...s,townMinutes:780},a,undefined,{owner:'test'}),/PERSON_AWAY/);assert.equal(calls,1);
});
test('relationships emerge through follow-up conversation, evening opportunity recurs, rewards and examples use committed memories',()=>{
 let s=initial('en','test');s.flags=['key','unpacked'];s.items.key=1;
 s=act(s,'avery','introduce');assert.ok(!availableTopics(s,'avery').some(t=>t.id==='company'));s=act(s,'avery','talk:sketch');s=act(s,'avery','talk:company');
 s=act(s,'road-market','travel');assert.equal(townMinutes(s),560);s=act(s,'samira','introduce');assert.ok(!availableTopics(s,'samira').some(t=>t.id==='invite'));s=act(s,'samira','talk:humming');s=act(s,'samira','talk:invite');
 assert.equal(s.relations.avery,1);assert.equal(s.relations.samira,1);assert.ok(!availableTopics(s,'samira').some(t=>t.id==='listen'));
 // Reach the evening with explicit legal travel/rest, not wall-clock waiting.
 s=act(s,'road-station','travel');s=act(s,'to-home','travel');s=act(s,'bed','rest');s=act(s,'bed','rest');s=act(s,'exit','travel');s=act(s,'road-harbor','travel');s=act(s,'to-dock','travel');
 assert.equal(townPeriod(s),'evening');assert.ok(availableTopics(s,'samira').some(t=>t.id==='listen'));
 const missed={...s,townMinutes:townMinutes(s)+1440};assert.ok(availableTopics(missed,'samira').some(t=>t.id==='listen'),'a later day is valid');
 const beforeExamples=questionExamples(s,'samira','en');assert.ok(!JSON.stringify(beforeExamples).includes('our time on the pier'));
 s=act(s,'samira','talk:listen');assert.equal(s.relations.avery,2);assert.equal(s.relations.samira,2);assert.throws(()=>act(s,'samira','talk:listen'),/TOPIC_UNAVAILABLE/);
 assert.ok(availableTopics(s,'avery').some(t=>t.id==='after-song'));assert.match(JSON.stringify(questionExamples(s,'samira','en')),/our time on the pier/);assert.equal(dialogueContext(s,'samira').residentLife.sharedSong,true);
 const oldClock=s.townMinutes;const free=applyAction(s,{...action(s,'samira','ask'),payload:{text:'Remember this evening?'}},{topic:null,reply:['记得','I remember']}).head;assert.equal(free.townMinutes,oldClock);
});
test('fern grows from committed elapsed time, sleep skips catch up, repeated care is harmlessly rejected',()=>{
 let s=initial('en','test');s.scene='garden';s.position=rooms.garden.spawn;
 assert.equal(fernStage(s),'young');s=act(s,'growing-fern','water-fern');const planted=s.fernStartedAt!;assert.throws(()=>act(s,'growing-fern','water-fern'),/ALREADY_DONE/);
 assert.equal(fernStage({...s,townMinutes:planted+359}),'young');assert.equal(fernStage({...s,townMinutes:planted+360}),'unfurling');assert.equal(fernStage({...s,townMinutes:planted+1440}),'grown');assert.equal(fernStage({...s,townMinutes:planted+1440*20}),'grown');
 assert.deepEqual(s.items,{});assert.equal(s.standing,0);
});
test('SQLite restart and lost replies preserve clock/plant/memories; stale AI and other-owner writes cannot alter them',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'harbor-life-')),cfg={path:join(dir,'s.sqlite'),worldId:'life',gameId:'life'};let store=openAsyncSqliteAuthorityStore(cfg);
 const rt={...runtime,initial:(locale:any,id:string)=>({...initial(locale,id),scene:'home',position:rooms.home.spawn,flags:['key','unpacked','residents:invited','residents:song-shared'],known:['avery','samira'],relations:{avery:2,samira:2},fernStartedAt:540})};
 try{let auth=new AsyncSessionAuthority(store,rt),s=await auth.create('A',randomUUID(),'en');const nap=action(s,'bed','rest');s=(await auth.action('A',s.id,nap)).head;assert.equal(s.townMinutes,720);const sleep=action(s,'bed','sleep');s=(await auth.action('A',s.id,sleep)).head;assert.equal(fernStage(s),'grown');await store.close();store=openAsyncSqliteAuthorityStore(cfg);auth=new AsyncSessionAuthority(store,rt);
  const receipt=await auth.action('A',s.id,nap);assert.equal(receipt.head.townMinutes,720);const current=await auth.get('A',s.id);assert.equal(current.townMinutes,1980);assert.equal(current.fernStartedAt,540);assert.equal(current.relations.avery,2);assert.ok(current.flags.includes('residents:song-shared'));
  await assert.rejects(auth.action('A',s.id,{...sleep,action_id:randomUUID()}),/VERSION_CONFLICT/);await assert.rejects(auth.get('B',s.id),/SESSION_NOT_FOUND/);assert.deepEqual(await auth.get('A',s.id),current);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});

test('legacy saved feet overlapping any new resident can exit without moving the save or leaving the patrol corridor',()=>{
 for(const [person,routes] of Object.entries(residentRoutes))for(const [period,r] of routes.entries()){
  const e=entityAt(r.scene,person)!;
  for(let offset=-24;offset<=24;offset+=4)for(let dx=-15;dx<=8;dx+=2){
   const current={x:r.at.x+offset,y:r.at.y},player={x:current.x+dx,y:current.y-6},before={...player};
   const clear=(q:{x:number;y:number})=>walkable(world,r.scene,{x:q.x-8,y:q.y-6})&&!rooms[r.scene].entities.some(other=>other.person&&other.id!==e.id&&residentHere({townMinutes:[540,780,1080][period]},other.person,r.scene)&&Math.hypot(q.x-other.at.x,q.y-other.at.y)<28);
   const next=residentClearOfPlayer(e,current,player,world.actor,clear);observedActor(e,next);assert.deepEqual(player,before);
   assert.ok(!(player.x<next.x+9&&player.x+world.actor.w>next.x-9&&player.y<next.y&&player.y+world.actor.h>next.y-8),`${person}/${r.scene}/${offset}/${dx}`);
  }
 }
});

test('all nine original NPCs retain task examples and follow up consumed life topics in examples and free-dialogue context',async()=>{
 for(const person of Object.keys(oldLife)){
  const room=Object.values(rooms).find(r=>r.entities.some(e=>e.person===person)&&residentHere({townMinutes:540},person,r.id))!;let s=initial('en','fixture');s.scene=room.id;s.known=[person];s.flags=['key','unpacked'];
  const before=questionExamples(s,person,'en');assert.equal(before.candidates.some(q=>q.id.startsWith('resident-')),false);
  s=act(s,person,'talk:life');assert.equal(availableTopics(s,person).some(t=>t.id==='life'),false);assert.ok(s.history.some(h=>h.person===person));
  const after=questionExamples(s,person,'en');assert.deepEqual(after.candidates[0],before.candidates[0]);assert.ok(after.candidates.some(q=>q.id==='resident-0'));assert.notEqual(after.key,before.key);
  const zh=questionExamples(s,person,'zh');assert.notEqual(zh.candidates[1].text,after.candidates[1].text);
  let calls=0;const rt=createRuntime(async(head,a)=>{calls++;const context=dialogueContext(head,person);assert.equal(context.residentLife.learnedInterest,true);assert.deepEqual(context.residentLife.personalDetail,oldLife[person].reply);assert.ok(context.historicalExchanges.some(h=>h.person===person));return {topic:null,reply:['本地回复','Local reply']}});
  const a={...action(s,person,'ask'),payload:{text:after.candidates[1].text}};const response=await rt.prepare(s,a,undefined,{owner:'fixture'});assert.equal(calls,1);assert.equal(response.head.townMinutes,s.townMinutes);assert.equal(response.head.history.at(-1)?.question,after.candidates[1].text);
 }
});
