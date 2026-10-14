import {createServer} from 'node:http';import {createHash,randomBytes} from 'node:crypto';import {mkdirSync} from 'node:fs';import {join} from 'node:path';
// @ts-expect-error candidate library
import {openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
import {createTemporaryAccountTransport} from '../server/account-transport';import {createRuntime} from '../server/runtime';import {json} from '../server/http';import {GAME_UUID} from '../src/game-id';
export async function makeDemoServer({directory,delayDialogue,media,port=0,providedStore,providedRuntime,newsProject,lifeProject,landProject,dynamicAssets,decorateAuthority,accountOnly=false,gatewayFixture=false}:any){
 mkdirSync(directory,{recursive:true});const store=providedStore??openAsyncSqliteAuthorityStore({path:join(directory,'authority.sqlite'),worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'});
 const runtime=providedRuntime??createRuntime(async()=>{await delayDialogue?.();return {topic:null,reply:['海风很舒服。','The sea breeze feels good.']}});
 const usage={status:async()=>({resetAt:0,dialogue:{remaining:10,maximum:10,pending:0,retryAt:null}}),reserve:async()=>{},settle:async()=>{}};
 const api=createTemporaryAccountTransport({mode:'temporary-unverified',accountOnly,gameId:GAME_UUID,store,runtime,usage,decorateAuthority,newsProject,lifeProject,landProject,dynamicAssets,noteMedia:media??{status:async()=>({status:'not-started'}),ensure:async()=>({status:'not-started'}),image:async()=>({bytes:Buffer.from('fixture only'),type:'text/plain'})}});
 const server=createServer(async(req,res)=>{try{
  req.url=req.url?.replace('/'+GAME_UUID,'');
  const origin=req.headers.origin;if(origin&&!(gatewayFixture&&origin==='https://game.aiwaves.tech')&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))return json(res,403,{error:'ORIGIN_REJECTED'});
  if(gatewayFixture){
   const owner=req.headers['x-harbor-owner'];
   if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))return json(res,401,{error:'EDGE_IDENTITY_REQUIRED'});
   return await api(req,res,owner);
  }
  let cap=req.headers.cookie?.match(/(?:^|;\s*)harbor_demo=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(req.url==='/api/bootstrap'&&req.method==='POST'&&!cap){cap=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`harbor_demo=${cap}; HttpOnly; SameSite=Strict; Path=/`)}
  if(!cap)return json(res,401,{error:'BROWSER_POSSESSION_REQUIRED'});
  // Local counterpart of the existing gateway's per-game authority header.
  if(!req.headers['x-harbor-game'])req.headers['x-harbor-game']=GAME_UUID;
  return await api(req,res,createHash('sha256').update(cap).digest('hex'));
 }catch(e:any){if(!res.headersSent&&!res.destroyed)json(res,e.status??400,{error:e.code??e.message,terminal:e.message!=='REQUEST_IDENTITY_CANCELLED'})}});
 await new Promise<void>(r=>server.listen(port,'127.0.0.1',r));const addr=server.address() as any;
 return {url:`http://127.0.0.1:${addr.port}`,store,async close(){await new Promise<void>(r=>server.close(()=>r()));await store.close()}};
}
if(process.argv.includes('--serve')){const server=await makeDemoServer({directory:'.data/temporary-account-demo',port:5260});console.log(JSON.stringify({url:server.url,syntheticOnly:true,identity:'temporary-unverified'}))}
