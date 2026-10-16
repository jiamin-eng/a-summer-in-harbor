import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {rooms,world,worldWithFlags,entityAt,type Entity} from '../src/world/data';
import {walkable,findPath,type World,type Point} from '../src/engine/world';
import {presentEntity,patrolRadius} from '../src/world/residents';
import {initial,applyAction,type Save,type Action} from '../src/story/state';
import {createRuntime} from '../server/runtime';
import {closeFriend} from './relationship-expansion-fixture';
// @ts-expect-error frozen async authority; local synthetic SQLite, no HTTP listener
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

const base='4451b92cf901fe877988e4a37363dfd3266cb942',candidate='c9da437d728df846d045c2fb3dce288fff36b7de';
const flags=['key','unpacked','bag-returned','route-open'];
const state={scene:'chapel',townMinutes:780,flags,known:['samira']};
const distance=(p:Point,q:Point)=>Math.hypot(p.x+8-q.x,p.y+6-q.y);
const residents=()=>rooms.chapel.entities.filter(e=>e.person&&presentEntity(state,e));
/** Same documented 18x8 resident foot body used by View; this is a collision
 * fixture, not a replacement implementation of the nearest-target selector. */
function collision(baseWorld:World,x:number){return {...baseWorld,scenes:{...baseWorld.scenes,chapel:{...baseWorld.scenes.chapel,obstacles:[...baseWorld.scenes.chapel.obstacles,...residents().map(e=>({x:(e.person==='samira'?x:e.at.x)-9,y:e.at.y-8,w:18,h:8}))]}}}}
async function original(){
 const root=resolve('.data/samira-4451');if(!existsSync(join(root,'package.json'))){mkdirSync(root,{recursive:true});const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','src','server','vendor','package.json'],{encoding:'utf8'}).trim().split('\n').filter(p=>/\.(?:[cm]?js|tsx?|json)$/.test(p));execFileSync('tar',['-x','-C',root],{input:execFileSync('git',['archive',base,...files],{maxBuffer:128*1024*1024})});symlinkSync(resolve('node_modules'),join(root,'node_modules'));writeFileSync(join(root,'BASELINE.txt'),base+'\n')}
 assert.equal(readFileSync(join(root,'BASELINE.txt'),'utf8').trim(),base);
 for(const file of ['src/world/chapel-layout.ts','src/world/View.tsx','src/engine/world.ts'])assert.deepEqual(readFileSync(join(root,file)),execFileSync('git',['show',base+':'+file]));
 return import(pathToFileURL(join(root,'src/world/data.ts')).href);
}
test('4451 and c9 have identical movement/chapel blobs; original exact QA spawn makes seat nearer than Samira',async()=>{
 for(const file of ['src/world/View.tsx','src/world/data.ts','src/world/residents.ts','src/world/chapel-layout.ts','src/engine/world.ts','src/engine/rpg-space.ts'])assert.equal(execFileSync('git',['rev-parse',base+':'+file],{encoding:'utf8'}),execFileSync('git',['rev-parse',candidate+':'+file],{encoding:'utf8'}));
 const old=await original(),p={x:592,y:442},npc=old.entityAt('chapel','samira'),seat=old.entityAt('chapel','chapel-seat');assert.deepEqual(npc.at,{x:600,y:400});assert.deepEqual(seat.at,{x:580,y:485});assert.equal(distance(p,npc.at),48);assert.ok(distance(p,seat.at)<distance(p,npc.at));assert.ok(distance(p,seat.at)<65);
 const report={baseline:base,candidate,fixturePosition:p,npc:npc.at,oldSeat:seat.at,newSeat:entityAt('chapel','chapel-seat')!.at,npcDistance:distance(p,npc.at),oldSeatDistance:distance(p,seat.at),newSeatDistance:distance(p,entityAt('chapel','chapel-seat')!.at),attribution:'baseline target conflict plus QA exact-goal stopping error; not introduced by c9',uiReplay:'not executed: loopback EPERM, no new permission'};mkdirSync('../evidence',{recursive:true});writeFileSync('../evidence/SAMIRA-GEOMETRY.json',JSON.stringify(report,null,2)+'\n');
});
test('only seat interaction anchors change; static world, NPC poses, scenery and every old legal saved foot remain identical',async()=>{
 const old=await original();assert.deepEqual(world,old.world);assert.deepEqual(rooms.chapel.props,old.rooms.chapel.props);assert.deepEqual(rooms.chapel.spawn,old.rooms.chapel.spawn);assert.deepEqual(rooms.chapel.interior,old.rooms.chapel.interior);
 for(const e of rooms.chapel.entities)if(e.id!=='chapel-seat')assert.deepEqual(e,old.entityAt('chapel',e.id));
 const oldSeat=old.entityAt('chapel','chapel-seat'),seat=entityAt('chapel','chapel-seat')!;assert.deepEqual({...seat,at:oldSeat.at,approach:oldSeat.approach},oldSeat);assert.deepEqual(seat.at,{x:580,y:515});assert.deepEqual(seat.approach,{x:572,y:549});
});
test('current-frame default approach selects Samira ahead of every other active target across all 49 allowed patrol poses',()=>{
 const npc=entityAt('chapel','samira')!,r=patrolRadius('samira');let poses=0;
 for(let x=npc.at.x-r;x<=npc.at.x+r;x++){
  const p={x:x-8,y:npc.at.y+42},d=distance(p,{x,y:npc.at.y});assert.equal(d,48);assert.ok(d<65&&d<110);assert.ok(walkable(collision(worldWithFlags(flags),x),'chapel',p));
  for(const e of rooms.chapel.entities.filter(e=>e.id!=='samira'&&presentEntity(state,e)))assert.ok(distance(p,e.at)>d,`${e.id} competes at pose ${x}`);poses++;
 }
 assert.equal(poses,49);
});
test('QA alternate exact goal lies inside an NPC body; its recorded stalled position already admits Samira',()=>{
 const p={x:600,y:384},w=worldWithFlags(flags);assert.ok(walkable(w,'chapel',p));assert.equal(walkable(collision(w,600),'chapel',p),false);
 const stopped={x:599.8399999983309,y:400.072800001335};assert.ok(walkable(collision(w,600),'chapel',stopped));assert.ok(distance(stopped,{x:600,y:400})<65);
 for(const e of rooms.chapel.entities.filter(e=>e.id!=='samira'&&presentEntity(state,e)))assert.ok(distance(stopped,e.at)>distance(stopped,{x:600,y:400}));
});
test('corrected QA helper stops on actual Samira readiness before exact-coordinate planning, and never accepts a chair target',async()=>{
 const {walkUntilSamira}=await import(pathToFileURL(resolve('_qa/samira-target-replay.mjs')).href);let keys=0,plans=0;
 const snapshot={position:{x:599.8399999983309,y:400.072800001335},paused:false,playerCount:1,canvases:1,room:'chapel',persons:[{id:'person-samira',x:600,y:400}],label:'Samira Bell',ready:true};
 const module={worldWithFlags:()=>world,findPath:()=>{plans++;throw Error('EXACT_GOAL_MUST_NOT_BE_PLANNED')},walkable};const d={p:{waitForTimeout:async()=>{}},getHead:async()=>({flags})};
 const r=await walkUntilSamira(d,module,'Samira Bell',[],{read:async()=>snapshot,input:async()=>{keys++},head:{flags}});assert.equal(r.reason,'actual-Samira-target-ready');assert.equal(keys,0);assert.equal(plans,0);
 await assert.rejects(walkUntilSamira(d,module,'Samira Bell',[],{read:async()=>({...snapshot,label:'Aisle-side seats'}),input:async()=>{keys++},head:{flags},maxSteps:1}),/EXACT_GOAL_MUST_NOT_BE_PLANNED/);assert.equal(keys,0);assert.equal(plans,1);
});
test('collision-aware keyboard detour reaches a sole Samira interaction spot on both unchanged baseline and fixed layout',async()=>{
 const old=await original(),goals=[{x:536,y:448},{x:536,y:402},{x:558,y:402}],starts=[{x:592,y:442},{x:599.8399999983309,y:400.072800001335},rooms.chapel.spawn];let paths=0;
 for(const w of [old.worldWithFlags(flags),worldWithFlags(flags)])for(let x=576;x<=624;x+=4)for(const start of starts){const live=collision(w,x);let from=start;assert.ok(walkable(live,'chapel',from));for(const goal of goals){const path=findPath(live,'chapel',from,goal);assert.ok(path.length,JSON.stringify({start,from,goal,x}));for(const q of path)assert.ok(walkable(live,'chapel',q));from=goal}
  assert.ok(distance(from,{x,y:400})<65);assert.ok(distance(from,entityAt('chapel','chapel-seat')!.at)>65);assert.ok(distance(from,old.entityAt('chapel','chapel-seat').at)>65);paths++;
 }
 assert.equal(paths,78);
});
const command=(s:Save,target:string,verb:string,p=s.position):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:p,target,action:verb,...(target==='samira'?{actorPosition:{x:600,y:400}}:{})});
function pilotSave(id:string=randomUUID()):Save{
 let s=initial('en',id);s.flags=[...flags];s.known=['mara','avery','samira'];s.visited=Object.keys(rooms);s.relations={mara:-4,avery:5,samira:-2};
 for(const person of ['mara','avery']){s.scene='station';s.position=entityAt('station',person)!.approach;s=applyAction(s,command(s,person,'talk:rg-personal')).head}
 return {...s,scene:'chapel',townMinutes:780,position:{x:592,y:442},version:0,cursor:0};
}
test('old seat approach and new seat approach both commit original chapel-listen with no relation reward or save migration',async()=>{
 const runtime=createRuntime();for(const p of [{x:572,y:519},entityAt('chapel','chapel-seat')!.approach]){const s=pilotSave();s.flags.push('chapel:visited','chapel:notice-read');s.position=p;const progress=JSON.stringify(s.relationshipsV1);runtime.assertReadable(s);const n=(await runtime.prepare(s,command(s,'chapel-seat','chapel-listen'))).head;assert.ok(n.flags.includes('chapel:participation:listening'));assert.deepEqual(n.relations,s.relations);assert.deepEqual(n.items,s.items);assert.equal(n.cash,s.cash);assert.equal(n.energy,s.energy);assert.equal(n.mapVersion,s.mapVersion);assert.equal(JSON.stringify(n.relationshipsV1),progress)}
});
test('Samira synthetic real authority: one reward, exact replay, failure rollback, legacy Mara/Avery preservation and restart',async()=>{
 const dir=mkdtempSync('/tmp/samira-target-'),cfg={path:join(dir,'authority.sqlite'),worldId:'samira-target',gameId:'samira-target'},runtime={...createRuntime(),initial:(_l:unknown,id:string)=>pilotSave(id)},owner='a'.repeat(64);let store=openAsyncSqliteAuthorityStore(cfg),auth=new AsyncSessionAuthority(store,runtime);
 try{const before=await auth.create(owner,randomUUID(),'en'),keep=structuredClone(before.relationshipsV1.residents),a=command(before,'samira','talk:rg-personal'),fault={...store,transaction:(work:any)=>store.transaction((repo:any)=>work({...repo,addReceipt:async()=>{throw Error('INJECTED_RECEIPT_FAILURE')}}))};await assert.rejects(new AsyncSessionAuthority(fault,runtime).action(owner,before.id,a),/INJECTED_RECEIPT_FAILURE/);assert.deepEqual(await auth.get(owner,before.id),before);
  const r=await auth.action(owner,before.id,a);assert.equal(r.head.relations.samira,-1);assert.deepEqual(r.head.relationshipsV1.residents.mara,keep.mara);assert.deepEqual(r.head.relationshipsV1.residents.avery,keep.avery);assert.equal(r.head.relationshipExpansionV1,undefined);for(let i=0;i<8;i++)assert.deepEqual(await auth.action(owner,before.id,a),r);
  await assert.rejects(auth.action(owner,before.id,{...a,action_id:randomUUID()}),/VERSION_CONFLICT/);await assert.rejects(auth.get('b'.repeat(64),before.id),/SESSION_NOT_FOUND/);await store.close();store=openAsyncSqliteAuthorityStore(cfg);auth=new AsyncSessionAuthority(store,runtime);assert.deepEqual(await auth.get(owner,before.id),r.head);assert.deepEqual(await auth.action(owner,before.id,a),r);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
test('previously completed Owen root survives first Samira interaction unchanged',()=>{
 const s=closeFriend();s.known.push('samira');s.scene='chapel';s.townMinutes=7980;s.position={x:558,y:402};const root=JSON.stringify(s.relationshipExpansionV1);const next=applyAction(s,command(s,'samira','talk:rg-personal')).head;assert.equal(JSON.stringify(next.relationshipExpansionV1),root);assert.ok(next.relationshipsV1?.residents.samira);createRuntime().assertReadable(next);
});
