import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,existsSync,symlinkSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {initial,type Save} from '../src/story/state';
import {rooms,worldWithFlags,entityAt} from '../src/world/data';
import {walkable,findPath} from '../src/engine/world';
import {applyOrnamentalFern,assertOrnamentalFernReadable,fernAge} from '../src/life/ornamental-fern';
import {fernSlot,fernDisplayFlag,fernOwnedFlag} from '../src/life/ornamental-fern-config';
import {bagRows} from '../src/ui/Bag';
import {lifeSnapshotKey} from '../src/life/snapshot';
import {lifeProjectionKey} from '../src/candidate/life-projection';
import {activeBusinessHttpFailure} from '../server/active-business-failure';
import {activePlayActionId} from '../src/candidate/active-play-types';
import {fernQaAssembly,fernReady,fernStep,fernInBag,fernAtHome,fernCommand} from './ornamental-fern-fixture';
import {landWorkerChain} from './land-worker-chain';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {OrnamentalFernPanel} from '../src/ui/OrnamentalFernPanel';
// @ts-expect-error frozen asynchronous authority adapter
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

test('ordinary new/old reads and projections never grant a fern; gift waits for settled authored prerequisites',async()=>{
 const assembly=fernQaAssembly(),s=await fernReady(),before=structuredClone(s);
 for(let n=0;n<5;n++){assembly.runtime.assertReadable(s);assembly.lifeProject(s)}
 assert.deepEqual(s,before);assert.equal(s.ornamentalFernV1,undefined);assert.equal(bagRows(s,null).some(r=>r.id==='owned-potted-fern'),false);
 assert.equal(assembly.lifeProject(s).ornamentalFern.eligible,true);
 await assert.rejects(fernStep(s,'accept'),/ORNAMENTAL_FERN_OFFER_FIRST/);
 const fresh=initial('en',randomUUID());await assert.rejects(fernStep(fresh,'read-offer'),/ORNAMENTAL_FERN_SETTLE_FIRST/);
 assert.deepEqual(s,before);
});
for(const locale of ['en','zh'] as const)test(`explicit ${locale} offer and acceptance create one separate mature plant with no added reward or cost`,async()=>{
 let s=await fernReady(locale);const original=structuredClone(s),snapshot=lifeSnapshotKey(s),projection=lifeProjectionKey(s);
 s=await fernStep(s,'read-offer');assert.equal(s.ornamentalFernV1?.plant,undefined);
 const deferred=structuredClone(s);fernQaAssembly().runtime.assertReadable(s);assert.deepEqual(s,deferred,'Maybe later closes UI without an action');
 s=await fernStep(s,'accept');assert.notEqual(lifeSnapshotKey(s),snapshot);assert.notEqual(lifeProjectionKey(s),projection);
 assert.equal(s.ornamentalFernV1!.plant!.holder,'bag');assert.equal(fernAge(s),1440);assert.equal(bagRows(s,null).filter(r=>r.id==='owned-potted-fern').length,1);
 assert.deepEqual([s.energy,s.townMinutes,s.cash,s.relations,s.items],[original.energy,original.townMinutes,original.cash,original.relations,original.items]);
 assert.equal(s.fernStartedAt,original.fernStartedAt);assert.equal(s.relationshipNextV1,original.relationshipNextV1);
 await assert.rejects(fernStep(s,'accept'),/ORNAMENTAL_FERN_ALREADY_OWNED/);
});
test('placing and returning share one instance and collision, charge 4/20 each, retain age and leave the original scenery',async()=>{
 let s=await fernAtHome(await fernInBag());const before=structuredClone(s),plant=structuredClone(s.ornamentalFernV1!.plant),view=fernQaAssembly().lifeProject(s);
 const standing={x:fernSlot.footprint.x,y:fernSlot.footprint.y};assert.equal(walkable(worldWithFlags(s.flags),'home',standing),true);
 s=await fernStep(s,'place');assert.deepEqual([s.energy,s.townMinutes,s.cash],[before.energy-4,before.townMinutes!+20,before.cash]);
 assert.equal(s.ornamentalFernV1!.plant!.id,plant!.id);assert.deepEqual(s.ornamentalFernV1!.plant!.source,plant!.source);assert.equal(fernAge(s),fernAge(before)!+20);
 assert.equal(bagRows(s,view).some(r=>r.id==='owned-potted-fern'),false);assert.equal(walkable(worldWithFlags(s.flags),'home',standing),false);assert.ok(findPath(worldWithFlags(s.flags),'home',rooms.home.spawn,fernSlot.approach).length);
 s=await fernStep(s,'take');assert.deepEqual([s.energy,s.townMinutes,s.cash],[before.energy-8,before.townMinutes!+40,before.cash]);assert.equal(s.ornamentalFernV1!.plant!.id,plant!.id);assert.equal(fernAge(s),fernAge(before)!+40);assert.equal(s.flags.includes(fernDisplayFlag),false);assert.equal(walkable(worldWithFlags(s.flags),'home',standing),true);assert.equal(bagRows(s,null).find(r=>r.id==='owned-potted-fern')!.quantity,1);
 assert.equal(rooms.home.props.find(p=>p.id==='fern')!.art,'flora-pot-rubber-v1');assert.equal(entityAt('garden','growing-fern')!.actions!.includes('water-fern'),true);
});
test('low energy, wrong scene/target, untrusted payload, active challenge and occupied or player-covered slot fail atomically',async()=>{
 const s=await fernAtHome(await fernInBag()),assembly=fernQaAssembly();
 const reject=async(head:Save,command:any,re:RegExp)=>{const before=structuredClone(head);await assert.rejects(assembly.runtime.prepare(head,command),re);assert.deepEqual(head,before)};
 await reject({...s,energy:3},fernCommand({...s,energy:3},'place'),/REST_NEEDED/);
 await reject(s,{...fernCommand(s,'place'),payload:{admitted:true}},/ORNAMENTAL_FERN_ACTION/);
 await reject(s,{...fernCommand(s,'place'),target:'fern'},/ORNAMENTAL_FERN_TARGET/);
 await reject(s,{...fernCommand(s,'place'),scene:'garden'},/SCENE_MISMATCH/);
 await reject(s,{...fernCommand(s,'place'),position:rooms.home.spawn},/TOO_FAR/);
 await reject({...s,activeChallenge:{id:randomUUID(),kind:'fishing',scene:'home'}},fernCommand(s,'place'),/CHALLENGE_ACTIVE/);
 const w=worldWithFlags(s.flags),obstructed={...w,scenes:{...w.scenes,home:{...w.scenes.home,obstacles:[...w.scenes.home.obstacles,{...fernSlot.footprint}]}}},before=structuredClone(s);
 assert.throws(()=>applyOrnamentalFern(s,'place',randomUUID(),obstructed),/ORNAMENTAL_FERN_OCCUPIED/);assert.deepEqual(s,before);
 const covered={...s,position:{x:fernSlot.footprint.x,y:fernSlot.footprint.y}};assert.throws(()=>applyOrnamentalFern(covered,'place',randomUUID(),w),/ORNAMENTAL_FERN_PLAYER_SPACE/);
});
test('production reader rejects forged provenance, owner, age, holder and flags; unsupported format stays nonterminal',async()=>{
 const s=await fernInBag(),assembly=fernQaAssembly();
 for(const mutate of [
  (x:Save)=>{x.ornamentalFernV1!.rules='fixture-only' as any},
  (x:Save)=>{x.ornamentalFernV1!.plant!.ownerJourney=randomUUID()},
  (x:Save)=>{x.ornamentalFernV1!.plant!.source.event='public-fern' as any},
  (x:Save)=>{x.ornamentalFernV1!.plant!.ageMinutesAtGrant=0 as any},
  (x:Save)=>{x.ornamentalFernV1!.plant!.source.minute=x.townMinutes!+1},
  (x:Save)=>{x.ornamentalFernV1!.plant!.holder=fernSlot.id},
  (x:Save)=>{x.flags=x.flags.filter(f=>f!==fernOwnedFlag)},
  (x:Save)=>{delete x.ornamentalFernV1},
  (x:Save)=>{(x.ornamentalFernV1!.plant as any).secondPlant={id:'copy'}},
 ]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>assembly.runtime.assertReadable(bad),e=>{assert.equal((e as any).status,503);assert.equal((e as any).terminal,false);return /UNSUPPORTED_ORNAMENTAL_FERN_SAVE/.test((e as Error).message)})}
});
test('real ornamental source coexists with Dani progression and UI exposes only explicit accepted-state actions',async()=>{
 const assembly=fernQaAssembly();let s=await fernInBag();const owned=structuredClone(s.ornamentalFernV1);
 s={...s,scene:'garden',position:{...entityAt('garden','dani')!.approach},visited:[...s.visited,'garden']};
 for(const action of ['introduce','talk:rg-personal'])s=(await assembly.runtime.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target:'dani',action})).head;
 assert.ok(s.relationshipNextV1?.residents.dani.interactions['rg-personal']);assert.deepEqual(s.ornamentalFernV1,owned);
 const dani=structuredClone(s.relationshipNextV1);s={...s,scene:'home',position:{...fernSlot.approach}};s=await fernStep(s,'place');assert.deepEqual(s.relationshipNextV1,dani);
 let sent=0;const props={locale:'en' as const,current:true,busy:false,onAction:async()=>{sent++},onLater:()=>{}};
 const ready=await fernReady(),offer=await fernStep(ready,'read-offer');
 const offering=renderToStaticMarkup(createElement(OrnamentalFernPanel,{...props,save:offer,view:assembly.lifeProject(offer),target:'mara',person:'mara'}));assert.match(offering,/Accept the potted fern/);assert.match(offering,/Maybe later/);
 const ownedHtml=renderToStaticMarkup(createElement(OrnamentalFernPanel,{...props,save:s,view:assembly.lifeProject(s),target:'mara',person:'mara'}));assert.doesNotMatch(ownedHtml,/Accept the potted fern/);
 const slot=renderToStaticMarkup(createElement(OrnamentalFernPanel,{...props,save:s,view:assembly.lifeProject(s),target:fernSlot.id}));assert.match(slot,/Return fern to bag/);assert.match(slot,/4 energy/);assert.match(slot,/20 game minutes/);assert.equal(sent,0);
});
test('SQLite grant/move CAS, concurrent double click, identical replay, lost reply and rollback preserve one gift and one charge',async()=>{
 const dir=mkdtempSync('/tmp/harbor-ornamental-fern-'),config={path:join(dir,'authority.sqlite'),worldId:'ornamental-fern-qa',gameId:'ornamental-fern-qa'},template=await fernReady(),assembly=fernQaAssembly({initial:(_locale:any,id:string)=>({...structuredClone(template),id,version:0,cursor:0})});
 let store=openAsyncSqliteAuthorityStore(config),auth=new AsyncSessionAuthority(store,assembly.runtime);const owner='fern-synthetic-A';
 try{
  let s=await auth.create(owner,randomUUID(),'en');s=(await auth.action(owner,s.id,fernCommand(s,'read-offer'))).head;const before=structuredClone(s),a=fernCommand(s,'accept');
  const fault={...store,transaction:(work:any)=>store.transaction((repo:any)=>work({...repo,addReceipt:async()=>{throw Error('INJECTED_RECEIPT_FAILURE')}}))};
  await assert.rejects(new AsyncSessionAuthority(fault,assembly.runtime).action(owner,s.id,a),/INJECTED_RECEIPT_FAILURE/);assert.deepEqual(await auth.get(owner,s.id),before);
  const race=await Promise.allSettled([auth.action(owner,s.id,a),auth.action(owner,s.id,{...a,action_id:randomUUID()})]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);const winner=(race.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<any>).value;s=await auth.get(owner,s.id);
  const gift=structuredClone(s.ornamentalFernV1);assert.deepEqual(await auth.action(owner,s.id,{...a,action_id:s.ornamentalFernV1.plant.source.actionId}),winner);await assert.rejects(auth.action(owner,s.id,fernCommand(s,'accept')),/ORNAMENTAL_FERN_ALREADY_OWNED/);
  const portal=rooms.station.entities.find(e=>e.destination==='home')!;s=(await auth.action(owner,s.id,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:portal.approach,target:portal.id,action:'travel'})).head;
  const move=fernCommand(s,'place'),preMove=structuredClone(s);await assert.rejects(new AsyncSessionAuthority(fault,assembly.runtime).action(owner,s.id,move),/INJECTED_RECEIPT_FAILURE/);assert.deepEqual(await auth.get(owner,s.id),preMove);
  const moveRace=await Promise.allSettled([auth.action(owner,s.id,move),auth.action(owner,s.id,{...move,action_id:randomUUID()})]);assert.equal(moveRace.filter(x=>x.status==='fulfilled').length,1);s=await auth.get(owner,s.id);const moveId=s.ornamentalFernV1.plant.lastMove.actionId;
  await auth.action(owner,s.id,{...move,action_id:moveId});assert.deepEqual(await auth.get(owner,s.id),s);assert.equal(s.energy,preMove.energy-4);assert.equal(s.townMinutes,preMove.townMinutes+20);assert.equal(s.ornamentalFernV1.plant.moveCount,1);
  await assert.rejects(auth.action(owner,s.id,{...move,action_id:moveId,action:'fern:take'}),/ACTION_ID_CONFLICT/);await assert.rejects(auth.get('fern-synthetic-B',s.id),/SESSION_NOT_FOUND/);
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,assembly.runtime);assert.deepEqual(await auth.get(owner,s.id),s);assert.deepEqual(s.ornamentalFernV1.plant.source,gift.plant.source);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
test('active-time and weather assembly includes natural minute and fatigue, with failed prepare rolling back both time and cost',async()=>{
 let now=100000;const template=await fernAtHome(await fernInBag());template.position={...fernSlot.approach};template.awakeMinutes=640;
 const assembly=fernQaAssembly({now:()=>now,boot:'fern-clock-qa',initial:(_l:any,id:string)=>{const s=structuredClone(template);s.id=id;s.ornamentalFernV1!.plant!.ownerJourney=id;s.version=0;s.cursor=0;return s}}),store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:randomUUID(),gameId:'fern-clock-qa'}),owner='fern-clock-owner',client=randomUUID(),auth=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store);
 try{
  let s=await auth.create(owner,randomUUID(),'en');const open=async()=>{const last=s.activePlayClock?.transport?.last.ack;await auth.activePlay(owner,s.id,{action_id:activePlayActionId(s.id,(last?.ordinal??0)+1),expected_version:s.version,scene:s.scene,position:s.position,target:'',action:'candidate-active-open',payload:{client,ordinal:(last?.ordinal??0)+1,previous:last?.token??''}});s=await auth.get(owner,s.id)};
  const half=async()=>{const c=s.activePlayClock,last=c.transport.last.ack;now+=2000;await auth.activePlay(owner,s.id,{action_id:activePlayActionId(s.id,last.ordinal+1),expected_version:s.version,scene:s.scene,position:s.position,target:'',action:'candidate-active-tick',payload:{client,ordinal:last.ordinal+1,previous:last.token,lease:c.lease.id,sequence:c.lease.sequence+1,activeMs:2000}});s=await auth.get(owner,s.id)};
  await open();await half();const minute=s.townMinutes,energy=s.energy;now+=2000;const a={...fernCommand(s,'place'),position:s.position,activePlay:{client,lease:s.activePlayClock.lease.id,activeMs:2000}};s=(await auth.action(owner,s.id,a)).head;
  assert.equal(s.townMinutes,minute+21);assert.equal(s.energy,energy-9,'4 move + existing 5 fatigue across awake minute 660');assert.equal(s.weatherV1.settledThrough,s.townMinutes);const current=structuredClone(s);await auth.action(owner,s.id,a);assert.deepEqual(await auth.get(owner,s.id),current);
  await open();await half();const refused=structuredClone(s);now+=2000;await assert.rejects(auth.action(owner,s.id,{...fernCommand(s,'place'),position:s.position,activePlay:{client,lease:s.activePlayClock.lease.id,activeMs:2000}}),e=>{assert.deepEqual(activeBusinessHttpFailure(e),{status:409,body:{error:'ORNAMENTAL_FERN_ALREADY_THERE',terminal:true}});return true});assert.deepEqual(await auth.get(owner,s.id),refused);
 }finally{await store.close()}
});
test('stop-new retains existing movement and reader; exact old 4da runtime preserves root through ordinary rest',async()=>{
 const stopped=fernQaAssembly({ornamentalFernStarts:false}),ready=await fernReady();await assert.rejects(fernStep(ready,'read-offer',stopped),/ORNAMENTAL_FERN_STARTS_CLOSED/);
 let s=await fernAtHome(await fernInBag());s=await fernStep(s,'place',stopped);s=await fernStep(s,'take',stopped);const root=structuredClone(s.ornamentalFernV1),base='4da1808c009a2345614e82dee65a5ccccaa3c2ad',path=resolve('.data/fern-rollback-4da');
 if(!existsSync(join(path,'package.json'))){mkdirSync(path,{recursive:true});const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','src','server','vendor','package.json'],{encoding:'utf8'}).trim().split('\n').filter(p=>/\.(?:[cm]?js|tsx?|json)$/.test(p));execFileSync('tar',['-x','-C',path],{input:execFileSync('git',['archive',base,...files],{maxBuffer:128*1024*1024})});symlinkSync(resolve('node_modules'),join(path,'node_modules'))}
 assert.deepEqual(readFileSync(join(path,'server/runtime.ts')),execFileSync('git',['show',base+':server/runtime.ts']));
 const oldAssembly=(await import(pathToFileURL(join(path,'server/exploration-assembly.ts')).href)).createExplorationAssembly,oldLife=(await import(pathToFileURL(join(path,'server/reviewed-animal-life.ts')).href)).createReviewedAnimalLife,oldBasil=(await import(pathToFileURL(join(path,'server/plant-basil.ts')).href)).withBasilPlantUses,oldMint=(await import(pathToFileURL(join(path,'server/wild-mint.ts')).href)).withWildMint;const reader=oldAssembly({weather:{enabled:true,ecology:true},crabEnabled:true,createLife:oldLife,decorateLife:(a:any)=>oldMint(oldBasil(a),{enabled:true,newStarts:true})}).runtime;reader.assertReadable(s);const next=(await reader.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:'home',position:entityAt('home','bed')!.approach,target:'bed',action:'rest'})).head;assert.deepEqual(next.ornamentalFernV1,root);stopped.runtime.assertReadable(next);
});
test('actual Worker and HTTP enforce fern format header, retain old saves and replay post-commit lost replies without duplication',async()=>{
 const f=await landWorkerChain(await fernReady()),headers={'X-Harbor-Land':'2','X-Harbor-Fern':'1'};
 try{
  let s=await f.create('2');const path='/api/sessions/'+s.id;assert.equal((await f.invoke(path)).status,200);
  const offer=fernCommand(s,'read-offer');assert.deepEqual((await f.invoke(path+'/action',{body:offer})).body,{error:'CLIENT_REFRESH_REQUIRED',terminal:false});
  s=(await f.invoke(path+'/action',{headers,body:offer})).body.head;const accept=fernCommand(s,'accept');f.loseNextActionReply();const lost=await f.invoke(path+'/action',{headers,body:accept});assert.equal(lost.status,503);
  const received=await f.invoke(path+'/action',{headers,body:accept});assert.equal(received.status,200);s=received.body.head;assert.equal(s.ornamentalFernV1!.plant!.moveCount,0);assert.equal(s.ornamentalFernV1!.plant!.source.actionId,accept.action_id);
  for(const tail of ['','/life','/land-preview?region=hill-edge']){const old=await f.invoke(path+tail);assert.deepEqual([old.status,old.body.error,old.body.terminal],[409,'CLIENT_REFRESH_REQUIRED',false]);const current=await f.invoke(path+tail,{headers});assert.equal(current.status,tail.startsWith('/land-preview')?400:200,JSON.stringify({tail,...current.body}));if(tail.startsWith('/land-preview'))assert.equal(current.body.error,'LAND_SCENE')}
  for(const cap of ['0','2','01','1, 1'])assert.equal((await f.invoke(path,{headers:{...headers,'X-Harbor-Fern':cap}})).status,409);
  assert.equal(f.modelCalls,0);assert.ok(f.trace.every(t=>!t.cookieForwarded&&t.edgeMatched));
 }finally{await f.close()}
});
