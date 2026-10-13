import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initial,applyAction,type Save,type Action} from '../src/story/state';
import {rooms,people} from '../src/world/data';
import {residentRoutes} from '../src/world/residents';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {runtime} from '../server/runtime';
import {admitSpatialAction} from '../src/story/binding';
import {acceptedAnimals,animalArts} from '../src/animals/art';
import {createAnimalRuntime} from '../src/animals/behavior';
import {gameAnimalContext,animalPeople} from '../src/animals/game';
import {animalPresentation} from '../src/animals/render-contract';
import {profiles} from '../src/animals/config';
import {bodyAt,overlaps,pointClear} from '../src/animals/spatial';
// @ts-expect-error frozen authority; synthetic isolated SQLite only
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const seed=(id:string=randomUUID()):Save=>({...initial('en',id),townMinutes:780,position:{x:748,y:670},flags:['key','unpacked','neighbors2:mira:done'],known:['mara','mira'],relations:{mira:1},cash:37,energy:81,plots:{'crop-bed-1':{crop:'radish',grown:30,updatedAt:780,wetUntil:900}}});
const observed=(s:Save,id='harbor-cat-1')=>createAnimalRuntime(acceptedAnimals).tick(0,gameAnimalContext(s,s.position)).find(a=>a.id===id)!;
const command=(s:Save,verb='animal-pet'):Action=>{const a=observed(s);return {action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{x:a.foot.x-8,y:a.foot.y+34},target:a.id,action:verb,actorPosition:a.foot}};
const stable=(s:Save)=>{const copy:any=structuredClone(s);for(const k of ['animalsV1','version','cursor','position','history'])delete copy[k];return copy};
test('current configuration is 22 identities including Mira, pending nomads, and seven animal objects',()=>{
 assert.equal(Object.keys(people).length,23);assert.equal(Object.keys(residentRoutes).length,23);assert.equal(acceptedAnimals.length,7);
 for(const minute of [540,780,1080])assert.ok(animalPeople({townMinutes:minute,flags:[]}).mira);
 assert.deepEqual(acceptedAnimals.map(d=>d.species).sort(),['cat','cat','cat','gull','gull','gull','gull']);
 for(const r of Object.values(rooms))for(const e of r.entities.filter(e=>e.animalId)){assert.equal(e.kind,'object');assert.equal(e.person,undefined);assert.ok(!people[e.id])}
});
test('moving observed foot admits the same action through binding and reducer; pet preserves all prior facts',async()=>{
 const s=seed(),before=structuredClone(s),r=createAnimalRuntime(acceptedAnimals),ctx=gameAnimalContext(s,s.position);
 let animal=observed(s);for(let i=0;i<90;i++)animal=r.tick(1/60,ctx).find(a=>a.id==='harbor-cat-1')!;
 const a={...command(s),actorPosition:animal.foot,position:{x:animal.foot.x-8,y:animal.foot.y+34}};
 assert.ok(admitSpatialAction(s,a));const result=await runtime.prepare(s,a);
 assert.equal(result.head.animalsV1!.individuals[a.target].familiarity,1);assert.equal(result.head.version,1);assert.equal(result.head.cursor,1);assert.deepEqual(stable(result.head),stable(before));assert.deepEqual(s,before);
 const replayDay=applyAction(result.head,command(result.head)).head;assert.equal(replayDay.animalsV1!.individuals[a.target].familiarity,1);assert.equal(replayDay.townMinutes,780);
});
test('old saves remain identical on readable validation; malformed optional memory fails closed',()=>{
 const old=seed(),before=structuredClone(old);runtime.assertReadable(old);assert.deepEqual(old,before);assert.equal('animalsV1'in old,false);
 for(const memory of [null,{schema:2,individuals:{}},{schema:1,individuals:{unknown:{familiarity:0}}},{schema:1,individuals:{'harbor-cat-1':{familiarity:4}}},{schema:1,individuals:{'harbor-cat-1':{familiarity:1,lastPetMinute:781}}}])assert.throws(()=>runtime.assertReadable({...old,animalsV1:memory} as any),/UNSUPPORTED_SAVE/);
});
test('different day gains once up to three, calls have no familiarity gain or clock cost',()=>{
 let s=seed();for(let d=0;d<5;d++){s.townMinutes=780+d*1440;s=applyAction(s,command(s)).head;s=applyAction(s,command(s)).head;assert.equal(s.animalsV1!.individuals['harbor-cat-1'].familiarity,Math.min(3,d+1));}
 const before=structuredClone(s);s=applyAction(s,command(s,'animal-call')).head;assert.deepEqual(s.animalsV1,before.animalsV1);assert.deepEqual(stable(s),stable(before));
});
test('sleep, wrong scene, missing or invented foot, gull actions and bad verbs reject before mutation',async()=>{
 const s=seed(),valid=command(s);const cases=[{...valid,actorPosition:undefined},{...valid,actorPosition:{x:1,y:1}},{...valid,actorPosition:{x:NaN,y:1}},{...valid,action:'ask'},{...valid,target:'harbor-gull-1'}];
 for(const a of cases){const before=structuredClone(s);await assert.rejects(runtime.prepare(s,a));assert.deepEqual(s,before)}
 const asleep={...s,scene:'courtyard',townMinutes:1300,position:{x:558,y:515}},a=observed(asleep);await assert.rejects(runtime.prepare(asleep,{...valid,scene:'courtyard',position:asleep.position,actorPosition:a.foot}),/ANIMAL_RESTING/);
});
test('current dynamic geometry and all admitted daily residents keep animals, portals and crop regions safe',()=>{
 let frames=0;for(const dynamic of [false,true])for(const minutes of [540,780,1080,1300])for(const scene of [...new Set(acceptedAnimals.flatMap(d=>Object.values(d.schedule).map(s=>s.scene)))]){
  const s={...seed(),scene,townMinutes:minutes,position:rooms[scene].spawn},ctx=gameAnimalContext(s,s.position,{world:dynamicWorld(s.flags,dynamic)}),r=createAnimalRuntime(acceptedAnimals);
  for(let i=0;i<240;i++){const states=r.tick(1/60,ctx);for(const a of states.filter(a=>a.visible)){assert.ok(pointClear(a.foot,a.slot!,profiles[a.species],ctx,states.filter(o=>o.id!==a.id)));assert.ok(!Object.values(ctx.people).filter(p=>p.scene===scene).some(p=>overlaps(bodyAt(a.foot,profiles[a.species]),p.body)));frames++;}}
 }assert.ok(frames>1000);
});
test('paused old-position overlaps move only the animal; clock/map/reset remove temporary reactions',()=>{
 const s=seed(),r=createAnimalRuntime(acceptedAnimals),ctx=gameAnimalContext(s,s.position);let a=r.tick(0,ctx).find(a=>a.id==='harbor-cat-1')!;
 r.react(a.id,'call',ctx);const savedFoot={x:a.foot.x-8,y:a.foot.y-6};const overlap=gameAnimalContext(s,savedFoot,{paused:true});const before=structuredClone(overlap.player);a=r.tick(0,overlap).find(a=>a.id==='harbor-cat-1')!;assert.deepEqual(overlap.player,before);assert.ok(!overlaps(bodyAt(a.foot,profiles.cat),overlap.player));
 r.tick(0,gameAnimalContext({...s,scene:'home'},rooms.home.spawn));assert.equal(animalPresentation(r.snapshot(),animalArts,'home').visuals.length,0);r.reset();a=r.tick(0,ctx).find(a=>a.id==='harbor-cat-1')!;assert.equal(a.attention,0);assert.equal(a.elevation,0);
});
test('SQLite existing authority: duplicate lost-response replay, competing CAS, restart and owner isolation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'harbor-animals-authority-'));const config={path:join(dir,'qa.sqlite'),gameId:'animals',worldId:'animals'};let store=openAsyncSqliteAuthorityStore(config);
 try{let auth=new AsyncSessionAuthority(store,{...runtime,initial:(_l:any,id:string)=>seed(id)});let s=await auth.create('synthetic-A',randomUUID(),'en');const a=command(s);const replies=await Promise.all([auth.action('synthetic-A',s.id,a),auth.action('synthetic-A',s.id,a)]);assert.deepEqual(replies[0],replies[1]);s=await auth.get('synthetic-A',s.id);assert.equal(s.version,1);assert.equal(s.history.length,1);assert.equal(s.animalsV1.individuals[a.target].familiarity,1);
 const competing=await Promise.allSettled([auth.action('synthetic-A',s.id,command(s)),auth.action('synthetic-A',s.id,command(s))]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.filter(r=>r.status==='rejected').length,1);s=await auth.get('synthetic-A',s.id);assert.equal(s.version,2);assert.equal(s.animalsV1.individuals[a.target].familiarity,1);
 await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,runtime);assert.deepEqual(await auth.get('synthetic-A',s.id),s);await assert.rejects(auth.get('synthetic-B',s.id),/SESSION_NOT_FOUND/);
 const b=await auth.create('synthetic-B',randomUUID(),'en');assert.equal(b.animalsV1,undefined);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
