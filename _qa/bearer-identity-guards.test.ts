import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformTokenVerifier,PLATFORM_SELF_URL} from '../server/platform-token-verifier';

test('published Bearer verifier keeps strict HTTP/envelope/ID gates with no header fallback or numeric coercion',async()=>{
 const id='9007199254740993',credential='Bearer synthetic.strict.contract';
 const success={retcode:0,errcode:0,msg:'success',data:{telegram_id:id}};
 const cases:[number,unknown,string][]=[
  [201,success,'PLATFORM_HTTP_UNAVAILABLE'],[204,null,'PLATFORM_HTTP_UNAVAILABLE'],
  [401,success,'PLATFORM_HTTP_REJECTED'],[403,success,'PLATFORM_HTTP_REJECTED'],[500,success,'PLATFORM_HTTP_UNAVAILABLE'],
  [200,{...success,retcode:'0'},'PLATFORM_RETCODE_INVALID'],
  [200,{...success,errcode:'0'},'PLATFORM_ERRCODE_INVALID'],
  [200,{...success,msg:'pending'},'PLATFORM_MSG_INVALID'],
  [200,{...success,data:{telegram_id:Number(id)}},'PLATFORM_TELEGRAM_ID_INVALID'],
  [200,{...success,data:{telegram_id:'9007199254740992'}},'PLATFORM_TELEGRAM_ID_MISMATCH'],
 ];
 for(const [status,body,expected]of cases){
  let requests=0;
  const verify=createPlatformTokenVerifier({fetchImpl:(async(input,init)=>{
   requests++;assert.equal(String(input),PLATFORM_SELF_URL);assert.equal(new URL(String(input)).search,'');assert.equal(init?.method,'GET');
   const h=new Headers(init?.headers);assert.deepEqual([...h.keys()].sort(),['accept','authorization']);assert.equal(h.get('Authorization'),credential);assert.equal(h.get('token'),null);
   return status===204?new Response(null,{status}):Response.json(body,{status});
  }) as typeof fetch});
  await assert.rejects(verify(id,credential),(error:any)=>error.code===expected);
  assert.equal(requests,1,'a failure must not try an alternate credential header');
 }
 let requests=0;
 const verify=createPlatformTokenVerifier({fetchImpl:(async()=>{requests++;return Response.json(success)}) as typeof fetch});
 await assert.rejects(verify(Number(id),credential),/PLATFORM_ID_INVALID/);assert.equal(requests,0);
 assert.equal((await verify(id,credential)).telegramId,id);assert.equal(requests,1);
});
