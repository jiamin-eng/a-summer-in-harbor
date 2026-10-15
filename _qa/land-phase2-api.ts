/** Genuine account/HTTP handlers and SQLite, invoked in-process. No TCP socket,
 * production identity, real save, model request or media capability. */
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createTemporaryAccountTransport} from '../server/account-transport';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createReviewedAnimalLife} from '../server/reviewed-animal-life';
import {withBasilPlantUses} from '../server/plant-basil';
import {withWildMint} from '../server/wild-mint';
import {GAME_UUID} from '../src/game-id';
import type {LifeSave} from '../src/life/types';
// @ts-expect-error pinned authority
import {openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
export async function phase2Api(template:LifeSave){
 const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'});let modelCalls=0;
 const assembly=createExplorationAssembly({defaultRate:4000,afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:createReviewedAnimalLife,resolveDialogue:async()=>{modelCalls++;throw Error('QA_MODEL_DISABLED')},initial:(locale:any,id:string)=>({...structuredClone(template),id,locale,version:0,cursor:0,history:[]}),decorateLife:(a:any)=>withWildMint(withBasilPlantUses(a),{enabled:true,newStarts:true})});
 const usage={status:async()=>({resetAt:0,dialogue:{remaining:0,maximum:0,pending:0,retryAt:null}}),reserve:async()=>{throw Error('QA_MODEL_DISABLED')},settle:async()=>{}};
 const api=createTemporaryAccountTransport({mode:'temporary-unverified',accountOnly:true,gameId:GAME_UUID,store,runtime:assembly.runtime,decorateAuthority:assembly.decorateAuthority,lifeProject:assembly.lifeProject,landProject:assembly.landProject,usage});
 return {assembly,store,get modelCalls(){return modelCalls},async invoke(path:string,body?:unknown,account='99101501',options:{legacy?:boolean}={}){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]) as any;req.url=path;req.method=body===undefined?'GET':'POST';req.headers={...(options.legacy?{}:{'x-harbor-land':'2'}),'content-type':'application/json','x-harbor-game':GAME_UUID,'x-harbor-telegram-id':account,'x-harbor-identity-mode':'temporary-unverified'};
  const res:any=new EventEmitter();let status=200,headers:Record<string,string>={},result=Buffer.alloc(0);res.writableEnded=false;res.headersSent=false;res.setHeader=(k:string,v:string)=>{headers[k]=v};res.writeHead=(n:number,h:any)=>{status=n;headers={...headers,...h};res.headersSent=true};res.end=(b:any)=>{result=Buffer.from(b??'');res.writableEnded=true};
  try{await api(req,res,createHash('sha256').update('synthetic-browser-'+account).digest('hex'))}catch(e:any){status=e.status??400;result=Buffer.from(JSON.stringify({error:e.code??e.message,terminal:true}))}
  return {status,headers,body:JSON.parse(result.toString()||'null')};
 },close:()=>store.close()};
}
