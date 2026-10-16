import {test} from 'node:test';
import assert from 'node:assert/strict';
import {landWorkerChain} from './land-worker-chain';
import {twoBeds,fourBeds,command,step} from './land-phase2-fixture';
import {landApproach} from '../src/life/land';
import {pinLegacy,addLot} from '../src/life/save';
import {createPlantsRegistry,snapPeaV2Ref} from '../server/life-plants-b2';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const cap={'X-Harbor-Land':'2'};

test('Worker chain: exact public capability crosses all reads and writes; identity stays private',async()=>{
 const f=await landWorkerChain(await twoBeds());try{
  const s=await f.create('2'),path='/api/sessions/'+s.id;
  for(const tail of ['','/life','/land-preview?region=hill-edge']){
   const r=await f.invoke(path+tail,{headers:{...cap,'X-Harbor-Dynamic-Assets':'1','X-Harbor-Owner':'forged','X-Harbor-Edge':'forged',Cookie:'unrelated=never-forward'}});
   assert.equal(r.status,200);assert.equal(f.trace.at(-1).land,'2');assert.equal(f.trace.at(-1).dynamicAssets,'1');assert.equal(f.trace.at(-1).edgeMatched,true);assert.match(f.trace.at(-1).owner,/^[a-f0-9]{64}$/);assert.equal(f.trace.at(-1).cookieForwarded,false);
  }
  const n=f.trace.length;
  assert.equal((await f.invoke(path,{account:null,headers:cap})).status,401);
  assert.equal((await f.invoke(path,{headers:{...cap,Origin:'https://evil.qa.invalid'}})).status,403);
  assert.equal(f.trace.length,n);
  for(const value of ['1','3','2, 2','2, 3','02']){assert.equal((await f.invoke(path,{headers:{'X-Harbor-Land':value}})).status,200);assert.equal(f.trace.at(-1).land,null)}
  assert.equal(f.modelCalls,0);
 }finally{await f.close()}
});

test('Worker chain: schema1 two-bed old client reads stay pure; incapable expansion stays recoverable',async()=>{
 const f=await landWorkerChain(await twoBeds());try{
  const s=await f.create(),path='/api/sessions/'+s.id;
  for(const tail of ['','/life','/land-preview?region=hill-edge'])assert.equal((await f.invoke(path+tail)).status,200);
  assert.equal((await f.invoke(path+'/land-preview?region=hill-edge',{headers:cap})).body.maximum,2);
  const r=await f.invoke(path+'/action',{body:command(s,{verb:'expand-land',region:'hill-edge'})});
  assert.deepEqual([r.status,r.body.error,r.body.terminal],[409,'CLIENT_REFRESH_REQUIRED',false]);
  assert.deepEqual((await f.invoke(path)).body,s);assert.equal(f.modelCalls,0);
 }finally{await f.close()}
});

test('Worker chain: expansion, same-ID retry and fresh read charge one action only',async()=>{
 const f=await landWorkerChain(await twoBeds());try{
  const s=await f.create('2'),path='/api/sessions/'+s.id,a=command(s,{verb:'expand-land',region:'hill-edge'});
  const r=await f.invoke(path+'/action',{body:a,headers:cap});assert.equal(r.status,200,JSON.stringify(r.body));
  const next=r.body.head;assert.deepEqual([next.landV1.schema,next.energy,next.townMinutes,next.version],[2,s.energy-4,s.townMinutes!+20,s.version+1]);
  const retries=await Promise.all([f.invoke(path+'/action',{body:a,headers:cap}),f.invoke(path+'/action',{body:a,headers:cap})]);for(const retry of retries)assert.deepEqual(retry.body,r.body);
  assert.deepEqual((await f.invoke(path,{headers:cap})).body,next);
  assert.equal((await f.invoke(path+'/land-preview?region=hill-edge',{headers:cap})).body.maximum,4);
  assert.equal(f.trace.filter(x=>x.method==='POST'&&x.path.endsWith('/action')).every(x=>x.land==='2'),true);
 }finally{await f.close()}
});

test('Worker chain: two concurrent expansion IDs on one version cannot double charge',async()=>{
 const f=await landWorkerChain(await twoBeds());try{
  const s=await f.create('2'),path='/api/sessions/'+s.id;
  const results=await Promise.all([0,1].map(()=>f.invoke(path+'/action',{headers:cap,body:command(s,{verb:'expand-land',region:'hill-edge'})})));
  assert.equal(results.filter(r=>r.status===200).length,1,JSON.stringify(results));
  const next=(await f.invoke(path,{headers:cap})).body;
  assert.deepEqual([next.version,next.energy,next.townMinutes,next.landV1.schema],[s.version+1,s.energy-4,s.townMinutes!+20,2]);
 }finally{await f.close()}
});

test('Worker chain: committed action with lost upstream reply recovers by original ID',async()=>{
 const f=await landWorkerChain(await twoBeds());try{
  const s=await f.create('2'),path='/api/sessions/'+s.id,a=command(s,{verb:'expand-land',region:'hill-edge'});f.loseNextActionReply();
  assert.equal((await f.invoke(path+'/action',{headers:cap,body:a})).status,503);
  const retry=await f.invoke(path+'/action',{headers:cap,body:a});assert.equal(retry.status,200);
  const next=(await f.invoke(path,{headers:cap})).body;assert.deepEqual(next,retry.body.head);assert.equal(next.energy,s.energy-4);assert.equal(next.version,s.version+1);assert.equal(f.trace.filter(x=>x.replyLost).length,1);
 }finally{await f.close()}
});

test('Worker chain: genuine four-bed schema2 reads/refresh; absent, unknown and duplicate capability safely refuse',async()=>{
 const f=await landWorkerChain(await fourBeds());try{
  const s=await f.create('2'),path='/api/sessions/'+s.id;assert.equal(s.landV1!.plots.length,4);
  for(let refresh=0;refresh<2;refresh++)for(const tail of ['','/life','/land-preview?region=hill-edge'])assert.equal((await f.invoke(path+tail,{headers:cap})).status,200);
  // Capability must not bypass the unchanged scene/land authorization.
  const wrongScene=await f.invoke(path+'/land-preview?region=courtyard-common',{headers:cap});assert.deepEqual([wrongScene.status,wrongScene.body.error],[400,'LAND_SCENE']);
  const incapable:HeadersInit[]=[{},{'X-Harbor-Land':'1'},{'X-Harbor-Land':'2, 2'}];
  for(const headers of incapable)for(const tail of ['','/life','/land-preview?region=hill-edge']){
   const r=await f.invoke(path+tail,{headers});assert.deepEqual([r.status,r.body.error,r.body.terminal],[409,'CLIENT_REFRESH_REQUIRED',false]);assert.equal(f.trace.at(-1).land,null);
  }
  for(const tail of ['','/life','/land-preview?region=hill-edge'])assert.notEqual((await f.invoke(path+tail,{headers:cap,account:'99101562'})).status,200);
  assert.deepEqual((await f.invoke(path,{headers:cap})).body,s);assert.equal(f.modelCalls,0);
 }finally{await f.close()}
});

test('Worker chain: old two-bed and actual four-bed saves survive SQLite close/reopen with fresh Worker',async()=>{
 for(const count of [2,4]){
  const directory=mkdtempSync(join(tmpdir(),'harbor-land-worker-006-')),databasePath=join(directory,'synthetic.sqlite');
  const template=await(count===2?twoBeds():fourBeds());let f=await landWorkerChain(template,{databasePath});
  try{
   const s=await f.create('2');assert.equal(s.landV1!.plots.length,count);await f.close();f=await landWorkerChain(template,{databasePath});
   const path='/api/sessions/'+s.id;
   assert.deepEqual((await f.invoke(path,{headers:cap})).body,s);
   assert.equal((await f.invoke(path+'/land-preview?region=hill-edge',{headers:cap})).body.maximum,count);
   assert.equal((await f.invoke(path)).status,count===2?200:409);
   assert.equal(f.modelCalls,0);
  }finally{await f.close();rmSync(directory,{recursive:true,force:true})}
 }
});

test('Worker chain: slots 3/4 actual harvest, single seed quota, occupied refusal and empty clear',async()=>{
 for(const slot of [3,4]){
  const registry=createPlantsRegistry();let template=pinLegacy(await fourBeds(),registry);addLot(template,registry,snapPeaV2Ref,'seed',1,randomUUID());
  template=await step(template,{verb:'plant',plot:'life-bed-'+slot,ref:snapPeaV2Ref});template=await step(template,{verb:'water',plot:'life-bed-'+slot});
  template={...template,townMinutes:template.townMinutes!+720,position:landApproach(template.landV1!.plots.find(p=>p.id==='land-bed-'+slot)!.at)};
  const f=await landWorkerChain(template);try{
   let s=await f.create('2');const path='/api/sessions/'+s.id;
   const occupied=await f.invoke(path+'/action',{headers:cap,body:command(s,{verb:'clear-bed',plot:'land-bed-'+slot})});assert.equal(occupied.body.error,'LAND_BED_OCCUPIED');assert.deepEqual((await f.invoke(path,{headers:cap})).body,s);
   const harvest=command(s,{verb:'harvest',plot:'life-bed-'+slot}),r=await f.invoke(path+'/action',{headers:cap,body:harvest});assert.equal(r.status,200,JSON.stringify(r.body));s=r.body.head;
   const seed=await f.invoke(path+'/action',{headers:cap,body:command(s,{verb:'save-seed',ref:snapPeaV2Ref,harvestBatch:harvest.action_id})});assert.equal(seed.status,200,JSON.stringify(seed.body));s=seed.body.head;
   assert.equal(s.items['life-produce:snap-pea'],2);assert.equal(s.items['life-seed:snap-pea'],1);
   assert.equal((await f.invoke(path+'/action',{headers:cap,body:command(s,{verb:'save-seed',ref:snapPeaV2Ref,harvestBatch:harvest.action_id})})).body.error,'SEED_QUOTA_SPENT');
   const before=structuredClone(s),clear=command(s,{verb:'clear-bed',plot:'land-bed-'+slot}),cleared=await f.invoke(path+'/action',{headers:cap,body:clear});assert.equal(cleared.status,200);s=cleared.body.head;
   assert.equal(s.landV1!.plots.length,3);assert.deepEqual(s.lifeV1!.seedQuotaV1,before.lifeV1!.seedQuotaV1);assert.deepEqual((await f.invoke(path+'/action',{headers:cap,body:clear})).body,cleared.body);assert.deepEqual((await f.invoke(path,{headers:cap})).body,s);assert.equal(f.modelCalls,0);
  }finally{await f.close()}
 }
});

test('real frontend client in Node -> Worker -> backend: pending retry, Continue and projections',async()=>{
 const f=await landWorkerChain(await twoBeds());
 const saved={window:(globalThis as any).window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 const values=new Map<string,string>();
 const win:any={alteruLocalStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)},location:{search:'',origin:f.env.HARBOR_PUBLIC_ORIGIN},Aigram:{isInAigram:true,telegramId:'99101561',callAigramAPI:()=>{throw Error('QA_PLATFORM_DISABLED')}}};win.parent=win;(globalThis as any).window=win;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 try{
  const original=await f.create('2');f.installClientFetch();
  const client=await import('../src/story/client');let s=await client.connect('en',original.id);assert.deepEqual(s,original);
  // This is the exact pending envelope retained by the old Worker 409. An
  // unsuccessful retry never deletes it or starts a second expansion ID.
  const pending='harbor-account:temporary-unverified%3A99101561:harbor-pending-v2:'+s.id;
  const action=command(s,{verb:'expand-land',region:'hill-edge'});values.set(pending,JSON.stringify({id:s.id,action}));
  f.loseNextActionReply();await assert.rejects(client.connect('en',s.id),/SERVICE_UNAVAILABLE/);assert.ok(values.has(pending));
  s=await client.connect('en',s.id);assert.equal(values.has(pending),false);assert.equal(s.energy,original.energy-4);assert.equal(s.version,original.version+1);assert.equal(s.landV1!.schema,2);
  const continued=await client.connect('en',s.id);assert.deepEqual(continued,s);assert.equal((await client.readLandPreview(s,'hill-edge')).maximum,4);assert.ok((await client.readLife(s)).animals);
  assert.equal(f.trace.every(x=>x.land==='2'),true);assert.equal(f.modelCalls,0);
 }finally{(globalThis as any).window=saved.window;if(saved.navigator)Object.defineProperty(globalThis,'navigator',saved.navigator);else delete (globalThis as any).navigator;await f.close()}
});
