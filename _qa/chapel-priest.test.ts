import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {people,rooms,world} from '../src/world/data';
import {findPath,walkable} from '../src/engine/world';
import {residentHere,residentActivity,residentRoutes,residentClearOfPlayer} from '../src/world/residents';
import {chapelPriestId} from '../src/world/chapel-priest';
import {initial,applyAction,availableTopics,type Save,type Action} from '../src/story/state';
import {validPriestState,priestContext} from '../src/story/chapel-priest';
import {validChapelState} from '../src/story/chapel';
import {knownPeople,relationshipStory} from '../src/story/relationships';
import {residentGuide} from '../src/story/resident-guide';
import {lifeExamples,lifeContext} from '../src/story/resident-life';
import {runtime} from '../server/runtime';
import {createExplorationAssembly} from '../server/exploration-assembly';
// @ts-expect-error existing frozen authority; own synthetic SQLite only
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

const id=chapelPriestId;
const seed=(minute=540):Save=>({...initial('en','synthetic-priest-'+randomUUID()),scene:'chapel',position:{...rooms.chapel.spawn},townMinutes:minute,flags:['chapel:visited'],visited:['station','hill','chapel']});
const command=(s:Save,verb:string):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{...rooms[s.scene].entities.find(e=>e.person===id)!.approach},target:id,action:verb});
const act=(s:Save,verb:string)=>applyAction(s,command(s,verb)).head;
const start=()=>act(seed(),'introduce');
const ready=()=>act(act(start(),'talk:priest-life'),'talk:priest-table');
const resources=(s:Save)=>({cash:s.cash,items:s.items,energy:s.energy,standing:s.standing,townMinutes:s.townMinutes,awakeMinutes:s.awakeMinutes,landV1:s.landV1,plots:s.plots});

test('one additional identity uses the existing day periods and has no duplicate scene actor',()=>{
 assert.equal(Object.keys(people).length,23);
 for(const [minute,scene] of [[359,null],[360,'chapel'],[719,'chapel'],[720,'hill'],[1019,'hill'],[1020,'chapel'],[1259,'chapel'],[1260,null],[1440+540,'chapel']] as const){
  const found=Object.values(rooms).filter(r=>r.entities.some(e=>e.person===id)&&residentHere({townMinutes:minute},id,r.id)).map(r=>r.id);
  assert.deepEqual(found,scene?[scene]:[]);
 }
 for(const scene of ['chapel','hill'])assert.equal(rooms[scene].entities.filter(e=>e.person===id).length,1);
 assert.equal(residentRoutes.samira[1].scene,'chapel');assert.equal(residentRoutes.dani[1].scene,'chapel');
 assert.equal(residentHere({townMinutes:780},'samira','chapel'),true);
 assert.equal(residentHere({townMinutes:780},'dani','chapel'),true);
});
test('both authored approaches and full stroll corridors are reachable without moving existing doors',()=>{
 for(const scene of ['chapel','hill']){
  const e=rooms[scene].entities.find(e=>e.person===id)!;
  assert.equal(walkable(world,scene,e.approach),true,scene);
  assert.ok(findPath(world,scene,rooms[scene].spawn,e.approach).length,scene);
  for(let x=e.at.x-24;x<=e.at.x+24;x+=2)assert.equal(walkable(world,scene,{x:x-8,y:e.at.y+6}),true,scene+' corridor');
 }
 assert.deepEqual(rooms.chapel.spawn,{x:470,y:559});
 assert.deepEqual(rooms.chapel.entities.find(e=>e.id==='exit')!.approach,{x:470,y:559});
 const e=rooms.chapel.entities.find(e=>e.person===id)!;const player={x:e.at.x-8,y:e.at.y-6};
 const moved=residentClearOfPlayer(e,e.at,player,world.actor,q=>walkable(world,'chapel',{x:q.x-8,y:q.y+6}));
 assert.notDeepEqual(moved,e.at);assert.deepEqual(player,{x:467,y:309});
});
test('ordinary runtime introduction and conversation require actual presence and near position',async()=>{
 const old=seed();assert.deepEqual(knownPeople(old),[]);assert.deepEqual(availableTopics(old,id),[]);
 const introduced=(await runtime.prepare(old,command(old,'introduce'))).head;
 assert.deepEqual(knownPeople(introduced),[id]);assert.match(introduced.history.at(-1)!.text[1],/eighteen years/);
 assert.equal(relationshipStory(introduced).people[0].role[1].includes('priest'),true);
 await assert.rejects(()=>runtime.prepare(seed(),command(seed(),'talk:priest-life')),/INTRODUCE_FIRST/);
 const away={...introduced,townMinutes:780};assert.deepEqual(availableTopics(away,id),[]);
 await assert.rejects(()=>runtime.prepare(away,command(away,'talk:priest-life')),/PERSON_AWAY/);
 const c=command(introduced,'talk:priest-life');await assert.rejects(()=>runtime.prepare(introduced,{...c,position:rooms.chapel.spawn}),/SPATIAL_ACTION_NOT_ADMITTED|TOO_FAR/);
});
test('a personal story opens one mutually exclusive shared choice with a bounded relationship increment',()=>{
 for(const selected of ['priest-note','priest-chair']){
  const s=ready(),before=resources(s),done=act(s,'talk:'+selected);
  assert.deepEqual(resources(done),before);assert.equal(done.relations[id],1);
  assert.equal(validPriestState(done),true);assert.equal(validChapelState(done),true);
  assert.equal(availableTopics(done,id).some(t=>t.id==='priest-note'||t.id==='priest-chair'),false);
  assert.throws(()=>act(done,'talk:'+selected),/TOPIC_UNAVAILABLE/);
  const recall=act(done,'talk:priest-recall');assert.deepEqual(resources(recall),before);assert.equal(recall.relations[id],1);
  assert.equal(relationshipStory(recall).leads.find(l=>l.id==='priest-extra-chair')!.state,'done');
  assert.equal(priestContext(recall,id)!.sharedChoice,selected==='priest-note'?'note':'chair');
 }
});
test('hill conversations give another opportunity, while the shared chair is decided at the chapel',()=>{
 const s={...ready(),scene:'hill',townMinutes:780};assert.equal(availableTopics(s,id).some(t=>t.id==='priest-note'),false);
 assert.equal(availableTopics(s,id).some(t=>t.id==='routine'),true);
 const night={...s,townMinutes:1300};assert.deepEqual(availableTopics(night,id),[]);
 assert.match(relationshipStory(night).leads.find(l=>l.id==='priest-extra-chair')!.next![1],/06:00/);
 const learned=act(start(),'talk:routine');assert.equal(residentGuide(learned,id)!.current,'chapel');
 assert.equal(residentGuide({...learned,townMinutes:780},id)!.current,'hill');
 assert.equal(residentGuide({...learned,townMinutes:1300},id)!.current,null);
 assert.match(residentActivity({...s,known:[id]},id)![1],/radio knob/);
 assert.ok(lifeExamples(s,id).length);assert.ok(lifeContext(s,id).chapelNeighbor);
});
test('AI question resolution cannot commit either explicit choice',()=>{
 const s=ready(),a={...command(s,'ask'),payload:{text:'Should we leave a note?'}};
 for(const topic of ['priest-note','priest-chair'])assert.throws(()=>applyAction(s,a,{topic,reply:['','']}),/RELATIONSHIP_EXPLICIT_ACTION_REQUIRED/);
 assert.equal(s.relations[id],undefined);
});
test('old saves and both existing chapel participation choices remain readable without migration',()=>{
 for(const branch of [undefined,'reading','listening']){
  const s=branch?{...seed(),known:['dani','samira'],flags:['chapel:visited','chapel:notice-read','chapel:participation:'+branch,'chapel:completed','chapel:meeting-clue']}:initial('en','synthetic-legacy');
  const old=structuredClone(s);runtime.assertReadable(s);assert.equal(runtime.upgrade(s),s);assert.deepEqual(s,old);assert.equal(knownPeople(s).includes(id),false);
 }
 const done=act(ready(),'talk:priest-note');
 for(const extra of [['talk:gabriel:priest-chair'],['talk:gabriel:priest-note']]){
  const malformed=extra[0].endsWith('chair')?{...done,flags:[...done.flags,...extra]}:{...seed(),known:[id],flags:[...seed().flags,...extra]};
  assert.equal(validPriestState(malformed),false);assert.throws(()=>runtime.assertReadable(malformed),/UNSUPPORTED_SAVE/);
 }
});
test('existing SQLite authority replay, CAS, reload and owner isolation preserve one chosen memory',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'harbor-priest-local-')),path=join(dir,'local.sqlite'),cartridge=randomUUID(),owner='synthetic-priest-'+randomUUID();let modelCalls=0;
 const assembly=createExplorationAssembly({initial:(locale:any,sessionId:string)=>({...seed(),id:sessionId,locale}),resolveDialogue:()=>{modelCalls++;throw Error('EXTERNAL_DISABLED')}});
 const open=()=>openAsyncSqliteAuthorityStore({path,worldId:cartridge,gameId:'priest-local-only',environment:'test'});let store=open();let authority=new AsyncSessionAuthority(store,assembly.runtime);
 try {
  let s=await authority.create(owner,randomUUID(),'en');for(const verb of ['introduce','talk:priest-life','talk:priest-table'])s=(await authority.action(owner,s.id,command(s,verb))).head;
  const choose=command(s,'talk:priest-chair'),before=structuredClone(s),r=await authority.action(owner,s.id,choose);s=r.head;
  assert.deepEqual(await authority.action(owner,s.id,choose),r);assert.equal(s.relations[id],1);assert.deepEqual(resources(s),resources(before));
  await assert.rejects(()=>authority.action(owner,s.id,{...command(before,'talk:priest-note'),action_id:randomUUID()}),/VERSION_CONFLICT/);
  await store.close();store=open();authority=new AsyncSessionAuthority(store,assembly.runtime);
  assert.deepEqual(await authority.get(owner,s.id),s);await assert.rejects(()=>authority.get('another-synthetic-owner',s.id));
  const reread=await authority.action(owner,s.id,command(s,'talk:priest-recall'));assert.equal(reread.head.relations[id],1);assert.equal(modelCalls,0);
 } finally {await store.close();rmSync(dir,{recursive:true,force:true})}
});
