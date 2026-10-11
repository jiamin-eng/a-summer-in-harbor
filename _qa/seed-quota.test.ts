import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {initial,type Action} from '../src/story/state';
import {rooms,entityAt} from '../src/world/data';
import {runtime} from '../server/runtime';
import {createLifePlantsB2,createPlantsRegistry,snapPeaV2Ref} from '../server/life-plants-b2';
import {withBasilPlantUses} from '../server/plant-basil';
import {createHarborLife} from '../server/life-assembly';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createReviewedAnimalLife} from '../server/reviewed-animal-life';
import {withWildMint} from '../server/wild-mint';
import {applyLife} from '../src/life/rules';
import {pinLegacy,assertLifeReadable,addLot,consumeLot} from '../src/life/save';
import {seedSources} from '../src/life/seed-quota';
import {lifeView} from '../server/life-view';
import {activeBusinessHttpFailure,brandActivePrepareFailure} from '../server/active-business-failure';
import type {Command,ContentRef,LifeSave} from '../src/life/types';
// @ts-expect-error pinned authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

const r=createPlantsRegistry(),b2=createLifePlantsB2(runtime);
export const seedQuotaFixture=(id=randomUUID()):LifeSave=>({...initial('en',id),scene:'garden',position:rooms.garden.spawn,visited:Object.keys(rooms),known:['theo','dani'],flags:['key','unpacked','garden-agreed','alternative-route'],items:{key:1,'seed-basil':1,'seed-radish':1,'seed-tomato':1}});
const authored=(s:LifeSave,target:string,action:string):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,target)!.approach,target,action});
const life=(s:LifeSave,c:Command):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target:'life-bag',action:'life:'+c.verb,payload:{command:c}});
export async function growAuthored(s:LifeSave,crop='basil',plot='crop-bed-2'){
 s=(await b2.runtime.prepare(s,authored(s,plot,'plant:'+crop))).head;
 const planted=s.lifeV1!.seedQuotaV1!.plants[plot].id;
 s=(await b2.runtime.prepare(s,authored(s,plot,'water-crop'))).head;
 const minutes=r.get(r.ref('crop:'+crop)).growMinutes;
 // Synthetic unit clock fixture: actual crop commands, no forged harvest goods.
 s={...s,townMinutes:(s.townMinutes??540)+Math.min(minutes,720)};
 if(minutes>720){s=(await b2.runtime.prepare(s,authored(s,plot,'water-crop'))).head;s={...s,townMinutes:(s.townMinutes??540)+minutes-720};}
 const a=authored(s,plot,'harvest-crop');s=(await b2.runtime.prepare(s,a)).head;
 return {s,planted,harvest:a.action_id};
}
const convert=async(s:LifeSave,ref=r.ref('crop:basil'),harvestBatch?:string)=>
 (await b2.runtime.prepare(s,life(s,{verb:'save-seed',ref,...(harvestBatch?{harvestBatch}:{})}))).head;
const direct=(s:LifeSave,c:Command)=>applyLife(s,{actionId:randomUUID(),expectedVersion:s.version,command:c},r,{scene:s.scene,target:'land-bed-1',plot:'life-bed-1',cultivated:true}).head;

for(const crop of ['radish','basil','tomato'])test('new authored '+crop+': real plant/harvest IDs; one seed per plant, remainder unchanged',async()=>{
 const ref=r.ref('crop:'+crop),g=await growAuthored(seedQuotaFixture(),crop),before=structuredClone(g.s);
 assert.equal(g.s.lifeV1!.seedQuotaV1!.harvests[0].plant.id,g.planted);
 assert.equal(g.s.lifeV1!.seedQuotaV1!.harvests[0].id,g.harvest);
 let s=await convert(g.s,ref,g.harvest);assert.equal(s.items[r.item(ref,'produce')],r.get(ref).yield-1);
 assert.equal(s.items[r.item(ref,'seed')],1);assert.equal(s.lifeV1!.seedQuotaV1!.harvests[0].seedSpent,true);
 await assert.rejects(convert(s,ref,g.harvest),/SEED_QUOTA_SPENT/);await assert.rejects(convert(s,ref),/SEED_QUOTA_SPENT/);
 assert.deepEqual(g.s,before);assertLifeReadable(s,r);
});
test('old raw, pinned and standing plants preserve unrestricted goods; reads do not pin or alter',async()=>{
 let s=seedQuotaFixture();s.items['crop-basil']=12000;s.plots={'crop-bed-2':{crop:'basil',grown:720,updatedAt:540,wetUntil:540}};
 const before=structuredClone(s);lifeView(s,r);assert.deepEqual(s,before);
 s=(await b2.runtime.prepare(s,authored(s,'crop-bed-2','harvest-crop'))).head;
 assert.equal(s.lifeV1,undefined);assert.equal(s.items['crop-basil'],12003);
 s=await convert(s);s=await convert(s);assert.equal(s.items['crop-basil'],12001);assert.equal(s.lifeV1!.seedQuotaV1,undefined);
 let old=pinLegacy(seedQuotaFixture(),r);old.lifeV1!.plots['life-bed-1']={ref:r.ref('crop:snap-pea'),grown:720,updatedAt:540,wetUntil:540};
 old=direct(old,{verb:'harvest',plot:'life-bed-1'});old=direct(old,{verb:'save-seed',ref:r.ref('crop:snap-pea')});old=direct(old,{verb:'save-seed',ref:r.ref('crop:snap-pea')});
 assert.equal(old.items['life-seed:snap-pea'],2);assert.equal(old.lifeV1!.seedQuotaV1,undefined);
});
test('new B2 pinned @2 plant obeys quota; saved packet starts a distinct repeat instance',()=>{
 let s=pinLegacy(seedQuotaFixture(),r);addLot(s,r,snapPeaV2Ref,'seed',1,randomUUID());
 s=direct(s,{verb:'plant',ref:snapPeaV2Ref,plot:'life-bed-1'});const first=s.lifeV1!.seedQuotaV1!.plants['life-bed-1'].id;
 s=direct(s,{verb:'water',plot:'life-bed-1'});s={...s,townMinutes:(s.townMinutes??540)+720};s=direct(s,{verb:'harvest',plot:'life-bed-1'});
 s=direct(s,{verb:'save-seed',ref:snapPeaV2Ref});assert.throws(()=>direct(s,{verb:'save-seed',ref:snapPeaV2Ref}),/SEED_QUOTA_SPENT/);
 s=direct(s,{verb:'plant',ref:snapPeaV2Ref,plot:'life-bed-1'});assert.notEqual(s.lifeV1!.seedQuotaV1!.plants['life-bed-1'].id,first);
 s=direct(s,{verb:'water',plot:'life-bed-1'});s={...s,townMinutes:(s.townMinutes??540)+720};s=direct(s,{verb:'harvest',plot:'life-bed-1'});
 s=direct(s,{verb:'save-seed',ref:snapPeaV2Ref});assert.equal(s.items['life-seed:snap-pea'],1);assert.equal(s.lifeV1!.seedQuotaV1!.harvests.filter(h=>h.seedSpent).length,2);
 assertLifeReadable(s,r);
});
test('mixed old/new and two plants: stale explicit source cannot spend another quota; generic saves skip spent plants',async()=>{
 let s=seedQuotaFixture();s.items['crop-basil']=2;s.items['seed-basil']=2;
 const a=await growAuthored(s);const b=await growAuthored(a.s);s=b.s;
 assert.equal(seedSources(s,r.ref('crop:basil'),s.items['crop-basil']).legacyQuantity,2);
 s=await convert(s,r.ref('crop:basil'),a.harvest);s=await convert(s);s=await convert(s);
 s=await convert(s);assert.equal(s.items['seed-basil'],4);
 const frozen=structuredClone(s);await assert.rejects(convert(s,r.ref('crop:basil'),a.harvest),/SEED_QUOTA_SPENT/);
 await assert.rejects(convert(s,r.ref('crop:basil'),randomUUID()),/HARVEST_BATCH_UNAVAILABLE/);assert.deepEqual(s,frozen);
 assert.equal(lifeView(s,r).batches.filter(b=>b.kind==='produce').length,2);assert.ok(lifeView(s,r).batches.filter(b=>b.kind==='produce').every(b=>!b.saveSeedAvailable));
});
test('authored sale and both resident orders decrement real batch quantities without quota laundering',async()=>{
 let g=await growAuthored(seedQuotaFixture()),s=await convert(g.s,r.ref('crop:basil'),g.harvest);
 s={...s,scene:'grocery',position:rooms.grocery.spawn,townMinutes:1980};s=(await b2.runtime.prepare(s,authored(s,'crop-counter','sell-crop:basil'))).head;
 assert.equal(s.lifeV1!.seedQuotaV1!.harvests[0].quantity,1);await assert.rejects(convert(s),/SEED_QUOTA_SPENT/);
 const second=await growAuthored({...s,scene:'garden',position:rooms.garden.spawn});s=second.s;
 const basil=withBasilPlantUses(createHarborLife(runtime));s={...s,scene:'cafe',position:entityAt('cafe','theo')!.approach,townMinutes:3420};
 for(const verb of ['read-offer','accept-basil','deliver-basil'])s=(await basil.runtime.prepare(s,{...life(s,{verb:'close-order'}),target:'theo',action:'plant-use:'+verb,payload:undefined})).head;
 assert.equal(s.items['crop-basil'],2);assert.equal(s.lifeV1!.seedQuotaV1!.harvests.length,1);assert.equal(s.lifeV1!.seedQuotaV1!.harvests[0].quantity,2);assert.equal(s.lifeV1!.seedQuotaV1!.harvests[0].seedSpent,false);
 s=await convert(s);assert.equal(s.items['seed-basil'],1);
 let pea=pinLegacy(seedQuotaFixture(),r);addLot(pea,r,snapPeaV2Ref,'seed',1,randomUUID());pea=direct(pea,{verb:'plant',ref:snapPeaV2Ref,plot:'life-bed-1'});pea=direct(pea,{verb:'water',plot:'life-bed-1'});pea={...pea,townMinutes:1270};pea=direct(pea,{verb:'harvest',plot:'life-bed-1'});
 pea={...pea,scene:'cafe',townMinutes:1980};pea=applyLife(pea,{actionId:randomUUID(),expectedVersion:pea.version,command:{verb:'accept-order',ref:snapPeaV2Ref}},r,{scene:'cafe',target:'theo',resident:'theo',premiseRead:true}).head;
 pea=applyLife(pea,{actionId:randomUUID(),expectedVersion:pea.version,command:{verb:'deliver-order'}},r,{scene:'cafe',target:'theo',resident:'theo'}).head;
 assert.equal(pea.lifeV1!.seedQuotaV1!.harvests[0].quantity,1);pea=direct(pea,{verb:'save-seed',ref:snapPeaV2Ref});assert.equal(pea.lifeV1!.seedQuotaV1!.harvests.length,0);assertLifeReadable(pea,r);
});
test('consuming a whole harvest retires only its real record; unrelated plant quota stays intact',async()=>{
 let s=seedQuotaFixture();s.items['seed-basil']=2;const a=await growAuthored(s),b=await growAuthored(a.s);s=b.s;
 consumeLot(s,r,r.ref('crop:basil'),'produce',3);assert.equal(s.lifeV1!.seedQuotaV1!.harvests[0].id,b.harvest);assert.equal(s.lifeV1!.seedQuotaV1!.harvests.length,1);
 assertLifeReadable(s,r);s=await convert(s);await assert.rejects(convert(s),/SEED_QUOTA_SPENT/);
});
test('malformed or duplicated provenance refuses reads; gameplay rejection terminal, unsupported data nonterminal',async()=>{
 const {s}=await growAuthored(seedQuotaFixture());
 for(const mutate of [(q:any)=>q.policy='new-unknown',(q:any)=>q.harvests.push(structuredClone(q.harvests[0])),(q:any)=>q.harvests[0].quantity=99,(q:any)=>q.harvests[0].plant.ref.hash='0'.repeat(64),(q:any)=>q.harvests[0].seedSpent=0,(q:any)=>q.plants['crop-bed-1']=q.harvests[0].plant]){
  const bad=structuredClone(s);mutate(bad.lifeV1!.seedQuotaV1);assert.throws(()=>assertLifeReadable(bad,r),/UNSUPPORTED_SEED_QUOTA_SAVE/);
 }
 assert.equal(activeBusinessHttpFailure(brandActivePrepareFailure(Error('SEED_QUOTA_SPENT'))).body.terminal,true);
 assert.equal(activeBusinessHttpFailure(brandActivePrepareFailure(Error('UNSUPPORTED_SEED_QUOTA_SAVE'))).body.terminal,false);
});
test('actual SQLite quota CAS, original-ID replay, failed action rollback, close/reopen and owner isolation',async()=>{
 const dir=mkdtempSync('/tmp/harbor-seed-quota-'),config={path:join(dir,'qa.sqlite'),worldId:'seed-quota',gameId:'seed-quota'};let store=openAsyncSqliteAuthorityStore(config);
 const grown=await growAuthored(seedQuotaFixture()),rt=createLifePlantsB2({...runtime,initial:(_l:any,id:string)=>({...structuredClone(grown.s),id,version:0,cursor:0,history:[]})}).runtime;
 try{
  let auth=new AsyncSessionAuthority(store,rt),s:LifeSave=await auth.create('synthetic-quota-owner',randomUUID(),'en');
  const a=life(s,{verb:'save-seed',ref:r.ref('crop:basil'),harvestBatch:grown.harvest}),other={...a,action_id:randomUUID()};
  const results=await Promise.allSettled([auth.action('synthetic-quota-owner',s.id,a),auth.action('synthetic-quota-owner',s.id,other)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const winner=results[0].status==='fulfilled'?a:other;
  s=await auth.get('synthetic-quota-owner',s.id);assert.deepEqual([s.items['crop-basil'],s.items['seed-basil'],s.version],[2,1,1]);
  await auth.action('synthetic-quota-owner',s.id,winner);assert.deepEqual(await auth.get('synthetic-quota-owner',s.id),s);
  const deny=life(s,{verb:'save-seed',ref:r.ref('crop:basil'),harvestBatch:grown.harvest});await assert.rejects(auth.action('synthetic-quota-owner',s.id,deny),/SEED_QUOTA_SPENT/);
  await store.transaction(async(repo:any)=>{assert.equal((await repo.events(s.id,-1)).length,1);assert.ok(!await repo.receipt('synthetic-quota-owner',deny.action_id));});
  await assert.rejects(auth.action('synthetic-quota-owner',s.id,{...winner,payload:{command:{verb:'save-seed',ref:r.ref('crop:radish')}}}));
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,createLifePlantsB2(runtime,false).runtime);
  assert.deepEqual(await auth.get('synthetic-quota-owner',s.id),s);await auth.action('synthetic-quota-owner',s.id,winner);assert.deepEqual(await auth.get('synthetic-quota-owner',s.id),s);await assert.rejects(auth.get('another-owner',s.id));
 }finally{await store.close();rmSync(dir,{recursive:true,force:true});}
});
test('current formal weather/animal/mint/clock assembly reads quota and preserves it during unrelated chapel action',async()=>{
 const {s}=await growAuthored(seedQuotaFixture());const a=createExplorationAssembly({afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:createReviewedAnimalLife,decorateLife:(r:any)=>withWildMint(withBasilPlantUses(r,{enabled:true,newStarts:true}),{enabled:true,newStarts:true})});
 a.runtime.assertReadable(s);const before=structuredClone(s.lifeV1!.seedQuotaV1);const e=rooms.chapel.entities.find(e=>e.id==='chapel-note')!;
 const located={...s,scene:'chapel',position:e.approach};const result=await a.runtime.prepare(located,{...authored(located,e.id,'chapel-read-notice')});
 assert.deepEqual(result.head.lifeV1.seedQuotaV1,before);assert.equal(a.lifeProject(result.head).batches.find((b:any)=>b.harvestBatch)?.quantity,3);
});
