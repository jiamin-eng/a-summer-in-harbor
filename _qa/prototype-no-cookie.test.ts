import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeDemoServer} from './temporary-account-server';
import {GAME_UUID} from '../src/game-id';
import {entityAt} from '../src/world/data';
// @ts-expect-error deployable Worker JavaScript
import {handleApi} from '../worker/index.js';
test('actual gateway and account transport: no-cookie saves, old owner scope, account switch and missing identity',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'harbor-prototype-'));
 const server=await makeDemoServer({directory,accountOnly:true,gatewayFixture:true});
 const old=globalThis.fetch,owners:string[]=[];
 globalThis.fetch=async(input:any,init:any)=>{
  owners.push(init.headers.get('X-Harbor-Owner'));
  return old(server.url+new URL(input).pathname,init);
 };
 const origin='https://game.aiwaves.tech',base='/'+GAME_UUID;
 const env={HARBOR_PUBLIC_ORIGIN:origin,HARBOR_GAME_BASE:base,HARBOR_UPSTREAM_ORIGIN:'https://fixture.example.test',HARBOR_EDGE_TOKEN:randomBytes(32).toString('hex'),HARBOR_EXPIRES_AT:'none',HARBOR_TIME_POLICY:'user-approved-budget-only-20261001',HARBOR_IDENTITY_MODE:'temporary-unverified'};
 const call=async(id:string|undefined,path:string,body?:unknown)=>{
  const r=await handleApi(new Request(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(id===undefined?{}:{'X-Harbor-Telegram-Id':id,'X-Harbor-Identity-Mode':'temporary-unverified'}),...(body===undefined?{}:{'Content-Type':'application/json'}),'X-Harbor-Owner':'forged'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  return {status:r.status,data:await r.json(),cookie:r.headers.get('Set-Cookie')};
 };
 try{
  const bootstrap=await call('910001','/bootstrap',{});
  assert.deepEqual(bootstrap.data,{mode:'temporary-unverified',platformIdentityVerified:false,kind:'account'});
  assert.equal(bootstrap.cookie,null);
  assert.equal(owners.at(-1),createHash('sha256').update(JSON.stringify(['harbor-owner-v1',GAME_UUID,'telegram-unverified-v1','910001'])).digest('hex'));
  const created=await call('910001','/sessions',{enrollment_id:randomUUID(),locale:'en'});
  assert.equal(created.status,200);const s=created.data;
  const written=await call('910001','/sessions/'+s.id+'/action',{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,'mara')!.approach,target:'mara',action:'introduce'});
  assert.equal(written.status,200);assert.equal(written.data.head.version,1);
  // Fresh requests carry no device cookie; another device of the same account sees the same head.
  assert.equal((await call('910001','/sessions')).data[0].id,s.id);
  assert.equal((await call('910001','/sessions/'+s.id)).data.version,1);
  assert.deepEqual((await call('910002','/sessions')).data,[]);
  assert.equal((await call('910002','/sessions/'+s.id)).status,404);
  const forwarded=owners.length;
  for(const [path,body] of [['/bootstrap',{}],['/sessions',undefined],['/sessions',{enrollment_id:randomUUID()}]] as const)assert.equal((await call(undefined,path,body)).status,401);
  assert.equal(owners.length,forwarded,'missing identity never reaches the save service');
  assert.equal((await call('910001','/sessions/'+s.id)).data.version,1);
 }finally{globalThis.fetch=old;await server.close();rmSync(directory,{recursive:true,force:true})}
});
