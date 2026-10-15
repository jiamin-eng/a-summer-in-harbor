import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {handleApi} from '../worker/index.js';
test('B2 read projections cross the existing signed-cookie gateway with bounded queries',async()=>{
 const origin='https://game.aiwaves.tech',base='/e78df027-7ef4-4d49-82eb-ea91f03d9fb3',root='/api/sessions/12345678-1234-1234-1234-123456789012';
 const env={HARBOR_PUBLIC_ORIGIN:origin,HARBOR_GAME_BASE:base,HARBOR_UPSTREAM_ORIGIN:'https://harbor.example.test',HARBOR_EDGE_TOKEN:randomBytes(32).toString('hex'),HARBOR_TIME_POLICY:'user-approved-budget-only-20261001',HARBOR_EXPIRES_AT:'none',HARBOR_IDENTITY_MODE:'browser-capability-v1'};
 const previous=globalThis.fetch,seen=[];globalThis.fetch=async(url,init)=>{seen.push({url,init});return Response.json({ok:true})};
 const req=(path,cookie='',method='GET')=>new Request(origin+path,{method,headers:{origin,cookie,'Content-Type':'application/json','X-Harbor-Owner':'forged','X-Harbor-Land':'2'},...(method==='POST'?{body:'{}'}:{})});
 try{
  assert.equal((await handleApi(req(root+'/life'),env)).status,401);
  assert.equal((await handleApi(req(root+'/land-preview?region=hill-edge'),env)).status,401);
  assert.equal(seen.length,0);
  const boot=await handleApi(req('/api/bootstrap','','POST'),env),cookie=boot.headers.get('set-cookie').split(';')[0];
  for(const path of [root+'/life',root+'/land-preview?region=hill-edge',root+'/land-preview?region=courtyard-common&x=280&y=580',root+'/land-preview?x=280.5&y=580&region=courtyard-common']){
   assert.equal((await handleApi(req(path,cookie),env)).status,200);
   assert.equal(seen.at(-1).url,env.HARBOR_UPSTREAM_ORIGIN+base+path);
   assert.match(seen.at(-1).init.headers.get('X-Harbor-Owner'),/^[a-f0-9]{64}$/);
   assert.notEqual(seen.at(-1).init.headers.get('X-Harbor-Owner'),'forged');
   assert.equal(seen.at(-1).init.method,'GET');
   assert.equal(seen.at(-1).init.headers.get('X-Harbor-Land'),'2');
  }
  const count=seen.length;
  for(const path of [root+'/life?after=1',root+'/land-preview',root+'/land-preview?region=hill-edge&owner=forged',root+'/land-preview?region=hill-edge&region=hill-edge',root+'/land-preview?region=hill-edge&x=1',root+'/land-preview?region=hill-edge&x=NaN&y=2',root+'/land-preview?region=hill-edge&x=1e9&y=2',root+'/land-preview?region=hill-edge&x=999999&y=2',root+'/life/extra'])assert.equal((await handleApi(req(path,cookie),env)).status,404,path);
  for(const path of [root+'/life',root+'/land-preview?region=hill-edge'])assert.equal((await handleApi(req(path,cookie,'POST'),env)).status,404);
  assert.equal(seen.length,count);
 }finally{globalThis.fetch=previous}
});
