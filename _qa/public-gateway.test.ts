import {test} from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
// @ts-expect-error deployable Worker JavaScript
import {handleApi} from '../worker/index.js';import {verifiedEdgeOwner} from '../server/public-config';import {GAME_UUID} from '../src/game-id';
test('public gateway: signed cookie, no caller owner, cross-origin/expired/missing-cookie guards',async()=>{
 const token=randomBytes(32).toString('hex'),base='/'+GAME_UUID,origin='https://game.aiwaves.tech';const env={HARBOR_PUBLIC_ORIGIN:origin,HARBOR_GAME_BASE:base,HARBOR_UPSTREAM_ORIGIN:'https://harbor.example.test',HARBOR_EDGE_TOKEN:token,HARBOR_EXPIRES_AT:Date.now()+60000,HARBOR_IDENTITY_MODE:'browser-capability-v1'};
 const seen:any[]=[];const old=globalThis.fetch;globalThis.fetch=async(input:any,init:any)=>{seen.push({input,init});return Response.json({ok:true})};
 const req=(path:string,method='GET',cookie?:string,requestOrigin=origin)=>new Request(origin+path,{method,headers:{Origin:requestOrigin,...(method==='POST'?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),'X-Harbor-Owner':'forged-owner'},...(method==='POST'?{body:'{}'}:{})});
 try{
  assert.equal((await handleApi(req('/api/sessions'),env)).status,401);assert.equal(seen.length,0);
  const first=await handleApi(req('/api/bootstrap','POST'),env);assert.equal(first.status,200);const cookie=first.headers.get('Set-Cookie')!;assert.match(cookie,/HttpOnly; SameSite=Strict/);assert.ok(cookie.includes('Path='+base+'/'));
  assert.equal((await handleApi(req('/api/sessions','GET',cookie.split(';')[0]),env)).status,200);const identity=seen.at(-1).init.headers.get('X-Harbor-Owner');assert.match(identity,/^[a-f0-9]{64}$/);assert.notEqual(identity,'forged-owner');assert.equal(seen.at(-1).input,'https://harbor.example.test'+base+'/api/sessions');
  const count=seen.length;assert.equal((await handleApi(req('/api/sessions','GET',cookie.split(';')[0]+'bad'),env)).status,401);assert.equal((await handleApi(req('/api/bootstrap','POST',undefined,'https://other.example.test'),env)).status,403);assert.equal((await handleApi(req('/api/health'),{...env,HARBOR_EXPIRES_AT:0})).status,410);assert.equal((await handleApi(req('/api/sessions','POST'),env)).status,401);assert.equal(seen.length,count);
  const budget={...env,HARBOR_TIME_POLICY:'user-approved-budget-only-20261001',HARBOR_EXPIRES_AT:'none'};
  const renewed=await handleApi(req('/api/bootstrap','POST',cookie.split(';')[0]),budget);assert.equal(renewed.status,200);assert.equal(renewed.headers.get('Set-Cookie')?.split(';')[0],cookie.split(';')[0]);assert.match(renewed.headers.get('Set-Cookie')!,/Max-Age=2592000/);
  assert.equal((await handleApi(req('/api/health'),{...budget,HARBOR_TIME_POLICY:'unknown'})).status,503);
  assert.equal(verifiedEdgeOwner({headers:{'x-harbor-edge':token,'x-harbor-owner':identity,'x-harbor-game':GAME_UUID,origin}} as any,{expiresAt:Date.now()+60000,publicOrigin:origin},token),identity);
  assert.throws(()=>verifiedEdgeOwner({headers:{'x-harbor-edge':'bad','x-harbor-owner':identity,'x-harbor-game':GAME_UUID,origin}} as any,{expiresAt:Date.now()+60000,publicOrigin:origin},token),/EDGE_IDENTITY_REQUIRED/);
 }finally{globalThis.fetch=old}
});
test('internal prototype forwards unverified ID without cookies; normal mode retains cookie boundary',async()=>{
 const token=randomBytes(32).toString('hex'),origin='https://game.aiwaves.tech',base='/'+GAME_UUID;const env={HARBOR_PUBLIC_ORIGIN:origin,HARBOR_GAME_BASE:base,HARBOR_UPSTREAM_ORIGIN:'https://harbor.example.test',HARBOR_EDGE_TOKEN:token,HARBOR_EXPIRES_AT:Date.now()+60000,HARBOR_IDENTITY_MODE:'temporary-unverified'};
 const old=globalThis.fetch,seen:any[]=[];globalThis.fetch=async(input:any,init:any)=>{seen.push({input,init});return Response.json({mode:'temporary-unverified'})};
 const req=(path:string,method='GET',cookie?:string,id='700001')=>new Request(origin+path,{method,headers:{Origin:origin,'X-Harbor-Telegram-Id':id,'X-Harbor-Identity-Mode':'temporary-unverified','X-Harbor-Owner':'forged',...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
 try{const r=await handleApi(req('/api/bootstrap','POST'),env),cookie=undefined;assert.equal(r.status,200);assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(seen.at(-1).init.headers.get('X-Harbor-Telegram-Id'),'700001');assert.notEqual(seen.at(-1).init.headers.get('X-Harbor-Owner'),'forged');
 assert.equal((await handleApi(req('/api/account/legacy','GET',cookie),env)).status,200);assert.equal((await handleApi(req('/api/account/claim','POST',cookie),env)).status,200);
 assert.equal((await handleApi(req('/api/sessions','GET',cookie,'not-an-id'),env)).status,400);
 assert.equal((await handleApi(req('/api/sessions','GET',cookie),{...env,HARBOR_IDENTITY_MODE:'browser-capability-v1'})).status,401);
 const normal=await handleApi(req('/api/bootstrap','POST'),{...env,HARBOR_IDENTITY_MODE:'browser-capability-v1'});assert.ok(normal.headers.get('Set-Cookie'));assert.equal(seen.at(-1).init.headers.get('X-Harbor-Telegram-Id'),null);
 assert.equal((await handleApi(req('/api/account/legacy','GET',cookie),{...env,HARBOR_IDENTITY_MODE:'browser-capability-v1'})).status,404);
 }finally{globalThis.fetch=old}
});
