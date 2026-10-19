import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPlatformTokenVerifier,PLATFORM_SELF_URL} from '../server/platform-token-verifier';
import {liveHostToken,attachIdentityHeaders,assertCandidateSameOrigin,candidatePlatformTokenEnabled,readHostAccountId} from '../src/account-link/platform-token';
import {makeDemoServer} from './temporary-account-server';
import {GAME_UUID} from '../src/game-id';
// @ts-expect-error pinned deployable Worker JavaScript
import {handleApi} from '../worker/index.js';

const idA='9007199254740993',idB='9007199254740992';
const tokenA='synthetic.token.A',tokenB='synthetic.token.B';
const payload=(id:unknown)=>({retcode:0,errcode:0,data:{telegram_id:id}});
const err=(e:unknown)=>e as Error&{code:string;status:number};
const mock=(f:(token:string)=>unknown)=>((async(_input:URL|RequestInfo,init?:RequestInit)=>{const h=new Headers(init?.headers);assert.equal(h.get('token'),null);return Response.json(f((h.get('Authorization')??'').replace(/^Bearer /,'')))}) as typeof fetch);

test('default build stays off; candidate reads exact live Aigram.telegramId and token without query fallback',()=>{
 assert.equal(candidatePlatformTokenEnabled,false);
 for(const host of [
  {kind:'GuestWeb',Aigram:{telegramId:idA,token:tokenA,callAigramAPI:()=>{}}},
  {kind:'TelegramMiniapp',Aigram:{telegramId:idA,token:tokenA,isInAigram:true}},
  {kind:'NativeApp',Aigram:{telegramId:idA,token:tokenA},webkit:{messageHandlers:{aigram:{postMessage:()=>{}}}}},
 ]){
  assert.equal(liveHostToken(host),tokenA,host.kind);
  assert.equal(readHostAccountId(host,true),idA,host.kind);
  const headers=new Headers({Authorization:'Bearer caller-supplied'});
  assert.equal(attachIdentityHeaders(headers,idA,host,true),tokenA);
  assert.equal(headers.get('Authorization'),'Bearer '+tokenA);
  assert.equal(headers.get('X-Harbor-Telegram-Id'),idA);
 }
 const old=new Headers({Authorization:'Bearer caller-supplied'});
 assert.equal(attachIdentityHeaders(old,idA,{Aigram:{telegramId:idA,token:tokenA}},false),null);
 assert.equal(old.get('Authorization'),null,'temporary mode drops caller Bearer');
 assert.equal(readHostAccountId({Aigram:{telegramId:idA}},false),idA);
 assert.equal(readHostAccountId({Aigram:{telegramId:idA}},true),idA);
 assert.equal(readHostAccountId({Aigram:{id:idA,token:tokenA}},true),null);
 assert.equal(readHostAccountId({Aigram:{telegramId:Number(idA)}},true),'__invalid_shell_identity__');
 assert.throws(()=>attachIdentityHeaders(new Headers(),idA,{Aigram:{telegramId:idB,token:tokenA}},true),/PLATFORM_ID_MISMATCH/);
 assert.throws(()=>attachIdentityHeaders(new Headers(),idA,{Aigram:{id:idA,token:tokenA}},true),/PLATFORM_ID_MISMATCH/);
 assert.doesNotThrow(()=>assertCandidateSameOrigin('./api/sessions','https://game.aiwaves.tech/harbor/'));
 assert.throws(()=>assertCandidateSameOrigin('https://example.invalid/steal','https://game.aiwaves.tech/harbor/'),/PLATFORM_FETCH_ORIGIN_INVALID/);
 for(const invalid of [undefined,3,'','bad token','bad\nvalue','x'.repeat(4097)])assert.equal(liveHostToken({Aigram:{token:invalid}}),null);
});

test('verified candidate pins Wang Xing exact no-parameter self endpoint',()=>{
 assert.equal(PLATFORM_SELF_URL,'https://aigram.aiwaves.tech/note/wallet/aigram/get/alteru/window/info');
 const url=new URL(PLATFORM_SELF_URL);assert.equal(url.search,'');assert.equal(url.hash,'');
});

test('no-parameter GET sends one Authorization Bearer header, checks subject per request and preserves ID digits',async()=>{
 let calls=0;
 const fetchImpl=(async(input:URL|RequestInfo,init?:RequestInit)=>{
  calls++;const url=new URL(String(input));assert.equal(url.href,PLATFORM_SELF_URL);assert.equal(url.search,'');
  assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.equal(init?.credentials,'omit');
  const headers=new Headers(init?.headers);assert.equal(headers.get('token'),null);
  assert.deepEqual([...headers.keys()].sort(),['accept','authorization']);
  return Response.json(payload(headers.get('Authorization')==='Bearer '+tokenA?idA:idB));
 }) as typeof fetch;
 const verify=createPlatformTokenVerifier({fetchImpl});
 assert.deepEqual(await verify(idA,'Bearer '+tokenA),{telegramId:idA,assurance:'platform-token-bound-v1'});
 await assert.rejects(verify(idA,'Bearer '+tokenB),e=>err(e).code==='PLATFORM_TELEGRAM_ID_MISMATCH');
 await verify(idA,'Bearer '+tokenA);assert.equal(calls,3,'no identity cache across requests');
 assert.equal(JSON.stringify(await verify(idA,'Bearer '+tokenA)).includes(tokenA),false);
});

test('HTTP, retcode, errcode, JSON, oversized, precision loss and timeout fail closed',async()=>{
 const make=(fetchImpl:typeof fetch)=>createPlatformTokenVerifier({fetchImpl,timeoutMs:100});
 let calls=0;const noFetch=mock(()=>{calls++;return payload(idA)});
 await assert.rejects(make(noFetch)(idA,undefined),e=>err(e).code==='PLATFORM_TOKEN_REQUIRED');
 await assert.rejects(make(noFetch)(Number(idA),'Bearer '+tokenA),e=>err(e).code==='PLATFORM_ID_INVALID');
 assert.equal(calls,0);
 const cases:[Response,string][]=[
  [Response.json({}, {status:401}),'PLATFORM_HTTP_REJECTED'],
  [Response.json({}, {status:500}),'PLATFORM_HTTP_UNAVAILABLE'],
  [Response.json({...payload(idA),retcode:1}),'PLATFORM_RETCODE_INVALID'],
  [Response.json({...payload(idA),errcode:2}),'PLATFORM_ERRCODE_INVALID'],
  [Response.json(payload(Number(idA))),'PLATFORM_TELEGRAM_ID_INVALID'],
  [Response.json(payload(idB)),'PLATFORM_TELEGRAM_ID_MISMATCH'],
  [new Response('not-json',{headers:{'content-type':'text/plain'}}),'PLATFORM_CONTENT_TYPE_INVALID'],
  [Response.json({padding:'x'.repeat(17000)}),'PLATFORM_BODY_TOO_LARGE'],
 ];
 for(const [response,code] of cases)await assert.rejects(make((async()=>response) as typeof fetch)(idA,'Bearer '+tokenA),e=>err(e).code===code,code);
 const timeout=(async(_url:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{const keep=setTimeout(()=>reject(Error('fixture late')),250);init?.signal?.addEventListener('abort',()=>{clearTimeout(keep);reject(Error('fixture timeout'))},{once:true})})) as typeof fetch;
 await assert.rejects(make(timeout)(idA,'Bearer '+tokenA),e=>err(e).code==='PLATFORM_HTTP_UNAVAILABLE'&&err(e).status===503);
});

test('Worker forwards token only with two candidate gates; default temporary mode retains old behavior',async()=>{
 const edge='a'.repeat(64),base='/'+GAME_UUID,origin='https://game.aiwaves.tech';
 const env:any={HARBOR_PUBLIC_ORIGIN:origin,HARBOR_GAME_BASE:base,HARBOR_UPSTREAM_ORIGIN:'https://harbor.example.test',HARBOR_EDGE_TOKEN:edge,HARBOR_TIME_POLICY:'user-approved-budget-only-20261001',HARBOR_EXPIRES_AT:'none',HARBOR_IDENTITY_MODE:'temporary-unverified'};
 const seen:any[]=[];const old=globalThis.fetch;
 globalThis.fetch=(async(_input:any,init:any)=>{seen.push(init);return Response.json({ok:true})}) as typeof fetch;
 const request=(headers:Record<string,string>)=>new Request(origin+'/api/sessions',{headers:{Origin:origin,'X-Harbor-Telegram-Id':idA,'X-Harbor-Identity-Mode':'temporary-unverified',...headers}});
 try{
  assert.equal((await handleApi(request({Authorization:'Bearer '+tokenA}),env)).status,200);
  assert.equal(seen.at(-1).headers.get('Authorization'),null);
  const verified={...env,HARBOR_IDENTITY_MODE:'platform-verified-v1'};
  assert.equal((await handleApi(request({'X-Harbor-Identity-Mode':'platform-verified-v1',Authorization:'Bearer '+tokenA}),verified)).status,503);
  verified.HARBOR_PLATFORM_TOKEN_MODE='candidate-token-owner-v1';
  assert.equal((await handleApi(request({'X-Harbor-Identity-Mode':'platform-verified-v1'}),verified)).status,401);
  assert.equal((await handleApi(request({'X-Harbor-Identity-Mode':'platform-verified-v1',Authorization:'Bearer '+tokenA}),verified)).status,200);
  const forwarded=seen.at(-1).headers;
  assert.equal(forwarded.get('Authorization'),'Bearer '+tokenA);assert.equal(forwarded.get('X-Harbor-Telegram-Id'),idA);assert.equal(forwarded.get('X-Harbor-Owner'),'0'.repeat(64));
 }finally{globalThis.fetch=old}
});

test('synthetic old journey keeps its owner; wrong Bearer subject cannot read it',async()=>{
 const directory=mkdtempSync(join('/tmp','harbor-platform-token-'));
 const headers=(mode:string,token?:string,id=idA)=>({'X-Harbor-Owner':'0'.repeat(64),'X-Harbor-Game':GAME_UUID,'X-Harbor-Telegram-Id':id,'X-Harbor-Identity-Mode':mode,Origin:'https://game.aiwaves.tech',...(token?{Authorization:'Bearer '+token}:{})});
 let server=await makeDemoServer({directory,gatewayFixture:true,accountOnly:true});
 try{
  const create=await fetch(server.url+'/api/sessions',{method:'POST',headers:{...headers('temporary-unverified'),'Content-Type':'application/json'},body:JSON.stringify({enrollment_id:randomUUID(),locale:'en'})});assert.equal(create.status,200);const journey=(await create.json()).id;
  await server.close();
  const verify=createPlatformTokenVerifier({fetchImpl:mock(token=>payload(token===tokenA?idA:idB))});
  server=await makeDemoServer({directory,gatewayFixture:true,accountOnly:true,mode:'platform-verified-v1',verifyPlatformToken:verify});
  const permitted=await fetch(server.url+'/api/sessions',{headers:headers('platform-verified-v1',tokenA)});assert.equal(permitted.status,200);assert.equal((await permitted.json())[0].id,journey);
  const denied=await fetch(server.url+'/api/sessions',{headers:headers('platform-verified-v1',tokenB)});assert.equal(denied.status,401);assert.equal((await denied.json()).error,'PLATFORM_TELEGRAM_ID_MISMATCH');
  const again=await fetch(server.url+'/api/sessions/'+journey,{headers:headers('platform-verified-v1',tokenA)});assert.equal(again.status,200);assert.equal((await again.json()).id,journey);
 }finally{await server.close();rmSync(directory,{recursive:true,force:true})}
});
