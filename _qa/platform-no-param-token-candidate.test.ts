import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoParamTokenCandidateProbe} from '../server/platform-no-param-token-candidate';
import {PLATFORM_SELF_URL} from '../server/platform-token-verifier';

const endpoint=PLATFORM_SELF_URL;
const bigId='9007199254740993';
const reply=(body:unknown,status=200,contentType='application/json')=>new Response(JSON.stringify(body),{status,headers:{'content-type':contentType}});
const success={retcode:0,errcode:0,data:{telegram_id:bigId}};

test('no-param mock sends one synthetic Authorization Bearer header and compares large ID strings exactly',async()=>{
 let requests=0;
 const fetchImpl=(async (input:RequestInfo|URL,init?:RequestInit)=>{
  requests++;
  const url=new URL(String(input));assert.equal(url.href,PLATFORM_SELF_URL);
  assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(init?.method,'GET');
  const headers=new Headers(init?.headers);assert.equal(headers.get('token'),null);assert.equal(headers.get('Authorization'),'Bearer synthetic-only');
  assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
  assert.equal(init?.credentials,'omit');
  return reply(success);
 }) as typeof fetch;
 const probe=createNoParamTokenCandidateProbe({endpoint,fetchImpl});
 assert.deepEqual(await probe(bigId,'Bearer synthetic-only'),{telegramId:bigId,candidateMatch:true});
 assert.equal(requests,1);
});

test('the platform request has exactly one credential header and still requires the token subject',async()=>{
 let requests=0;
 const fetchImpl=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  requests++;const url=new URL(String(input)),headers=new Headers(init?.headers);
  assert.equal(url.href,PLATFORM_SELF_URL);assert.equal(url.search,'');
  assert.equal(init?.method,'GET');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');
  assert.deepEqual([...headers.keys()].sort(),['accept','authorization']);
  assert.equal(headers.get('Authorization'),'Bearer synthetic-only');assert.equal(headers.get('token'),null);
  return reply(success);
 }) as typeof fetch;
 const probe=createNoParamTokenCandidateProbe({endpoint,fetchImpl});
 assert.deepEqual(await probe(bigId,'Bearer synthetic-only'),{telegramId:bigId,candidateMatch:true});
 assert.equal(requests,1);
 const reject=createNoParamTokenCandidateProbe({endpoint,fetchImpl:async()=>reply({...success,data:{telegram_id:'9007199254740992'}})});
 await assert.rejects(reject(bigId,'Bearer synthetic-only'),/PLATFORM_TELEGRAM_ID_MISMATCH/);
});

test('HTTP, retcode, errcode, object shape and string ID must all pass',async()=>{
 const cases:[unknown,number,string][]=[
  [success,401,'PLATFORM_HTTP_REJECTED'],
  [{...success,retcode:1},200,'PLATFORM_RETCODE_INVALID'],
  [{...success,errcode:2},200,'PLATFORM_ERRCODE_INVALID'],
  [{...success,data:null},200,'PLATFORM_TELEGRAM_ID_INVALID'],
  [{...success,data:{telegram_id:Number(bigId)}},200,'PLATFORM_TELEGRAM_ID_INVALID'],
  [{...success,data:{telegram_id:'9007199254740992'}},200,'PLATFORM_TELEGRAM_ID_MISMATCH'],
 ];
 for(const [body,status,code] of cases){
  const probe=createNoParamTokenCandidateProbe({endpoint,fetchImpl:async()=>reply(body,status)});
  await assert.rejects(probe(bigId,'Bearer synthetic-only'),new RegExp(code));
 }
});

test('no query parameters, invalid input and non-JSON responses fail closed',async()=>{
 assert.throws(()=>createNoParamTokenCandidateProbe({endpoint:endpoint+'?telegram_id='+bigId,fetchImpl:async()=>reply(success)}),/PLATFORM_ENDPOINT_INVALID/);
 const probe=createNoParamTokenCandidateProbe({endpoint,fetchImpl:async()=>reply(success,200,'text/plain')});
 await assert.rejects(probe(bigId,'Bearer synthetic-only'),/PLATFORM_CONTENT_TYPE_INVALID/);
 await assert.rejects(probe(Number(bigId),'Bearer synthetic-only'),/PLATFORM_ID_INVALID/);
 await assert.rejects(probe(bigId,'synthetic-only'),/PLATFORM_TOKEN_REQUIRED/);
});
