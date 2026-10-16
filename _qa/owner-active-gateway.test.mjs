import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {handleApi} from '../worker/index.js';
test('active clock and movement reuse signed cookie, require POST, forbid query and bound streamed bodies',async()=>{
 const origin='https://game.aiwaves.tech',base='/e78df027-7ef4-4d49-82eb-ea91f03d9fb3',root='/api/sessions/12345678-1234-1234-1234-123456789012';
 const env={HARBOR_PUBLIC_ORIGIN:origin,HARBOR_GAME_BASE:base,HARBOR_UPSTREAM_ORIGIN:'https://harbor.example.test',HARBOR_EDGE_TOKEN:randomBytes(32).toString('hex'),HARBOR_TIME_POLICY:'user-approved-budget-only-20261001',HARBOR_EXPIRES_AT:'none',HARBOR_IDENTITY_MODE:'browser-capability-v1'};
 const old=globalThis.fetch,seen=[];globalThis.fetch=async(url,init)=>{seen.push({url,init});return Response.json({ok:true})};
 const req=(path,cookie='',method='POST',body='{}',extra={})=>new Request(origin+path,{method,headers:{origin,cookie,'Content-Type':'application/json','X-Harbor-Owner':'forged',...extra},...(method==='POST'?{body}:{}),...(body instanceof ReadableStream?{duplex:'half'}:{})});
 try{
  assert.equal((await handleApi(req(root+'/active-play'),env)).status,401);assert.equal(seen.length,0);
  const boot=await handleApi(req('/api/bootstrap'),env),cookie=boot.headers.get('set-cookie').split(';')[0];
  for(const endpoint of ['motion','active-play']){
   const path=root+'/'+endpoint;assert.equal((await handleApi(req(path,cookie),env)).status,200);const latest=seen.at(-1);assert.equal(latest.url,env.HARBOR_UPSTREAM_ORIGIN+base+path);assert.equal(latest.init.method,'POST');assert.match(latest.init.headers.get('X-Harbor-Owner'),/^[a-f0-9]{64}$/);assert.notEqual(latest.init.headers.get('X-Harbor-Owner'),'forged');
   const count=seen.length;
   assert.equal((await handleApi(req(path,cookie,'GET'),env)).status,404);
   assert.equal((await handleApi(req(path+'?after=1',cookie),env)).status,404);
   assert.equal((await handleApi(req(path,cookie,'POST','{}',{origin:'https://evil.example'}),env)).status,403);
   assert.equal((await handleApi(req(path,cookie,'POST','{}',{'Content-Length':'16385'}),env)).status,413);
   const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(8192));c.enqueue(new Uint8Array(8193));c.close()}});
   assert.equal((await handleApi(req(path,cookie,'POST',stream),env)).status,413);assert.equal(seen.length,count);
  }
 }finally{globalThis.fetch=old}
});
