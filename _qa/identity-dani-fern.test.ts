import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,symlinkSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {applyAction,type Save} from '../src/story/state';
import {rooms,entityAt} from '../src/world/data';
import {fernReady,fernCommand} from './ornamental-fern-fixture';
import {landWorkerChain} from './land-worker-chain';
import {createPlatformTokenVerifier,PLATFORM_SELF_URL} from '../server/platform-token-verifier';
import {assertOrnamentalFernReadable} from '../src/life/ornamental-fern';
import {fernQaAssembly} from './ornamental-fern-fixture';
import {IdentityEpoch} from '../src/account-link/epoch';

const id='9007199254740993',other='9007199254740992',token='synthetic.combined.A';
const caps={'X-Harbor-Land':'2','X-Harbor-Fern':'1'};
async function seed(){
 let s=await fernReady();
 // Authored rules create a small Dani root; scene/approach staging is synthetic.
 s={...s,scene:'garden',position:entityAt('garden','dani')!.approach};
 for(const action of ['introduce','talk:rg-personal'])s=applyAction(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target:'dani',action}).head;
 assert.ok(s.relationshipNextV1?.residents.dani);
 return {...s,scene:'station',position:entityAt('station','mara')!.approach};
}
function identity(sameSubjectTokens=[token]){
 let calls=0;
 const verifyPlatformToken=createPlatformTokenVerifier({fetchImpl:(async(input,init)=>{
  calls++;assert.equal(String(input),PLATFORM_SELF_URL);assert.equal(init?.method,'GET');
  const headers=new Headers(init?.headers);assert.equal(headers.get('Authorization'),null);
  return Response.json({retcode:0,errcode:0,data:{telegram_id:sameSubjectTokens.includes(headers.get('token')??'')?id:other}});
 }) as typeof fetch});
 return {id,token,verifyPlatformToken,get calls(){return calls}};
}
async function acquire(f:Awaited<ReturnType<typeof landWorkerChain>>){
 let s=await f.create('2');assert.equal(s.ornamentalFernV1,undefined);
 const path='/api/sessions/'+s.id;
 for(const verb of ['read-offer','accept'] as const){const r=await f.invoke(path+'/action',{headers:caps,body:fernCommand(s,verb)});assert.equal(r.status,200,JSON.stringify(r.body));s=r.body.head}
 const e=rooms.station.entities.find(e=>e.destination==='home')!;
 const r=await f.invoke(path+'/action',{headers:caps,body:{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:e.approach,target:e.id,action:'travel'}});
 assert.equal(r.status,200);return r.body.head as Save;
}

test('verified Worker/account chain retains Dani and fern, rejects wrong subject and preserves format refusal',async()=>{
 const ident=identity(),f=await landWorkerChain(await seed(),{identity:ident});
 try{
  let s=await acquire(f);const path='/api/sessions/'+s.id,dani=structuredClone(s.relationshipNextV1),plant=s.ornamentalFernV1!.plant!;
  const denied=await f.invoke(path,{headers:{...caps,Authorization:'Bearer synthetic.wrong'}});
  assert.equal(denied.status,401);assert.equal(denied.body.error,'PLATFORM_TELEGRAM_ID_MISMATCH');
  assert.equal((await f.invoke(path,{headers:{...caps,Authorization:''}})).status,401);
  for(const value of ['', '2','1, 1']){
   const r=await f.invoke(path,{headers:{...caps,'X-Harbor-Fern':value}});
   assert.deepEqual([r.status,r.body.error,r.body.terminal],[409,'CLIENT_REFRESH_REQUIRED',false]);
  }
  for(const verb of ['place','take'] as const){
   const before=structuredClone(s),command=fernCommand(s,verb),r=await f.invoke(path+'/action',{headers:caps,body:command});
   assert.equal(r.status,200);s=r.body.head;
   assert.equal(s.townMinutes,before.townMinutes!+20);assert.equal(s.cash,before.cash);
   assert.equal(s.ornamentalFernV1!.plant!.id,plant.id);assert.deepEqual(s.relationshipNextV1,dani);
   assert.deepEqual((await f.invoke(path+'/action',{headers:caps,body:command})).body,r.body);
  }
  assert.deepEqual((await f.invoke(path,{headers:caps})).body.relationshipNextV1,dani);
  assert.equal(f.modelCalls,0);assert.ok(ident.calls>0);
  assert.ok(f.trace.every(t=>t.authorizationForwarded&&t.identityMode==='platform-verified-v1'&&t.edgeMatched&&!t.cookieForwarded));
  assert.ok(f.trace.some(t=>t.fern==='1'&&t.land==='2'));
 }finally{await f.close()}
});

test('compatible stop-new restart keeps verified owner, both roots, receipts and existing fern movement',async()=>{
 const dir=mkdtempSync('/tmp/harbor-combined-stop-'),databasePath=join(dir,'synthetic.sqlite'),template=await seed();
 let f=await landWorkerChain(template,{databasePath,identity:identity()});
 try{
  let s=await acquire(f);const path='/api/sessions/'+s.id,dani=structuredClone(s.relationshipNextV1);
  await f.close();f=await landWorkerChain(template,{databasePath,identity:identity(),ornamentalFernStarts:false});
  assert.deepEqual((await f.invoke(path,{headers:caps})).body,s);
  for(const verb of ['place','take'] as const){const r=await f.invoke(path+'/action',{headers:caps,body:fernCommand(s,verb)});assert.equal(r.status,200);s=r.body.head;assert.deepEqual(s.relationshipNextV1,dani)}
  assertOrnamentalFernReadable(s);
  const fresh=await f.create('2'),newPath='/api/sessions/'+fresh.id;
  const blocked=await f.invoke(newPath+'/action',{headers:caps,body:fernCommand(fresh,'read-offer')});
  assert.equal(blocked.status,409);assert.equal(blocked.body.error,'ORNAMENTAL_FERN_STARTS_CLOSED');
  assert.deepEqual((await f.invoke(newPath,{headers:caps})).body,fresh);
  const next=await f.invoke(path,{account:other,headers:caps});assert.equal(next.status,401);
 }finally{await f.close();rmSync(dir,{recursive:true,force:true})}
});

test('frozen published ebc ordinary action preserves both new roots; forward reader resumes them',async()=>{
 const base='ebc67b08dcd553510a0525a11c9b0a9b83a7ee8a',dir=mkdtempSync('/tmp/harbor-ebc-reader-');
 try{
  const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','src','server','vendor','package.json'],{encoding:'utf8'}).trim().split('\n').filter(p=>/\.(?:[cm]?js|tsx?|json)$/.test(p));
  execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive',base,...files],{maxBuffer:128*1024*1024})});symlinkSync(resolve('node_modules'),join(dir,'node_modules'));
  assert.deepEqual(readFileSync(join(dir,'server/runtime.ts')),execFileSync('git',['show',base+':server/runtime.ts']));
  const f=await landWorkerChain(await seed(),{identity:identity()});let s:Save;
  try{s=await acquire(f)}finally{await f.close()}
  const load=(file:string)=>import(pathToFileURL(join(dir,file)).href);
  const frozen=await load('server/exploration-assembly.ts'),life=await load('server/reviewed-animal-life.ts'),basil=await load('server/plant-basil.ts'),mint=await load('server/wild-mint.ts');
  const reader=frozen.createExplorationAssembly({afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:life.createReviewedAnimalLife,decorateLife:(a:any)=>mint.withWildMint(basil.withBasilPlantUses(a),{enabled:true,newStarts:true})}).runtime;
  reader.assertReadable(s);const before=structuredClone(s);
  const next=(await reader.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:'home',position:entityAt('home','bed')!.approach,target:'bed',action:'rest'})).head;
  assert.deepEqual(s,before);assert.deepEqual(next.relationshipNextV1,s.relationshipNextV1);assert.deepEqual(next.ornamentalFernV1,s.ornamentalFernV1);
  fernQaAssembly({ornamentalFernStarts:false}).runtime.assertReadable(next);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('same-ID token rotation invalidates a late fern reply; new credential replays its committed receipt once',async()=>{
 const rotated='synthetic.combined.rotated',f=await landWorkerChain(await seed(),{identity:identity([token,rotated])});
 let liveToken:string|null=token;
 const epoch=new IdentityEpoch(()=>liveToken?id:null,()=>liveToken);epoch.enable(true);
 try{
  const s=await acquire(f),path='/api/sessions/'+s.id,command=fernCommand(s,'place'),oldSnapshot=epoch.capture();
  // Authority commits before the old response is consumed by this client epoch.
  const delayed=await f.invoke(path+'/action',{headers:caps,body:command});assert.equal(delayed.status,200);
  liveToken=rotated;assert.equal(epoch.observe(),true);assert.equal(oldSnapshot.signal.aborted,true);assert.throws(oldSnapshot.assert,/IDENTITY_CHANGED/);
  const current=epoch.capture();assert.equal(current.account,id);
  const retry=await f.invoke(path+'/action',{headers:{...caps,Authorization:'Bearer '+rotated},body:command});
  assert.equal(retry.status,200);assert.deepEqual(retry.body,delayed.body);current.assert();
  assert.equal(retry.body.head.ornamentalFernV1.plant.moveCount,1);
  assert.equal(retry.body.head.townMinutes,s.townMinutes!+20);assert.deepEqual(retry.body.head.relationshipNextV1,s.relationshipNextV1);
  assert.equal(JSON.stringify(retry.body).includes(rotated),false);
  liveToken=null;epoch.observe();assert.throws(current.assert,/IDENTITY_CHANGED/);assert.equal(epoch.capture().account,null);
 }finally{await f.close()}
});
