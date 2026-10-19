import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {initial,type Save,type Action} from '../src/story/state';
import {fishingAccess} from '../src/ui/FishingAccess';
import {fishingWaypoints} from '../src/world/fishing-waypoints';
import {entityAt,rooms,world} from '../src/world/data';
import {findPath,walkable} from '../src/engine/world';
import {walkingEntrance} from '../src/world/map-navigation';
import {fishingInitial,fishingStep,recordFishing,type FishingRun} from '../src/challenges/fishing';
import {createRuntime} from '../server/runtime';
// @ts-expect-error frozen exported async authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const fixture=()=>({...initial('en',randomUUID()),scene:'dock',position:{...entityAt('dock','ruth')!.approach},flags:['unpacked'],known:['ruth','theo'],energy:10,items:{fish:99}} satisfies Save);
const action=(s:Save,target:string,verb:string,payload?:unknown):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,target)?.approach??s.position,target,action:verb,payload});
function runs(catchFish:boolean){let s=fishingInitial();const input:FishingRun[]=[];while(s.result==='playing'){const hold=!catchFish||s.tension<.7;recordFishing(input,hold);s=fishingStep(s,hold)}return input}
test('fishing access agrees with existing schedule and ten-energy admission',()=>{
 const s=fixture();assert.equal(fishingAccess(s).open,true);assert.equal(fishingAccess({...s,energy:9}).energyReady,false);assert.equal(fishingAccess({...s,energy:10}).energyReady,true);assert.equal(fishingAccess({...s,known:[]}).known,false);
 for(const minute of [359,1020,1260])assert.equal(fishingAccess({...s,townMinutes:minute}).open,false);
 for(const minute of [360,1019])assert.equal(fishingAccess({...s,townMinutes:minute}).open,true);
 assert.equal(fishingAccess({...s,scene:'coast',townMinutes:1080}).open,false);
});
test('visible pier routes have reachable standing points and no authority fishing action',()=>{
 for(const scene of ['harbor','dock'])for(const e of fishingWaypoints(scene)){assert.deepEqual(e.actions,[]);assert.equal(entityAt(scene,e.id),undefined);assert.ok(walkable(world,scene,e.approach));assert.ok(findPath(world,scene,rooms[scene].spawn,e.approach).length)}
 const s={...fixture(),scene:'harbor',position:{x:797,y:880}};const e=walkingEntrance(s,'dock')!;assert.equal(e.destination,'dock');assert.equal(e.id,'to-dock');assert.ok(findPath(world,'harbor',s.position,e.approach).length);assert.deepEqual(fishingWaypoints('coast'),[]);
});
test('actual SQLite authority preserves cancellation, catch, replay, restart, sale and old save roots',async()=>{
 const dir=mkdtempSync('/tmp/harbor-fishing-f0-'),config={path:join(dir,'authority.sqlite'),worldId:'fishing-f0',gameId:'fishing-f0'},template=fixture(),runtime=createRuntime();
 const adapter={...runtime,initial:(_l:unknown,id:string)=>({...structuredClone(template),id})};let store=openAsyncSqliteAuthorityStore(config),auth=new AsyncSessionAuthority(store,adapter);
 const owner='synthetic-fishing-owner';
 try{
  let s:Save=await auth.create(owner,randomUUID(),'en');const original=structuredClone(s);
  await assert.rejects(runtime.prepare({...s,energy:9},action(s,'ruth','challenge-start:fishing')),/REST_NEEDED/);
  await assert.rejects(runtime.prepare({...s,scene:'coast',position:entityAt('coast','ruth')!.approach,townMinutes:1080},action({...s,scene:'coast'},'ruth','challenge-start:fishing')),/CHALLENGE_UNAVAILABLE/);
  const start=async()=>{s=(await auth.action(owner,s.id,action(s,'ruth','challenge-start:fishing'))).head};
  await start();s=(await auth.action(owner,s.id,action(s,s.activeChallenge!.id,'challenge-finish',{withdraw:true}))).head;
  assert.deepEqual([s.items,s.energy,s.cash,s.townMinutes],[original.items,10,25,540]);
  await start();s=(await auth.action(owner,s.id,action(s,s.activeChallenge!.id,'challenge-finish',{fishing:runs(false)}))).head;assert.equal(s.items.fish,99);assert.equal(s.energy,10);
  await start();const finish=action(s,s.activeChallenge!.id,'challenge-finish',{fishing:runs(true)}),receipt=await auth.action(owner,s.id,finish);s=receipt.head;
  assert.deepEqual([s.items.fish,s.energy,s.cash,s.relations.ruth,s.townMinutes],[100,8,25,1,540]);assert.deepEqual(await auth.action(owner,s.id,finish),receipt);assert.deepEqual(await auth.get(owner,s.id),s);
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,adapter);assert.deepEqual(await auth.get(owner,s.id),s);
  // Separate synthetic café fixture exercises the same authority sale command.
  const saleRuntime={...runtime,initial:(_l:unknown,id:string)=>({...structuredClone(s),id,version:0,cursor:0,scene:'cafe',position:{...entityAt('cafe','theo')!.approach}})};
  const saleAuth=new AsyncSessionAuthority(store,saleRuntime);let cafe:Save=await saleAuth.create(owner,randomUUID(),'en');const sell=action(cafe,'theo','talk:fish'),sold=await saleAuth.action(owner,cafe.id,sell);cafe=sold.head;assert.deepEqual([cafe.items.fish,cafe.cash,cafe.energy],[99,31,8]);assert.deepEqual(await saleAuth.action(owner,cafe.id,sell),sold);assert.deepEqual(cafe.neighborChapterV1,original.neighborChapterV1);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
