/** Actual Worker -> verifiedEdgeOwner -> account HTTP -> formal assembly -> SQLite.
 * Only the upstream network transport is in-process. No listening socket, cloud
 * credential, platform identity, real save, model or media request is used.
 * Unlike land-phase2-api, no land capability is added by this fixture. */
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTemporaryAccountTransport} from '../server/account-transport';
import {verifiedEdgeOwner} from '../server/public-config';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createReviewedAnimalLife} from '../server/reviewed-animal-life';
import {withBasilPlantUses} from '../server/plant-basil';
import {withWildMint} from '../server/wild-mint';
import {GAME_UUID} from '../src/game-id';
import type {LifeSave} from '../src/life/types';
// @ts-expect-error deployed Worker is JavaScript
import {handleApi} from '../worker/index.js';
// @ts-expect-error pinned authority implementation
import {openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
type Gateway=(request:Request,env:any)=>Promise<Response>;
type CallOptions={body?:unknown;account?:string|null;headers?:HeadersInit;method?:string};
export async function landWorkerChain(template:LifeSave,options:{databasePath?:string}={}){
 const gateway:Gateway=process.env.HARBOR_QA_WORKER
  ? (await import(pathToFileURL(resolve(process.env.HARBOR_QA_WORKER)).href)).handleApi:handleApi;
 const env={HARBOR_PUBLIC_ORIGIN:'https://game.aiwaves.tech',HARBOR_GAME_BASE:'/'+GAME_UUID,HARBOR_UPSTREAM_ORIGIN:'https://upstream.qa.invalid',HARBOR_EDGE_TOKEN:randomBytes(32).toString('hex'),HARBOR_EXPIRES_AT:'none',HARBOR_TIME_POLICY:'user-approved-budget-only-20261001',HARBOR_IDENTITY_MODE:'temporary-unverified'};
 const config={publicOrigin:env.HARBOR_PUBLIC_ORIGIN,expiresAt:null,timePolicy:env.HARBOR_TIME_POLICY};
 const store=openAsyncSqliteAuthorityStore({path:options.databasePath??':memory:',worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'});
 let modelCalls=0,loseReply=false;
 const assembly=createExplorationAssembly({defaultRate:4000,afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:createReviewedAnimalLife,resolveDialogue:async()=>{modelCalls++;throw Error('QA_MODEL_DISABLED')},initial:(locale:any,id:string)=>({...structuredClone(template),id,locale,version:0,cursor:0,history:[]}),decorateLife:(r:any)=>withWildMint(withBasilPlantUses(r,{enabled:true,newStarts:true}),{enabled:true,newStarts:true})});
 const usage={status:async()=>({resetAt:0,dialogue:{remaining:0,maximum:0,pending:0,retryAt:null}}),reserve:async()=>{throw Error('QA_MODEL_DISABLED')},settle:async()=>{}};
 const api=createTemporaryAccountTransport({mode:'temporary-unverified',accountOnly:true,gameId:GAME_UUID,store,runtime:assembly.runtime,decorateAuthority:assembly.decorateAuthority,lifeProject:assembly.lifeProject,landProject:assembly.landProject,usage});
 const originalFetch=globalThis.fetch;
 const trace:any[]=[];
 // Exact headers/body produced by handleApi cross this bridge unchanged. The
 // same private edge guard used by public.ts executes before account transport.
 const upstream=async(input:any,init:RequestInit={})=>{
  const url=new URL(String(input));
  if(url.origin!==env.HARBOR_UPSTREAM_ORIGIN||!url.pathname.startsWith(env.HARBOR_GAME_BASE+'/api/'))throw Error('QA_EXTERNAL_NETWORK_DISABLED');
  const headers=new Headers(init.headers),bytes=init.body?Buffer.from(init.body as Uint8Array):undefined;
  const req=Readable.from(bytes?[bytes]:[]) as any;
  req.url=url.pathname.slice(env.HARBOR_GAME_BASE.length)+url.search;req.method=init.method??'GET';req.headers=Object.fromEntries(headers);
  const record:any={path:req.url,method:req.method,land:headers.get('X-Harbor-Land'),dynamicAssets:headers.get('X-Harbor-Dynamic-Assets'),cookieForwarded:headers.has('Cookie'),owner:headers.get('X-Harbor-Owner'),edgeMatched:headers.get('X-Harbor-Edge')===env.HARBOR_EDGE_TOKEN};trace.push(record);
  const res:any=new EventEmitter();let status=200,outHeaders:Record<string,string>={},out=Buffer.alloc(0);
  res.writableEnded=false;res.headersSent=false;res.setHeader=(k:string,v:string)=>{outHeaders[k]=v};res.writeHead=(n:number,h:any)=>{status=n;outHeaders={...outHeaders,...h};res.headersSent=true};res.end=(b:any)=>{out=Buffer.from(b??'');res.writableEnded=true};
  try{const owner=verifiedEdgeOwner(req,config,env.HARBOR_EDGE_TOKEN);await api(req,res,owner)}catch(e:any){status=e.status??(e.message==='EDGE_IDENTITY_REQUIRED'?401:400);out=Buffer.from(JSON.stringify({error:e.code??e.message,terminal:e.message!=='MODEL_CALL_PENDING_OR_INTERRUPTED'}));outHeaders={'Content-Type':'application/json'}}
  record.status=status;record.error=JSON.parse(out.toString()||'null')?.error;
  if(loseReply&&req.url.endsWith('/action')&&status===200){loseReply=false;record.replyLost=true;throw Error('QA_REPLY_LOST_AFTER_COMMIT')}
  return new Response(out,{status,headers:outHeaders});
 };
 globalThis.fetch=upstream as typeof fetch;
 return {env,trace,store,get modelCalls(){return modelCalls},loseNextActionReply(){loseReply=true},
  async response(path:string,options:CallOptions={}){
   const headers=new Headers(options.headers),method=options.method??(options.body===undefined?'GET':'POST');
   if(!headers.has('Origin'))headers.set('Origin',env.HARBOR_PUBLIC_ORIGIN);
   if(options.account!==null){headers.set('X-Harbor-Telegram-Id',options.account??'99101561');headers.set('X-Harbor-Identity-Mode','temporary-unverified')}
   if(method==='POST'&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
   return gateway(new Request(env.HARBOR_PUBLIC_ORIGIN+path,{method,headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})}),env);
  },
  async invoke(path:string,options:CallOptions={}){const r=await this.response(path,options);return {status:r.status,body:await r.json() as any,headers:r.headers}},
  async create(capability?:string){return (await this.invoke('/api/sessions',{body:{enrollment_id:randomUUID(),locale:'en'},headers:capability?{'X-Harbor-Land':capability}:{}})).body as LifeSave},
  // Used by real story/client in Node: same request building and pending logic,
  // not a browser renderer claim. Only platform globals are synthetic.
  installClientFetch(){globalThis.fetch=(async(input:any,init:RequestInit={})=>{const url=new URL(String(input),env.HARBOR_PUBLIC_ORIGIN);if(url.origin===env.HARBOR_UPSTREAM_ORIGIN)return upstream(url.href,init);if(url.origin!==env.HARBOR_PUBLIC_ORIGIN||!url.pathname.startsWith(env.HARBOR_GAME_BASE+'/api/'))throw Error('QA_EXTERNAL_NETWORK_DISABLED');const headers=new Headers(init.headers);headers.set('Origin',env.HARBOR_PUBLIC_ORIGIN);return gateway(new Request(env.HARBOR_PUBLIC_ORIGIN+url.pathname.slice(env.HARBOR_GAME_BASE.length)+url.search,{...init,headers}),env)}) as typeof fetch},
  async close(){globalThis.fetch=originalFetch;if(process.env.HARBOR_QA_TRACE)appendFileSync(process.env.HARBOR_QA_TRACE,JSON.stringify({worker:process.env.HARBOR_QA_WORKER??'candidate',transport:'actual Worker and backend in-process, no TCP/browser',modelCalls,trace})+'\n');await store.close()}
 };
}
