import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {phase2Api} from './land-phase2-api';
import {twoBeds,fourBeds,step,command,move} from './land-phase2-fixture';
import {pinLegacy,addLot} from '../src/life/save';
import {createPlantsRegistry,snapPeaV2Ref} from '../server/life-plants-b2';
import {landEntity,landApproach} from '../src/life/land';
const create=async(api:Awaited<ReturnType<typeof phase2Api>>)=>(await api.invoke('/api/sessions',{enrollment_id:randomUUID(),locale:'en'})).body;
test('in-process real account HTTP: pure preview, expansion once, retained basil/mint/animals, other-account rejection',async()=>{
 const api=await phase2Api(await twoBeds());try{
  let s=await create(api);assert.ok(s.id);const route='/api/sessions/'+s.id,initial=structuredClone(s);
  for(let i=0;i<3;i++){const p=await api.invoke(route+'/land-preview?region=hill-edge');assert.equal(p.status,200);assert.equal(p.body.maximum,2);assert.equal(p.body.expansion.canConfirm,true)}assert.deepEqual((await api.invoke(route)).body,initial);assert.equal((await api.invoke(route,undefined,'99101501',{legacy:true})).status,200);
  const a=command(s,{verb:'expand-land',region:'hill-edge'}),result=await api.invoke(route+'/action',a);assert.equal(result.status,200,JSON.stringify(result.body));s=result.body.head;assert.deepEqual([s.landV1.schema,s.energy,s.townMinutes],[2,initial.energy-4,initial.townMinutes+20]);assert.deepEqual((await api.invoke(route+'/action',a)).body,result.body);
  const projection=await api.invoke(route+'/life');assert.equal(projection.status,200);assert.equal(projection.body.plantUses.basilEnabled,true);assert.equal(projection.body.plantUses.mintEnabled,true);assert.ok(projection.body.animals);assert.equal((await api.invoke(route+'/land-preview?region=hill-edge')).body.maximum,4);const legacy=await api.invoke(route,undefined,'99101501',{legacy:true});assert.deepEqual([legacy.status,legacy.body.error,legacy.body.terminal],[409,'CLIENT_REFRESH_REQUIRED',false]);assert.deepEqual((await api.invoke(route)).body,s);
  for(const suffix of ['', '/life','/land-preview?region=hill-edge'])assert.notEqual((await api.invoke(route+suffix,undefined,'99101502')).status,200);assert.equal((await api.invoke('/api/sessions',undefined,'99101502')).body.length,0);assert.deepEqual((await api.invoke(route)).body,s);assert.equal(api.modelCalls,0);
 }finally{await api.close()}
});
test('in-process HTTP extra slots: real ready harvest, explicit one-packet source, occupied clear rejection and empty reuse',async()=>{
 const r=createPlantsRegistry();let fixture=pinLegacy(await fourBeds(),r);addLot(fixture,r,snapPeaV2Ref,'seed',1,randomUUID());fixture=await step(fixture,{verb:'plant',plot:'life-bed-3',ref:snapPeaV2Ref});fixture=await step(fixture,{verb:'water',plot:'life-bed-3'});fixture={...fixture,townMinutes:fixture.townMinutes!+720,position:landApproach(fixture.landV1!.plots.find(p=>p.id==='land-bed-3')!.at)};
 const api=await phase2Api(fixture);try{
  let s=await create(api),route='/api/sessions/'+s.id;const before=structuredClone(s),occupied=await api.invoke(route+'/action',command(s,{verb:'clear-bed',plot:'land-bed-3'}));assert.equal(occupied.body.error,'LAND_BED_OCCUPIED');assert.deepEqual((await api.invoke(route)).body,before);
  const harvest=command(s,{verb:'harvest',plot:'life-bed-3'}),result=await api.invoke(route+'/action',harvest);assert.equal(result.status,200,JSON.stringify(result.body));s=result.body.head;assert.equal(s.items['life-produce:snap-pea'],3);
  const seed=command(s,{verb:'save-seed',ref:snapPeaV2Ref,harvestBatch:harvest.action_id});s=(await api.invoke(route+'/action',seed)).body.head;assert.equal(s.items['life-seed:snap-pea'],1);assert.equal(s.items['life-produce:snap-pea'],2);
  const frozen=structuredClone(s),again=await api.invoke(route+'/action',command(s,{verb:'save-seed',ref:snapPeaV2Ref,harvestBatch:harvest.action_id}));assert.equal(again.body.error,'SEED_QUOTA_SPENT');assert.deepEqual((await api.invoke(route)).body,frozen);
  const clear=command(s,{verb:'clear-bed',plot:'land-bed-3'}),cleared=await api.invoke(route+'/action',clear);assert.equal(cleared.status,200,JSON.stringify(cleared.body));s=cleared.body.head;assert.equal(s.landV1.plots.length,3);assert.deepEqual(s.lifeV1.seedQuotaV1,frozen.lifeV1.seedQuotaV1);assert.deepEqual((await api.invoke(route+'/action',clear)).body,cleared.body);assert.equal(api.modelCalls,0);
 }finally{await api.close()}
});
