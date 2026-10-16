import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {runtime} from '../server/runtime';
import {createLifePlantsB2,createPlantsRegistry,snapPeaV2Ref} from '../server/life-plants-b2';
import {createLifeB2} from '../server/life-b2';
import {parseLifeCommand} from '../server/life-runtime';
import {landEntity,landRegion,landGeometry,landWorld,landApproach,assertLandReadable} from '../src/life/land';
import {landMaximum} from '../src/life/land-contract';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {walkable,findPath} from '../src/engine/world';
import {pinLegacy,addLot,assertLifeReadable} from '../src/life/save';
import {lifePlotStatus} from '../src/life/rules';
import {seedSources} from '../src/life/seed-quota';
import {entityAt,rooms} from '../src/world/data';
import {activeBusinessHttpFailure,brandActivePrepareFailure} from '../server/active-business-failure';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createReviewedAnimalLife} from '../server/reviewed-animal-life';
import {withBasilPlantUses} from '../server/plant-basil';
import {withWildMint} from '../server/wild-mint';
import {activePlayActionId} from '../src/candidate/active-play-types';
import {createWeatherSettlement} from '../server/weather';
import {createWeatherState,validWeatherState,weatherPatch,applyWeatherPatch} from '../src/weather/state';
import type {Command,LifeSave} from '../src/life/types';
import {start,move,command,step,twoBeds,fourBeds,beds} from './land-phase2-fixture';
// @ts-expect-error pinned authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const host=createLifePlantsB2(runtime),r=createPlantsRegistry();
async function rejected(s:LifeSave,c:Command,pattern:RegExp,h=host){const before=structuredClone(s);await assert.rejects(step(s,c,h),pattern);assert.deepEqual(s,before)}

test('pure old save projections keep schema1, two slots, old standing plant and goods without migration',async()=>{
 const s=await twoBeds();s.items['crop-basil']=3;s.plots={'crop-bed-2':{crop:'basil',grown:200,updatedAt:540,wetUntil:1260}};
 const before=structuredClone(s),view=host.lifeProject(s),preview=host.landProject(s,new URLSearchParams({region:'hill-edge'}));
 assert.equal(s.landV1!.schema,1);assert.equal(preview.maximum,2);assert.equal(preview.expansion.canConfirm,true);assert.equal(view.plants!.plots.length,2);assert.equal(s.lifeV1,undefined);assert.deepEqual(s,before);
});
test('expansion needs both permissions and first two beds, validated command and actual sign proximity',async()=>{
 let s=start();await rejected(s,{verb:'expand-land',region:'hill-edge'},/LAND_EXPANSION_PERMISSION/);
 for(const b of beds.slice(0,2)){s=move(s,landRegion(b.region)!.scene);s=await step(s,{verb:'permit-land',region:b.region})}
 s=move(s,'hill');await rejected(s,{verb:'expand-land',region:'hill-edge'},/LAND_EXPANSION_NOT_READY/);
 s=await twoBeds();const a=command(s,{verb:'expand-land',region:'hill-edge'}),before=structuredClone(s);
 await assert.rejects(host.runtime.prepare(s,{...a,target:'land-bed-1'}),/LAND_TARGET/);await assert.rejects(host.runtime.prepare(s,{...a,position:rooms.hill.spawn}),/TOO_FAR/);
 assert.throws(()=>parseLifeCommand({...a,payload:{command:{verb:'expand-land',region:'hill-edge',expansionAllowed:true}}}),/INVALID_LIFE_COMMAND/);assert.deepEqual(s,before);
 await rejected({...s,energy:3},{verb:'expand-land',region:'hill-edge'},/REST_NEEDED/);
});
test('explicit expansion charges once, keeps old coordinates and allows exactly four genuine multi-place beds',async()=>{
 let s=await twoBeds(),old=structuredClone(s.landV1!.plots),cash=s.cash,energy=s.energy,minute=s.townMinutes!;s=await step(s,{verb:'expand-land',region:'hill-edge'});
 assert.equal(s.landV1!.schema,2);assert.deepEqual(s.landV1!.plots,old);assert.deepEqual([s.cash,s.energy,s.townMinutes],[cash,energy-4,minute+20]);assert.equal(landMaximum(s.landV1),4);
 await rejected(s,{verb:'expand-land',region:'hill-edge'},/LAND_ALREADY_EXPANDED/);
 for(const b of beds.slice(2)){s=move(s,landRegion(b.region)!.scene);assert.equal(landGeometry(s,b.region,b.at),null);s=await step(s,{verb:'cultivate',...b})}
 assert.deepEqual(s.landV1!.plots.map(p=>p.id),[1,2,3,4].map(n=>'land-bed-'+n));assert.deepEqual(s.landV1!.plots.slice(0,2),old);assert.equal(host.lifeProject(s).plants!.plots.length,4);
 for(const b of s.landV1!.plots){const scene=landRegion(b.region)!.scene,w=landWorld(dynamicWorld(s.flags,true),s.landV1);assert.equal(walkable(w,scene,{x:b.at.x-8,y:b.at.y-12}),false);assert.ok(findPath(w,scene,rooms[scene].spawn,landApproach(b.at)).length)}
 await rejected(s,{verb:'cultivate',region:'hill-edge',at:{x:548,y:840}},/LAND_CAPACITY/);host.runtime.assertReadable(s);
});
test('new slot geometry still rejects overlap, out-of-patch, protected route and current/saved player footprint',async()=>{
 let s=await twoBeds();s=await step(s,{verb:'expand-land',region:'hill-edge'});s=move(s,'hill');
 await rejected(s,{verb:'cultivate',region:'hill-edge',at:beds[0].at},/LAND_OVERLAP/);
 await rejected(s,{verb:'cultivate',region:'hill-edge',at:{x:100,y:100}},/LAND_OUTSIDE/);
 const at=beds[2].at;await rejected({...s,position:{x:at.x-8,y:at.y-12}},{verb:'cultivate',region:'hill-edge',at},/LAND_PLAYER_SPACE/);
 assert.equal(landGeometry(s,'hill-edge',at,s.position,[{x:at.x-20,y:at.y-20,w:40,h:40}]),'LAND_PROTECTED');
});
test('slots3/4 grow, dry safely, yield three, each save one seed; saved seed starts a new plant and renews quota',async()=>{
 let s=pinLegacy(await fourBeds(),r);addLot(s,r,snapPeaV2Ref,'seed',2,randomUUID());
 for(const id of ['life-bed-3','life-bed-4'])s=await step(s,{verb:'plant',plot:id,ref:snapPeaV2Ref});
 s={...s,townMinutes:s.townMinutes!+1440};for(const id of ['life-bed-3','life-bed-4']){assert.equal(lifePlotStatus(s,id,r)!.ready,false);assert.equal(lifePlotStatus(s,id,r)!.grown,0);s=await step(s,{verb:'water',plot:id})}
 s={...s,townMinutes:s.townMinutes!+720};const harvests=[];
 for(const id of ['life-bed-3','life-bed-4']){const a=command(s,{verb:'harvest',plot:id});s=(await host.runtime.prepare(s,a)).head;harvests.push(a.action_id)}
 assert.equal(s.items['life-produce:snap-pea'],6);
 for(const batch of harvests){s=await step(s,{verb:'save-seed',ref:snapPeaV2Ref,harvestBatch:batch});await rejected(s,{verb:'save-seed',ref:snapPeaV2Ref,harvestBatch:batch},/SEED_QUOTA_SPENT/)}
 assert.deepEqual([s.items['life-seed:snap-pea'],s.items['life-produce:snap-pea']],[2,4]);const previousPlants=s.lifeV1!.seedQuotaV1!.harvests.map(h=>h.plant.id);
 s=await step(s,{verb:'plant',plot:'life-bed-3',ref:snapPeaV2Ref});assert.ok(!previousPlants.includes(s.lifeV1!.seedQuotaV1!.plants['life-bed-3'].id));s=await step(s,{verb:'water',plot:'life-bed-3'});s={...s,townMinutes:s.townMinutes!+720};s=await step(s,{verb:'harvest',plot:'life-bed-3'});s=await step(s,{verb:'save-seed',ref:snapPeaV2Ref});assert.equal(s.items['life-seed:snap-pea'],2);assertLifeReadable(s,r);
});
test('all four new beds plus three original crops retain seven distinct live provenance records',async()=>{
 let s=pinLegacy(await fourBeds(),r);addLot(s,r,snapPeaV2Ref,'seed',4,randomUUID());
 for(const b of s.landV1!.plots){s=move(s,landRegion(b.region)!.scene);s=await step(s,{verb:'plant',plot:b.id.replace('land-','life-'),ref:snapPeaV2Ref})}
 s=move(s,'garden');for(const [i,crop] of ['radish','basil','tomato'].entries()){const e=entityAt('garden','crop-bed-'+(i+1))!;s=(await host.runtime.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:e.approach,target:e.id,action:'plant:'+crop})).head}
 assert.equal(Object.keys(s.lifeV1!.seedQuotaV1!.plants).length,7);assert.equal(new Set(Object.values(s.lifeV1!.seedQuotaV1!.plants).map(p=>p.id)).size,7);host.runtime.assertReadable(s);
});
test('clear occupied bed rejects, empty clear keeps capacity, seed sources and permissions; rebuilding uses freed ID',async()=>{
 let s=pinLegacy(await fourBeds(),r);addLot(s,r,snapPeaV2Ref,'seed',1,randomUUID());s=await step(s,{verb:'plant',plot:'life-bed-3',ref:snapPeaV2Ref});await rejected(s,{verb:'clear-bed',plot:'land-bed-3'},/LAND_BED_OCCUPIED/);
 s=await step(s,{verb:'water',plot:'life-bed-3'});s={...s,townMinutes:s.townMinutes!+720};s=await step(s,{verb:'harvest',plot:'life-bed-3'});s=await step(s,{verb:'save-seed',ref:snapPeaV2Ref});
 const kept=structuredClone(s.lifeV1),permissions=structuredClone(s.landV1!.permissions),cash=s.cash,energy=s.energy,minute=s.townMinutes!;s=await step(s,{verb:'clear-bed',plot:'land-bed-3'});
 assert.deepEqual([s.cash,s.energy,s.townMinutes],[cash,energy-2,minute+10]);assert.equal(landMaximum(s.landV1),4);assert.equal(s.landV1!.plots.length,3);assert.deepEqual(s.landV1!.permissions,permissions);assert.deepEqual(s.lifeV1,kept);await rejected(s,{verb:'clear-bed',plot:'land-bed-3'},/LAND_BED_MISSING/);
 s=await step(s,{verb:'cultivate',region:'hill-edge',at:beds[2].at});assert.equal(s.landV1!.plots.at(-1)!.id,'land-bed-3');assert.deepEqual(s.lifeV1,kept);await rejected(s,{verb:'save-seed',ref:snapPeaV2Ref},/SEED_QUOTA_SPENT/);
});
test('strict expanded save rejects missing evidence, old schema extra slots and unbound new plants; no read writes',async()=>{
 const s=await fourBeds(),before=structuredClone(s);assertLandReadable(s);
 const variants=[{...s.landV1,schema:1},{...s.landV1,expansion:undefined},{...s.landV1,permissions:{}},{...s.landV1,plots:[...s.landV1!.plots,{...s.landV1!.plots[0],id:'land-bed-5'}]}];
 for(const landV1 of variants)assert.throws(()=>assertLandReadable({...s,landV1} as any),/UNSUPPORTED_LAND_SAVE/);
 const plant=pinLegacy(s,r);plant.lifeV1!.plots['life-bed-3']={ref:snapPeaV2Ref,grown:0,updatedAt:s.townMinutes!,wetUntil:s.townMinutes!};plant.landV1!.plots=plant.landV1!.plots.filter(p=>p.id!=='land-bed-3');assert.throws(()=>assertLifeReadable(plant,r),/UNSUPPORTED_LIFE_SAVE/);assert.deepEqual(s,before);
});
test('stop new expansion retains expanded reader and current3/4 plants, water/harvest/seed',async()=>{
 const stopped=createLifePlantsB2(runtime,true,{expansionStarts:false});let s=await twoBeds();await rejected(s,{verb:'expand-land',region:'hill-edge'},/LAND_EXPANSION_CLOSED/,stopped);
 s=await step(s,{verb:'expand-land',region:'hill-edge'});await rejected(s,{verb:'cultivate',...beds[2]},/LAND_EXPANSION_CLOSED/,stopped);
 s=await step(s,{verb:'cultivate',...beds[2]});s=pinLegacy(s,r);addLot(s,r,snapPeaV2Ref,'seed',1,randomUUID());s=await step(s,{verb:'plant',ref:snapPeaV2Ref,plot:'life-bed-3'});stopped.runtime.assertReadable(s);
 s=await step(s,{verb:'water',plot:'life-bed-3'},stopped);s={...s,townMinutes:s.townMinutes!+720};s=await step(s,{verb:'harvest',plot:'life-bed-3'},stopped);s=await step(s,{verb:'save-seed',ref:snapPeaV2Ref},stopped);assert.equal(s.items['life-seed:snap-pea'],1);assert.equal(s.landV1!.schema,2);
});
test('SQLite expansion/clear CAS, receipt retry, changed-ID payload conflict, restart and owner isolation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'harbor-land-phase2-')),config={path:join(dir,'qa.sqlite'),worldId:'land-phase2-qa',gameId:'land-phase2-qa',environment:'test'},template=await twoBeds();let store=openAsyncSqliteAuthorityStore(config);
 try{const local=createLifePlantsB2({...runtime,initial:(_l:any,id:string)=>({...structuredClone(template),id,version:0,cursor:0,history:[]})});let auth=new AsyncSessionAuthority(store,local.runtime),s=await auth.create('synthetic-land-A',randomUUID(),'en');const a=command(s,{verb:'expand-land',region:'hill-edge'}),b={...a,action_id:randomUUID()},race=await Promise.allSettled([auth.action('synthetic-land-A',s.id,a),auth.action('synthetic-land-A',s.id,b)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);const winner=race[0].status==='fulfilled'?a:b;s=await auth.get('synthetic-land-A',s.id);assert.equal(s.landV1.schema,2);const before=structuredClone(s);await auth.action('synthetic-land-A',s.id,winner);assert.deepEqual(await auth.get('synthetic-land-A',s.id),before);await assert.rejects(auth.action('synthetic-land-A',s.id,{...winner,payload:{command:{verb:'clear-bed',plot:'land-bed-1'}},action:'life:clear-bed',target:'land-bed-1'}),/ACTION_ID_CONFLICT/);
 const clear=command(s,{verb:'clear-bed',plot:'land-bed-1'});s=(await auth.action('synthetic-land-A',s.id,clear)).head;assert.equal(s.landV1.plots.length,1);await auth.action('synthetic-land-A',s.id,clear);assert.deepEqual(await auth.get('synthetic-land-A',s.id),s);await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,host.runtime);assert.deepEqual(await auth.get('synthetic-land-A',s.id),s);await auth.action('synthetic-land-A',s.id,winner);assert.deepEqual(await auth.get('synthetic-land-A',s.id),s);await assert.rejects(auth.get('synthetic-land-B',s.id),/SESSION_NOT_FOUND/);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
test('full published assembly settles natural time before expansion, exact receipt replay and atomic failure',async()=>{
 let now=100000;const template=await twoBeds(),assembly=createExplorationAssembly({now:()=>now,boot:'land-phase2-qa',defaultRate:4000,initial:(_l:any,id:string)=>({...structuredClone(template),id,version:0,cursor:0,history:[]}),resolveDialogue:async()=>{throw Error('MODEL_FORBIDDEN')},afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:createReviewedAnimalLife,decorateLife:(a:any)=>withWildMint(withBasilPlantUses(a),{enabled:true,newStarts:true})});
 const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:randomUUID(),gameId:'land-phase2-clock',environment:'test'}),owner='synthetic-land-clock',client=randomUUID(),auth=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store);let s=await auth.create(owner,randomUUID(),'en');
 try{const open=async()=>{const last=s.activePlayClock?.transport?.last.ack;await auth.activePlay(owner,s.id,{action_id:activePlayActionId(s.id,(last?.ordinal??0)+1),expected_version:s.version,scene:s.scene,position:s.position,target:'',action:'candidate-active-open',payload:{client,ordinal:(last?.ordinal??0)+1,previous:last?.token??''}});s=await auth.get(owner,s.id)};
 const half=async()=>{const c=s.activePlayClock,last=c.transport.last.ack;now+=2000;await auth.activePlay(owner,s.id,{action_id:activePlayActionId(s.id,last.ordinal+1),expected_version:s.version,scene:s.scene,position:s.position,target:'',action:'candidate-active-tick',payload:{client,ordinal:last.ordinal+1,previous:last.token,lease:c.lease.id,sequence:c.lease.sequence+1,activeMs:2000}});s=await auth.get(owner,s.id)};
 await open();await half();const minute=s.townMinutes;now+=2000;const a={...command(s,{verb:'expand-land',region:'hill-edge'}),position:s.position,activePlay:{client,lease:s.activePlayClock.lease.id,activeMs:2000}};s=(await auth.action(owner,s.id,a)).head;assert.equal(s.townMinutes,minute+21);assert.equal(s.landV1.schema,2);const before=structuredClone(s);await auth.action(owner,s.id,a);assert.deepEqual(await auth.get(owner,s.id),before);
 await open();await half();const refused=structuredClone(s);now+=2000;const bad={...command(s,{verb:'expand-land',region:'hill-edge'}),position:s.position,activePlay:{client,lease:s.activePlayClock.lease.id,activeMs:2000}};await assert.rejects(auth.action(owner,s.id,bad),e=>{assert.deepEqual(activeBusinessHttpFailure(e),{status:409,body:{error:'LAND_ALREADY_EXPANDED',terminal:true}});return true});assert.deepEqual(await auth.get(owner,s.id),refused);
 }finally{await store.close()}
});
test('finite new gameplay refusals are terminal; unsupported land/provenance and unknown failures remain retryable',()=>{
 for(const code of ['LAND_EXPANSION_CLOSED','LAND_EXPANSION_PERMISSION','LAND_EXPANSION_NOT_READY','LAND_ALREADY_EXPANDED','LAND_BED_MISSING','LAND_BED_OCCUPIED'])assert.equal(activeBusinessHttpFailure(brandActivePrepareFailure(Error(code))).body.terminal,true);
 for(const code of ['UNSUPPORTED_LAND_SAVE','UNSUPPORTED_SEED_QUOTA_SAVE','ECONNRESET','FUTURE_LAND_FAILURE'])assert.equal(activeBusinessHttpFailure(brandActivePrepareFailure(Error(code))).body.terminal,false);
});
test('existing rain policy applies separately to slots3/4, with no seed creation or hidden hand-watering',async()=>{
 let s=pinLegacy(await fourBeds(),r);addLot(s,r,snapPeaV2Ref,'seed',2,randomUUID());for(const plot of ['life-bed-3','life-bed-4'])s=await step(s,{verb:'plant',plot,ref:snapPeaV2Ref});s={...s,townMinutes:900,weatherV1:createWeatherState(900)};
 const before=structuredClone(s),next={...structuredClone(s),townMinutes:1080};createWeatherSettlement({enabled:true}).settle(s,next);for(const plot of ['life-bed-3','life-bed-4'])assert.equal(lifePlotStatus(next,plot,r)!.grown,60);assert.equal(Object.keys(next.weatherV1!.water).length,2);assert.ok(Object.values(next.weatherV1!.water).every(n=>n===60));assert.deepEqual(next.items,before.items);assert.deepEqual(next.lifeV1!.seedQuotaV1,before.lifeV1!.seedQuotaV1);assert.deepEqual(s,before);assertLifeReadable(next,r);assert.equal(validWeatherState(next.weatherV1,1080,2),false);assert.equal(validWeatherState(next.weatherV1,1080,4),true);const patch=weatherPatch(before,next);const confirmed=applyWeatherPatch({...before,townMinutes:1080},patch,before);assert.deepEqual(confirmed.lifeV1!.plots,next.lifeV1!.plots);const bad=structuredClone(patch!);bad.weatherV1.water['land:life-bed-3']=61;assert.throws(()=>applyWeatherPatch({...before,townMinutes:1080},bad,before),/WEATHER_REPLY_UNCONFIRMED/);
});
