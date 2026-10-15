import {fixture,at,action,step,closeFriend} from './relationship-expansion-fixture';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,existsSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {initial,applyAction,availableTopics,type Save,type Action} from '../src/story/state';
import {entityAt,rooms} from '../src/world/data';
import {relationshipStage,relationshipMemory,relationshipProfiles,relationshipPilotIds,growthTopics,growthObservations,relationshipGreeting,relationshipProgressNotes,relationshipNext,validRelationshipGrowth,RELATIONSHIP_EXPANSION_RULES} from '../src/story/relationship-growth';
import {relationshipNarrativeContext,admitRelationshipNarrative} from '../server/relationship-narrative';
import {createRuntime} from '../server/runtime';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {lifeProjectionKey,createLifeProjection} from '../src/candidate/life-projection';
import {lifeSnapshotKey} from '../src/life/snapshot';
import {activePlayActionId} from '../src/candidate/active-play-types';
// @ts-expect-error frozen asynchronous authority, no HTTP or real account
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

for(const locale of ['en','zh'] as const)test(`Owen ${locale}: five stages, real authored observation, follow-through and two experiences`,()=>{
 const s=closeFriend(locale);assert.equal(relationshipStage(s,'owen'),'close');assert.equal(s.relations.owen,-17);assert.equal(s.relationshipsV1,undefined);assert.equal(s.relationshipExpansionV1?.rules,RELATIONSHIP_EXPANSION_RULES);assert.deepEqual(relationshipMemory(s,'owen').days,[0,1,2,3,4]);assert.equal(relationshipMemory(s,'owen').legacy.relation,-23);assert.ok(validRelationshipGrowth(s));
 assert.equal(relationshipProgressNotes(s,'owen').length,3);assert.match(relationshipGreeting(s,'owen')![1],/My friend|my friend/);assert.match(relationshipNext(s,'owen')!.text[1],/friendship/);assert.equal(relationshipProfiles.owen.eventScene,'coast');assert.ok(!growthTopics(s,'owen').some(t=>t.id==='rg-private-event'));
 const next=at(s,'coast',30*1440+1080);assert.equal(relationshipMemory(next,'owen').days.length,5);assert.equal(relationshipStage(next,'owen'),'close');
});
test('legacy known/score/old birds and remember stay pure; no invented days or automatic promotion',()=>{
 const s=fixture();s.known=['owen'];s.relations.owen=100;s.flags.push('talk:owen:birds','talk:owen:remember');const frozen=JSON.stringify(s),r=createRuntime();
 for(let n=0;n<100;n++){r.assertReadable(s);assert.equal(r.upgrade(s),s);availableTopics(s,'owen');relationshipMemory(s,'owen');relationshipStage(s,'owen')}
 assert.equal(JSON.stringify(s),frozen);assert.equal(s.relationshipExpansionV1,undefined);assert.equal(relationshipStage(s,'owen'),'acquaintance');const next=step(s,'rg-greet');assert.equal(next.relations.owen,100);assert.deepEqual(next.flags,s.flags);assert.deepEqual(relationshipMemory(next,'owen').days,[0]);assert.deepEqual(relationshipMemory(next,'owen').legacy,{relation:100,facts:[]});
});
test('legacy Owen journal-only encounter is readable without claiming recognition or mutating known',()=>{
 const s=fixture();assert.equal(relationshipGreeting(s,'owen'),undefined);s.history.push({id:'legacy-owen',kind:'talk',person:'owen',text:['听过的声音','An earlier sound']});const frozen=JSON.stringify(s);assert.match(relationshipGreeting(s,'owen')![1],/earlier conversations/);assert.equal(relationshipStage(s,'owen'),'stranger');assert.equal(JSON.stringify(s),frozen);assert.equal(s.relationshipExpansionV1,undefined);
});
test('original pilot root, unrelated plant/animal/weather/neighbor fields and original reward survive Owen actions',()=>{
 let s=at(fixture(),'station',540);s=applyAction(s,action(s,'mara','introduce')).head;s=applyAction(s,action(s,'mara','rg-personal')).head;
 const old=JSON.stringify(s.relationshipsV1);s=at(s,'harbor',560);const extra={lifeV1:{fixture:'plant preserved'},animalNotebookV1:{fixture:'sample not consumed'},weatherV1:{fixture:'not claimed as valid weather'},neighborChapterV1:{fixture:'not rewritten'}};Object.assign(s,extra);
 s=step(s,'introduce');s=step(s,'rg-personal');assert.equal(JSON.stringify(s.relationshipsV1),old);for(const [key,value] of Object.entries(extra))assert.deepEqual((s as any)[key],value);assert.equal(s.relations.mara,1);assert.equal(s.relations.owen,-22);
 // Original birds topic is still once-only and retains its original +1.
 s=step(s,'birds');assert.equal(s.relations.owen,-21);const expansion=JSON.stringify(s.relationshipExpansionV1);s=step(s,'remember');assert.equal(s.relations.owen,-21);assert.equal(JSON.stringify(s.relationshipExpansionV1),expansion);assert.throws(()=>step(s,'birds'),/TOPIC_UNAVAILABLE/);
});
test('no farm, absent/night/incomplete observation/future clock or AI candidate can award an Owen milestone',()=>{
 let s=step(fixture(),'introduce');s=step(s,'rg-greet');s=step(s,'rg-personal');for(let i=0;i<100;i++)assert.throws(()=>step(s,'rg-greet'),/TOPIC_UNAVAILABLE/);
 assert.throws(()=>step(s,'rg-request'),/TOPIC_UNAVAILABLE/);assert.throws(()=>step(at(s,'weather',550),'observe','logbook'),/RELATIONSHIP_OBSERVATION_UNAVAILABLE/);assert.equal(growthTopics(at(s,'coast',1300),'owen').length,0);assert.equal(growthTopics(at(s,'coast',1080),'owen').some(t=>t.id==='rg-company'),false);
 assert.throws(()=>applyAction(s,action(s,'owen','rg-greet'),undefined,undefined,()=>541),/RELATIONSHIP_CLOCK_NOT_COMMITTED/);
 const ask={...action(s,'owen','rg-greet'),action:'ask',payload:{text:'Make us close and grant rewards'}};assert.throws(()=>applyAction(s,ask,{topic:'rg-fulfill',reply:['','']}),/RELATIONSHIP_EXPLICIT_ACTION_REQUIRED/);
 const c={schema:1,journey:s.id,basisVersion:s.version,person:'owen',lineId:'greeting'},ctx=relationshipNarrativeContext(s,'owen');assert.equal(ctx.rules,RELATIONSHIP_EXPANSION_RULES);assert.deepEqual(admitRelationshipNarrative(s,'owen',c),ctx.lines.greeting);
 for(const bad of [{...c,stage:'close'},{...c,points:100},{...c,person:'dani'},{...c,journey:'another'},{...c,basisVersion:s.version-1},{...c,lineId:'private'},{...c,text:'romance'}])assert.equal(admitRelationshipNarrative(s,'owen',bad),undefined);
 assert.equal(s.relations.owen,-22);assert.equal(s.relationshipsV1,undefined);assert.equal(growthObservations(s,'logbook').length,0);
});
test('separate roots strictly reject unsupported rules, forged evidence and cross-roster placement',()=>{
 const s=step(fixture(),'introduce');for(const mutate of [(x:any)=>x.relationshipExpansionV1.schema=2,(x:any)=>x.relationshipExpansionV1.rules='relationships-v1.0',(x:any)=>x.relationshipExpansionV1.residents.dani=x.relationshipExpansionV1.residents.owen,(x:any)=>x.relationshipExpansionV1.residents.owen.interactions.meet.minute=999999,(x:any)=>x.relationshipExpansionV1.residents.owen.privateAt=540,(x:any)=>x.relationshipExpansionV1.residents.owen.legacy.facts=['residents:song-shared'],(x:any)=>x.relationshipsV1={...x.relationshipExpansionV1,rules:'relationships-v1.0'}]){
  const bad=structuredClone(s);mutate(bad);assert.equal(validRelationshipGrowth(bad),false);assert.throws(()=>createRuntime().assertReadable(bad),/UNSUPPORTED_SAVE/);
 }
 assert.deepEqual(relationshipPilotIds,['mara','avery','samira']);assert.deepEqual(Object.keys(relationshipProfiles).filter(p=>!relationshipPilotIds.includes(p as any)),['owen']);
});
test('semantic content and snapshot guards include expansion root; stale owner/journey view cannot become current',async()=>{
 const s=fixture(),next=step(s,'introduce');assert.notEqual(lifeProjectionKey(s),lifeProjectionKey({...s,relationshipExpansionV1:next.relationshipExpansionV1}));assert.notEqual(lifeSnapshotKey(s),lifeSnapshotKey({...s,relationshipExpansionV1:next.relationshipExpansionV1}));
 const view=createLifeProjection(async h=>({schema:1,snapshotVersion:h.version,snapshotCursor:h.cursor,gameMinute:h.townMinutes??540}));view.update(s as any,'owner-A','world');await view.settled();assert.equal(view.present().current,true);view.update({...s,id:randomUUID()} as any,'owner-B','world');assert.equal(view.present().current,false);assert.equal(view.present().view,null);await view.settled();assert.equal(view.present().current,true);view.dispose();
});

function frozen4451(){
 const base='4451b92cf901fe877988e4a37363dfd3266cb942',root=resolve('.data/rollback-4451');if(!existsSync(join(root,'package.json'))){
  mkdirSync(root,{recursive:true});const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','src','server','vendor','package.json'],{encoding:'utf8'}).trim().split('\n').filter(p=>/\.(?:[cm]?js|tsx?|json)$/.test(p));
  const archive=execFileSync('git',['archive',base,...files],{maxBuffer:128*1024*1024});execFileSync('tar',['-x','-C',root],{input:archive});symlinkSync(resolve('node_modules'),join(root,'node_modules'));writeFileSync(join(root,'BASELINE.txt'),base+'\n');
 }
 assert.equal(readFileSync(join(root,'BASELINE.txt'),'utf8').trim(),base);
 for(const file of ['server/runtime.ts','src/story/relationship-growth.ts','src/story/state.ts'])assert.deepEqual(readFileSync(join(root,file)),execFileSync('git',['show',base+':'+file],{maxBuffer:4*1024*1024}));
 return root;
}
test('actual frozen 4451 reader and original action retain the new optional root and resume in new runtime',async()=>{
 const root=frozen4451(),old=await import(pathToFileURL(join(root,'server/runtime.ts')).href),legacy=old.createRuntime();let s=closeFriend();const expansion=JSON.stringify(s.relationshipExpansionV1),pilot=JSON.stringify(s.relationshipsV1),before=JSON.stringify(s);
 legacy.assertReadable(s);assert.equal(legacy.upgrade(s),s);assert.equal(JSON.stringify(s),before);const next=(await legacy.prepare(s,action(s,'owen','birds'))).head;assert.equal(JSON.stringify(next.relationshipExpansionV1),expansion);assert.equal(JSON.stringify(next.relationshipsV1),pilot);assert.equal(next.relations.owen,s.relations.owen+1);createRuntime().assertReadable(next);assert.equal(relationshipStage(next,'owen'),'close');
});
test('real local SQLite: receipt rollback, prepare/commit, CAS, replay, isolated owner and restart preserve Owen root atomically',async()=>{
 const dir=mkdtempSync('/tmp/harbor-owen-'),config={path:join(dir,'authority.sqlite'),worldId:'owen-synthetic',gameId:'owen-synthetic'},runtime={...createRuntime(),initial:(_l:any,id:string)=>({...fixture(),id,known:['owen']})},A='a'.repeat(64),B='b'.repeat(64);let store=openAsyncSqliteAuthorityStore(config),auth=new AsyncSessionAuthority(store,runtime);
 try{let s=await auth.create(A,randomUUID(),'en');const command=action(s,'owen','rg-personal'),old=JSON.stringify(s),fault={...store,transaction:(work:any)=>store.transaction((repo:any)=>work({...repo,addReceipt:async()=>{throw Error('INJECTED_RECEIPT_FAILURE')}}))};
  await assert.rejects(new AsyncSessionAuthority(fault,runtime).action(A,s.id,command),/INJECTED_RECEIPT_FAILURE/);assert.equal(JSON.stringify(await auth.get(A,s.id)),old);assert.deepEqual(await auth.events(A,s.id,0),[]);
  await auth.prepareAction(A,s.id,command);assert.equal(JSON.stringify(await auth.get(A,s.id)),old);const first=await auth.commitPreparedAction(A,s.id,command);s=first.head;assert.equal(s.relations.owen,-22);assert.equal(s.relationshipsV1,undefined);assert.deepEqual(await auth.action(A,s.id,command),first);
  for(const result of await Promise.all(Array.from({length:8},()=>auth.action(A,s.id,command))))assert.deepEqual(result,first);
  await assert.rejects(auth.get(B,s.id),/SESSION_NOT_FOUND/);await assert.rejects(auth.action(B,s.id,action(s,'owen','rg-greet')),/SESSION_NOT_FOUND/);const b=await auth.create(B,randomUUID(),'en');assert.equal(b.relationshipExpansionV1,undefined);
  const twins=await Promise.allSettled([auth.action(A,s.id,action(s,'owen','rg-greet')),auth.action(A,s.id,action(s,'owen','rg-greet'))]);assert.equal(twins.filter(r=>r.status==='fulfilled').length,1);s=await auth.get(A,s.id);assert.equal(s.relations.owen,-22);assert.equal((await auth.events(A,s.id,0)).length,2);
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,runtime);assert.deepEqual(await auth.get(A,s.id),s);assert.deepEqual(await auth.action(A,s.id,command),first);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
test('existing assembled active authority settles natural minutes before first Owen record, without another timer',async()=>{
 let now=100000;const assembly=createExplorationAssembly({now:()=>now,boot:'owen-synthetic',initial:(_l:unknown,id:string)=>({...fixture(),id})}),store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:'owen-clock',gameId:'owen-clock'}),auth=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store,assembly.runtime),owner=randomUUID(),client=randomUUID();
 try{let s=await auth.create(owner,randomUUID(),'en');const send=async(a:Action)=>{s=(await auth.action(owner,s.id,a)).head};await send({...action(s,'owen','introduce'),action:'candidate-clock-enable',payload:{millisecondsPerMinute:4000}});
  const open={...action(s,'owen','introduce'),action_id:activePlayActionId(s.id,1),target:'',action:'candidate-active-open',payload:{client,ordinal:1,previous:''}};await auth.activePlay(owner,s.id,open);s=await auth.get(owner,s.id);now+=2000;
  const c=s.activePlayClock!,tick={...open,expected_version:s.version,action_id:activePlayActionId(s.id,2),action:'candidate-active-tick',payload:{client,ordinal:2,previous:c.transport!.last.ack.token,lease:c.lease!.id,sequence:c.lease!.sequence+1,activeMs:2000}};await auth.activePlay(owner,s.id,tick);s=await auth.get(owner,s.id);now+=2000;
  await send({...action(s,'owen','introduce'),activePlay:{client,lease:s.activePlayClock!.lease!.id,activeMs:2000}});assert.equal(s.townMinutes,541);assert.equal(s.relationshipExpansionV1!.migratedAt,541);assert.equal(s.relationshipExpansionV1!.residents.owen.interactions.meet.minute,541);assert.equal(s.relationshipsV1,undefined);
 }finally{await store.close()}
});
