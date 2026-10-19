/** Loopback-only, memory-only entrance for the reviewed animal phase-two candidate.
 * This is never imported by public.ts and contains no model or media transport. */
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApiHandler,json} from './http';
import {createExplorationAssembly} from './exploration-assembly';
import {createReviewedAnimalArcLife} from './reviewed-animal-life';
import {withWildMint} from './wild-mint';
import {withBasilPlantUses} from './plant-basil';
import {configuredNews} from './news/configured';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
// @ts-expect-error pinned local test authority export
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

export async function createAnimalPhase2Preview(options:{port?:number;now?:()=>number;motionWait?:(ms:number)=>Promise<void>}={}){
 const nonce=randomBytes(12).toString('hex');
 const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:'animal-phase2-preview-'+nonce,
  gameId:'animal-phase2-preview-'+nonce,environment:'test'});
 const assembly=createExplorationAssembly({now:options.now,motionWait:options.motionWait,boot:'animal-phase2-preview',crabEnabled:true,
  resolveDialogue:async()=>{throw Error('LOCAL_MODEL_CLOSED')},
  createLife:createReviewedAnimalArcLife,
  decorateLife:(life:any)=>withWildMint(withBasilPlantUses(life,{enabled:true,newStarts:true}),{enabled:true,newStarts:true}),
  decorateRuntime:(runtime:any)=>configuredNews(runtime,resolve(import.meta.dirname,'news/frozen-catalog-20261006.json')),
  initial:(locale:any,id:string)=>({...initial(locale,id),scene:'coast',position:{...rooms.coast.spawn},
   known:['mara','ruth','owen','dani'],visited:Object.keys(rooms),flags:['key','unpacked','route-open','market-open'],items:{key:1}}),
 });
 const authority=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store);
 const api=createApiHandler({authority,newsProject:assembly.newsProject,lifeProject:assembly.lifeProject,
  landProject:assembly.landProject,usage:{status:async()=>({dialogue:{remaining:0,maximum:0,retryAt:null,pending:0}})},noteMedia:{}});
 const server=createServer({maxHeaderSize:8192},async(req,res)=>{try{
  const path=new URL(req.url!,'http://localhost').pathname;
  const origin=req.headers.origin;
  if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):(5234|5235|5238)$/.test(origin))return json(res,403,{error:'ORIGIN_REJECTED'});
  if(!['GET','POST'].includes(req.method??''))return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  let cap=(req.headers.cookie??'').match(/(?:^|; )harbor_phase2_preview=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(path==='/api/bootstrap'&&req.method==='POST'){
   if(!cap){cap=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`harbor_phase2_preview=${cap}; HttpOnly; SameSite=Strict; Path=/`)}
   return json(res,200,{mode:'local-animal-phase2-preview',synthetic:true,modelCallsAllowed:false,persistentPlayerSave:false});
  }
  if(!cap)return json(res,401,{error:'PREVIEW_SESSION_REQUIRED'});
  await api(req,res,createHash('sha256').update(cap).digest('hex'));
 }catch(error:any){const message=String(error?.code??error?.message??'PREVIEW_REQUEST_FAILED');
  json(res,error?.status??400,{error:/^[A-Z][A-Z0-9_]{1,90}$/.test(message)?message:'PREVIEW_REQUEST_FAILED'});
 }});
 await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(options.port??5238,'127.0.0.1',done)});
 return {server,assembly,authority,address:server.address(),close:async()=>{
  await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await store.close();
 }};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const preview=await createAnimalPhase2Preview();
 console.log(JSON.stringify({ready:true,host:'127.0.0.1',port:5238,synthetic:true,noModelOrMediaCalls:true}));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void preview.close().then(()=>process.exit(0))});
}
