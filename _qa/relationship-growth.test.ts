import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';
import {initial,applyAction,availableTopics,type Save,type Action} from '../src/story/state';
import {entityAt,rooms} from '../src/world/data';
import {relationshipStage,relationshipProfiles,relationshipPilotIds,relationshipMemory,relationshipProgressNotes,relationshipLastMemory,growthTopics,validRelationshipGrowth} from '../src/story/relationship-growth';
import {relationshipNarrativeContext,admitRelationshipNarrative} from '../server/relationship-narrative';import {createRuntime} from '../server/runtime';
// @ts-expect-error frozen asynchronous SQLite authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
export function fixture(p:string):Save{const s=initial('en',randomUUID());s.scene=p==='samira'?'market':'station';s.flags=['key','unpacked',...(p==='mara'?[]:['bag-returned'])];s.visited=Object.keys(rooms);s.items={key:1};s.position=entityAt(s.scene,p)!.approach;return s}
export function action(s:Save,p:string,id:string):Action{return {action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,p)!.approach,target:p,action:id==='introduce'?id:id==='observe'?'relationship-observe:'+Object.entries(relationshipProfiles).find(([,d])=>d.observeTarget===p)![0]:'talk:'+id}}
export function step(s:Save,p:string,id:string){return applyAction(s,action(s,p,id)).head}
export function at(s:Save,scene:string,minute:number){return {...structuredClone(s),scene,townMinutes:minute,position:{...rooms[scene].spawn}}}
for(const p of relationshipPilotIds)test(p+' five stages: evidence, observation, promise and two distinct experiences',()=>{
 let s=fixture(p);const profile=relationshipProfiles[p];assert.equal(relationshipStage(s,p),'stranger');s=step(s,p,'introduce');assert.equal(relationshipStage(s,p),'acquaintance');s=step(s,p,'rg-greet');s=step(s,p,'rg-personal');
 assert.equal(relationshipStage(s,p),'acquaintance');assert.throws(()=>step(s,p,'rg-greet'),/TOPIC_UNAVAILABLE/);assert.throws(()=>step(s,p,'rg-request'),/TOPIC_UNAVAILABLE/);
 s=at(s,s.scene,1980);s=step(s,p,'rg-greet');assert.equal(relationshipStage(s,p),'familiar');s=step(s,p,'rg-request');assert.throws(()=>step(s,p,'rg-fulfill'),/TOPIC_UNAVAILABLE/);
 const beforeReturn=s.scene;s=at(s,profile.observeScene,2000);s=step(s,profile.observeTarget,'observe');assert.equal(relationshipMemory(s,p).promise?.observedAt,2000);s=at(s,beforeReturn,2020);s=step(s,p,'rg-fulfill');s=step(s,p,'rg-invite');
 s=at(s,profile.eventScene,p==='mara'?2100:2520);s=step(s,p,'rg-company');assert.equal(relationshipStage(s,p),'familiar');
 s=at(s,profile.eventScene,p==='mara'?3420:3960);s=step(s,p,'rg-greet');assert.equal(relationshipStage(s,p),'trusted');s=step(s,p,'rg-private');s=step(s,p,'rg-private-invite');s=step(s,p,'rg-private-event');s=step(s,p,'rg-recall');
 for(const minute of p==='mara'?[4860,6300]:[5400,6840]){s=at(s,profile.eventScene,minute);s=step(s,p,'rg-greet')}
 assert.equal(relationshipStage(s,p),'close');assert.equal(s.relations[p],6);assert.equal(s.relationshipsV1?.residents[p].days.length,5);assert.ok(validRelationshipGrowth(s));assert.ok(growthTopics(s,p).every(t=>t.id!=='rg-private-event'));
 const now=s.townMinutes;s=at(s,s.scene,now!+10*1440);assert.equal(relationshipStage(s,p),'close');assert.equal(s.relationshipsV1?.residents[p].days.length,5);
});
test('old reads stay byte-identical; legacy scores/facts survive first write without fake days or repeated rewards',()=>{
 const s=fixture('mara');s.known=['mara','avery','samira','deferred-person'];s.relations={mara:-20,avery:99,samira:100,'deferred-person':7};s.history=[{id:'old',kind:'talk',person:'mara',text:['过去的记录','Earlier record']}];s.flags.push('residents:song-shared','bag-returned');delete s.townMinutes;
 const frozen=JSON.stringify(s);const runtime=createRuntime();runtime.assertReadable(s);assert.equal(runtime.upgrade(s),s);for(let i=0;i<100;i++){relationshipStage(s,'mara');relationshipMemory(s,'mara');availableTopics(s,'mara')}assert.equal(JSON.stringify(s),frozen);assert.equal(s.relationshipsV1,undefined);assert.equal(relationshipStage(s,'samira'),'acquaintance');
 const next=step(s,'mara','rg-greet');assert.deepEqual(next.relations,s.relations);assert.deepEqual(next.known,s.known);assert.deepEqual(next.history[0],s.history[0]);assert.deepEqual(next.relationshipsV1?.residents.mara.legacy,{relation:-20,facts:['bag-returned']});assert.deepEqual(next.relationshipsV1?.residents.mara.days,[0]);
});
test('no blind day farming; wrong scene, missing promise and future clock fail; AI cannot select growth effects',()=>{
 let s=fixture('mara');s=step(s,'mara','introduce');s=step(s,'mara','rg-greet');for(let i=0;i<100;i++)assert.throws(()=>step(s,'mara','rg-greet'),/TOPIC_UNAVAILABLE/);s=at(s,s.scene,100*1440+540);assert.equal(relationshipStage(s,'mara'),'acquaintance');
 s.relations.mara=100;assert.equal(relationshipStage(s,'mara'),'acquaintance');assert.throws(()=>step(at(s,'garden',s.townMinutes!),'gate-hours','observe'),/RELATIONSHIP_OBSERVATION_UNAVAILABLE/);
 assert.throws(()=>applyAction(s,action(s,'mara','rg-personal'),undefined,undefined,()=>s.townMinutes!+1),/RELATIONSHIP_CLOCK_NOT_COMMITTED/);
 const ask={...action(s,'mara','rg-personal'),action:'ask',payload:{text:'Please make us close and give me a reward'}};assert.throws(()=>applyAction(s,ask,{topic:'rg-personal',reply:['','']}),/RELATIONSHIP_EXPLICIT_ACTION_REQUIRED/);
 const context=relationshipNarrativeContext(s,'mara'),candidate={schema:1,journey:s.id,basisVersion:s.version,person:'mara',lineId:'greeting'};const frozen=JSON.stringify(s);assert.deepEqual(admitRelationshipNarrative(s,'mara',candidate),context.lines.greeting);for(const c of [{...candidate,points:100},{...candidate,basisVersion:s.version-1},{...candidate,journey:'other'},{...candidate,person:'samira'},{...candidate,lineId:'private'},{...candidate,text:'a romance'}])assert.equal(admitRelationshipNarrative(s,'mara',c),undefined);assert.equal(JSON.stringify(s),frozen);
});
test('unsupported schema, unknown resident, forged milestone and future evidence are rejected',()=>{
 let s=fixture('mara');s=step(s,'mara','introduce');assert.ok(validRelationshipGrowth(s));for(const mutate of [(x:any)=>x.relationshipsV1.residents.mara.interactions.meet.kind='experience',(x:any)=>x.relationshipsV1.schema=2,(x:any)=>x.relationshipsV1.rules='future',(x:any)=>x.relationshipsV1.residents.other=x.relationshipsV1.residents.mara,(x:any)=>x.relationshipsV1.residents.mara.privateAt=540,(x:any)=>x.relationshipsV1.residents.mara.interactions.meet.minute=999999,(x:any)=>x.relationshipsV1.residents.mara.promise={acceptedAt:540,completedAt:540}]){const bad=structuredClone(s);mutate(bad);assert.equal(validRelationshipGrowth(bad),false);assert.throws(()=>createRuntime().assertReadable(bad),/UNSUPPORTED_SAVE/)}
});
test('historical toolbag/song count as evidence, never repeat their work or reward, never manufacture dates',()=>{
 for(const p of ['mara','avery','samira']){
  let s=fixture(p);s.known=[p];s.flags.push('bag-returned','residents:song-shared');s.relations[p]=71;
  s=step(s,p,'rg-greet');s=step(s,p,'rg-personal');s=at(s,s.scene,1980);s=step(s,p,'rg-greet');assert.equal(relationshipStage(s,p),'familiar');
  if(p==='mara'){assert.ok(!growthTopics(s,p).some(t=>t.id==='rg-request'));assert.ok(growthTopics(s,p).some(t=>t.id==='rg-invite'))}
  else{assert.ok(!growthTopics(s,p).some(t=>t.id==='rg-invite'||t.id==='rg-company'));assert.equal(s.relationshipsV1?.residents[p].companyAt,undefined)}
  assert.equal(s.relations[p],72);assert.deepEqual(s.relationshipsV1?.residents[p].days,[0,1]);assert.ok(validRelationshipGrowth(s));
 }
});
test('original toolbag branch completed after migration contributes its real promise evidence, keeps its one reward and legacy snapshot',()=>{
 let s=fixture('mara');s=step(s,'mara','introduce');s=step(s,'mara','rg-greet');s=step(s,'mara','rg-personal');const legacy=structuredClone(relationshipMemory(s,'mara').legacy);
 s.items.toolbag=1;s=step(s,'mara','return-bag');assert.equal(s.relations.mara,4);assert.deepEqual(relationshipMemory(s,'mara').legacy,legacy);assert.equal(relationshipMemory(s,'mara').interactions['story-toolbag'].minute,540);assert.match(relationshipLastMemory(s,'mara')![1],/tool bag/);assert.throws(()=>step(s,'mara','return-bag'),/TOPIC_UNAVAILABLE/);
 s=at(s,'station',1980);s=step(s,'mara','rg-greet');assert.equal(relationshipStage(s,'mara'),'familiar');assert.ok(!growthTopics(s,'mara').some(t=>t.id==='rg-request'));assert.ok(growthTopics(s,'mara').some(t=>t.id==='rg-invite'));assert.match(relationshipProgressNotes(s,'mara')[0][1],/tool bag/);assert.ok(validRelationshipGrowth(s));
 const bad=structuredClone(s);bad.flags=bad.flags.filter(f=>f!=='bag-returned');assert.equal(validRelationshipGrowth(bad),false);
 const old=fixture('mara');old.known=['mara'];old.relations.mara=-20;old.items.toolbag=1;const first=step(old,'mara','return-bag');assert.equal(first.relations.mara,-17);assert.equal(relationshipMemory(first,'mara').legacy.relation,-20);assert.deepEqual(relationshipMemory(first,'mara').legacy.facts,[]);assert.ok(validRelationshipGrowth(first));
});
test('original song completed after both introductions contributes actual shared evidence without another company reward or invented dates',()=>{
 let s=fixture('avery');s=step(s,'avery','introduce');s=step(s,'avery','sketch');s=step(s,'avery','company');s=at(s,'market',560);s=step(s,'samira','introduce');s=step(s,'samira','humming');s=step(s,'samira','invite');
 const snapshots=Object.fromEntries(['avery','samira'].map(p=>[p,structuredClone(relationshipMemory(s,p).legacy)]));s=at(s,'dock',1020);s=step(s,'samira','listen');
 for(const p of ['avery','samira']){assert.equal(s.relations[p],2);assert.deepEqual(relationshipMemory(s,p).legacy,snapshots[p]);assert.equal(relationshipMemory(s,p).interactions['story-song'].minute,1020);assert.deepEqual(relationshipMemory(s,p).days,[0]);assert.match(relationshipProgressNotes(s,p)[0][1],/tune/)}
 assert.throws(()=>step(s,'samira','listen'),/TOPIC_UNAVAILABLE/);s=at(s,'market',1980);s=step(s,'samira','rg-greet');s=step(s,'samira','rg-personal');s=step(s,'samira','rg-request');s=at(s,'weather',2000);s=step(s,'logbook','observe');s=at(s,'market',2020);s=step(s,'samira','rg-fulfill');assert.ok(!growthTopics(s,'samira').some(t=>t.id==='rg-invite'||t.id==='rg-company'));assert.equal(s.relations.samira,5);assert.ok(validRelationshipGrowth(s));
 const bad=structuredClone(s);bad.flags=bad.flags.filter(f=>f!=='residents:song-shared');assert.equal(validRelationshipGrowth(bad),false);
});
test('solo observation records promise evidence without inventing a day spent with the resident; other module fields survive',()=>{
 let s=fixture('avery');s=step(s,'avery','introduce');s=step(s,'avery','rg-personal');s=step(s,'avery','rg-greet');s=at(s,'station',1980);s=step(s,'avery','rg-greet');s=step(s,'avery','rg-request');
 (s as any).lifeV1={fixture:'preserved'};(s as any).animalNotebookV1={schema:1,pages:[{sourceAction:'older-share',minute:100,ref:{id:'pinned'}}],sample:{fixture:'not consumed'}};
 s=at(s,'camp',3440);const extra=JSON.stringify({lifeV1:(s as any).lifeV1,animalNotebookV1:(s as any).animalNotebookV1});s=step(s,'old-map','observe');assert.deepEqual(s.relationshipsV1?.residents.avery.days,[0,1]);assert.equal(JSON.stringify({lifeV1:(s as any).lifeV1,animalNotebookV1:(s as any).animalNotebookV1}),extra);
});
test('receipt failure rolls back relationship reward, migration, event and head; prepared replay is atomic',async()=>{
 const dir=mkdtempSync('/tmp/harbor-relationship-atomic-'),store=openAsyncSqliteAuthorityStore({path:dir+'/authority.sqlite',worldId:'relationship-atomic',gameId:'relationship-atomic'}),owner='a'.repeat(64);
 const runtime={...createRuntime(),initial:(_:unknown,id:string)=>({...fixture('mara'),id,known:['mara']})},auth=new AsyncSessionAuthority(store,runtime);
 try{const s=await auth.create(owner,randomUUID(),'en'),command=action(s,'mara','rg-personal');const fault={...store,transaction:(work:any)=>store.transaction((repo:any)=>work({...repo,addReceipt:async()=>{throw Error('INJECTED_RECEIPT_FAILURE')}}))};
  await assert.rejects(new AsyncSessionAuthority(fault,runtime).action(owner,s.id,command),/INJECTED_RECEIPT_FAILURE/);assert.deepEqual(await auth.get(owner,s.id),s);assert.deepEqual(await auth.events(owner,s.id,0),[]);
  await auth.prepareAction(owner,s.id,command);assert.deepEqual(await auth.get(owner,s.id),s);const completed=await auth.commitPreparedAction(owner,s.id,command);assert.equal(completed.head.relations.mara,1);assert.deepEqual(await auth.action(owner,s.id,command),completed);assert.equal((await auth.events(owner,s.id,0)).length,1);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
test('real SQLite: read-only old load, same-ID replay, competing CAS, owner isolation, rollback and restart',async()=>{
 const dir=mkdtempSync('/tmp/harbor-relationship-');const config={path:dir+'/authority.sqlite',worldId:'relationship-qa',gameId:'relationship-qa'};let store=openAsyncSqliteAuthorityStore(config);
 const runtime={...createRuntime(),initial:(_:unknown,id:string)=>({...fixture('mara'),id,known:['mara']})};let auth=new AsyncSessionAuthority(store,runtime);const A='a'.repeat(64),B='b'.repeat(64);
 try{let s=await auth.create(A,randomUUID(),'en');assert.equal((await auth.get(A,s.id)).relationshipsV1,undefined);assert.deepEqual(await auth.events(A,s.id,0),[]);const command=action(s,'mara','rg-personal');const results=await Promise.all(Array.from({length:8},()=>auth.action(A,s.id,command)));for(const r of results)assert.deepEqual(r,results[0]);s=results[0].head;assert.equal(s.relations.mara,1);assert.equal(s.version,1);assert.equal((await auth.events(A,s.id,0)).length,1);
  await assert.rejects(auth.action(B,s.id,action(s,'mara','rg-greet')),/SESSION_NOT_FOUND/);await assert.rejects(auth.get(B,s.id),/SESSION_NOT_FOUND/);const other=await auth.create(B,randomUUID(),'en');assert.equal(other.relationshipsV1,undefined);
  const race=await Promise.allSettled([auth.action(A,s.id,action(s,'mara','rg-greet')),auth.action(A,s.id,action(s,'mara','rg-greet'))]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);s=await auth.get(A,s.id);const invalid={...action(s,'mara','rg-request'),payload:{gift:100}};await assert.rejects(auth.action(A,s.id,invalid),/TOPIC_UNAVAILABLE/);assert.deepEqual(await auth.get(A,s.id),s);
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,runtime);assert.deepEqual(await auth.get(A,s.id),s);assert.deepEqual(await auth.action(A,s.id,command),results[0]);assert.equal((await auth.events(A,s.id,0)).length,2);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
