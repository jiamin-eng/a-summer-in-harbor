import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {initial,applyAction,availableTopics,type Save,type Action} from '../src/story/state';import {rooms,world,people} from '../src/world/data';import {findPath,walkable} from '../src/engine/world';import {residentHere,residentRoutes} from '../src/world/residents';import {validChapelState,chapelRead,chapelActionAvailable} from '../src/story/chapel';import {createExplorationAssembly} from '../server/exploration-assembly';import {runtime} from '../server/runtime';import {brandActivePrepareFailure} from '../server/active-business-failure';
// @ts-expect-error existing frozen SQLite authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const seed=():Save=>({...initial('en',randomUUID()),scene:'chapel',position:rooms.chapel.spawn,townMinutes:780,known:['dani','samira'],flags:['key','unpacked','bag-returned','chapel:visited'],visited:['station','hill','chapel'],items:{key:1,'seed-basil':3},cash:25,energy:73});
const command=(s:Save,id:string,target:string):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:rooms[s.scene].entities.find(e=>e.id===target)!.approach,target,action:id});
const act=(s:Save,id:string,target:string)=>applyAction(s,command(s,id,target)).head;
const resources=(s:Save)=>({id:s.id,items:s.items,cash:s.cash,energy:s.energy,standing:s.standing,relations:s.relations,townMinutes:s.townMinutes});
test('one playable room preserves 22 existing identities plus the new priest and leaves the old outdoor collision/coordinates intact',()=>{
 assert.equal(Object.keys(people).length,23);const entry=rooms.hill.entities.find(e=>e.id==='to-chapel')!;
 assert.ok(findPath(world,'hill',rooms.hill.spawn,entry.approach).length);assert.equal(walkable(world,'hill',entry.approach),true);
 for(const e of rooms.chapel.entities){assert.equal(walkable(world,'chapel',e.approach),true,e.id);assert.ok(findPath(world,'chapel',rooms.chapel.spawn,e.approach).length,e.id)}
 for(const person of ['dani','samira'])for(const minute of [540,720,780,1019,1020,1300]){const locations=Object.keys(rooms).filter(scene=>rooms[scene].entities.some(e=>e.person===person)&&residentHere({townMinutes:minute},person,scene));assert.equal(locations.length,minute===1300?0:1,person+minute);if(minute>=720&&minute<1020)assert.deepEqual(locations,['chapel']);}
 assert.equal(residentRoutes.samira[2].scene,'dock');assert.equal(residentRoutes.dani[0].scene,'garden');assert.equal(residentRoutes.dani[2].scene,'courtyard');
 const old=initial('en','old-local');runtime.assertReadable(old);assert.equal(validChapelState(old),true);assert.deepEqual(old.position,rooms.station.spawn);
});
test('both branches commit one choice/clue with no invented rewards; repeated reading remains available',()=>{
 for(const [id,target,flag] of [['chapel-help-reading','chapel-reading','reading'],['chapel-listen','chapel-seat','listening']]){
 const old=seed(),read=act(old,'chapel-read-notice','chapel-note'),done=act(read,id,target);assert.deepEqual(resources(done),resources(old));assert.ok(done.flags.includes('chapel:participation:'+flag));assert.equal(validChapelState(done),true);assert.equal(done.flags.filter(x=>x==='chapel:meeting-clue').length,1);
 const reread=act(done,'chapel-read-notice','chapel-note'),recall=act(reread,'chapel-recall','chapel-note');assert.deepEqual(resources(recall),resources(done));assert.deepEqual(recall.flags,done.flags);assert.throws(()=>act(recall,id,target),/CHAPEL_ALREADY_JOINED/);assert.throws(()=>act(recall,id==='chapel-listen'?'chapel-help-reading':'chapel-listen',id==='chapel-listen'?'chapel-reading':'chapel-seat'),/CHAPEL_ALREADY_JOINED/);
 assert.equal(chapelActionAvailable(done,id),false);assert.equal(chapelActionAvailable(done,'chapel-recall'),true);assert.match(chapelRead(recall)[1],flag==='reading'?/extra chair/:/few lines/);
 }
});
test('note, actual afternoon presence and introduction gate participation before any commit',()=>{
 const s=seed();assert.throws(()=>act(s,'chapel-help-reading','chapel-reading'),/CHAPEL_READ_NOTE_FIRST/);const read=act(s,'chapel-read-notice','chapel-note');
 for(const minute of [719,1020,1300])assert.throws(()=>act({...read,townMinutes:minute},'chapel-listen','chapel-seat'),/CHAPEL_REHEARSAL_AWAY/);
 assert.throws(()=>act({...read,known:['dani']},'chapel-listen','chapel-seat'),/INTRODUCE_FIRST/);
 assert.equal(chapelActionAvailable({...read,townMinutes:1300},'chapel-help-reading'),true);
 const none=act(read,'travel','exit');assert.equal(none.scene,'hill');assert.equal(none.flags.includes('chapel:completed'),false);assert.equal(none.flags.includes('chapel:meeting-clue'),false);
 assert.equal(availableTopics(read,'dani').filter(t=>t.id==='chapel-welcome').length,1);assert.equal(availableTopics({...read,scene:'garden'},'dani').filter(t=>t.id.startsWith('chapel')).length,0);
});
test('contradictory/partial church saves reject, while old completed stories remain unchanged',()=>{
 const s=seed();for(const flags of [['chapel:completed'],['chapel:participation:reading'],['chapel:notice-read'],['chapel:unknown']]){const x={...s,flags};assert.equal(validChapelState(x),false);assert.throws(()=>runtime.assertReadable(x),/UNSUPPORTED_SAVE/)}
 const valid=act(act(s,'chapel-read-notice','chapel-note'),'chapel-help-reading','chapel-reading');assert.equal(validChapelState({...valid,flags:[...valid.flags,'chapel:participation:listening']}),false);const old={...initial('en','old-finished'),flags:['market-open','bridge-fixed','route-open']};const copy=structuredClone(old);runtime.assertReadable(old);assert.deepEqual(old,copy);
 for(const code of ['CHAPEL_ALREADY_JOINED','CHAPEL_REHEARSAL_AWAY','CHAPEL_READ_NOTE_FIRST'])assert.equal((brandActivePrepareFailure(Error(code)) as any).terminal,true);assert.equal((brandActivePrepareFailure(Error('UNSUPPORTED_SAVE')) as any).terminal,undefined);
});
test('real SQLite authority replay, CAS, restore and owner isolation keep a single remembered outcome',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'chapel-local-')),path=join(dir,'local.sqlite'),worldId=randomUUID(),owner='synthetic-chapel-'+randomUUID();let calls=0;
 const open=()=>openAsyncSqliteAuthorityStore({path,worldId,gameId:'chapel-local',environment:'test'});let store=open();
 const assembly=createExplorationAssembly({now:()=>100000,initial:(l:any,id:string)=>({...seed(),id,locale:l}),resolveDialogue:async()=>{calls++;throw Error('NO_PAID_MODEL')}});let authority=new AsyncSessionAuthority(store,assembly.runtime);
 try{let s=await authority.create(owner,randomUUID(),'en');const notice=command(s,'chapel-read-notice','chapel-note');s=(await authority.action(owner,s.id,notice)).head;const choice=command(s,'chapel-help-reading','chapel-reading');const before=structuredClone(s),r=await authority.action(owner,s.id,choice);s=r.head;const replay=await authority.action(owner,s.id,choice);assert.deepEqual(replay,r);assert.deepEqual(resources(s),resources(before));await assert.rejects(()=>authority.action(owner,s.id,{...command(before,'chapel-listen','chapel-seat'),action_id:randomUUID()}),/VERSION_CONFLICT/);await store.close();store=open();authority=new AsyncSessionAuthority(store,assembly.runtime);const restored=await authority.get(owner,s.id);assert.deepEqual(restored,s);assert.ok(restored.flags.includes('chapel:participation:reading'));await assert.rejects(()=>authority.get('other-synthetic',s.id));assert.equal(calls,0);const recall=await authority.action(owner,s.id,command(s,'chapel-recall','chapel-note'));assert.equal(recall.head.flags.filter((x:string)=>x==='chapel:meeting-clue').length,1);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});


test('church introduction is the existing identity, and a locked participation survives ordinary zero-cost doors',()=>{
 let s={...seed(),known:[] as string[],movingClock:{version:2 as const,millisecondsPerMinute:4000 as const,remainderMs:0}};
 const samira=rooms.chapel.entities.find(e=>e.person==='samira')!;s=applyAction(s,{...command(s,'introduce',samira.id),actorPosition:samira.at}).head as typeof s;assert.deepEqual(s.known,['samira']);assert.match(s.history.at(-1)!.text[1],/school/);
 s=act(act(s,'chapel-read-notice','chapel-note'),'chapel-listen','chapel-seat') as typeof s;const minute=s.townMinutes;
 s=act(s,'travel','exit') as typeof s;assert.equal(s.scene,'hill');assert.deepEqual(s.position,{x:502,y:397});s=act(s,'travel','to-chapel') as typeof s;assert.equal(s.scene,'chapel');assert.equal(s.townMinutes,minute);assert.ok(s.flags.includes('chapel:participation:listening'));assert.equal(availableTopics(s,'samira').some(t=>t.id==='chapel-memory'),true);
});
