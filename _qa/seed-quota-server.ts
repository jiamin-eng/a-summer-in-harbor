/** Loopback-only full formal assembly with synthetic SQLite journeys. The
 * ready harvests below come from real authored crop commands; clock jumps are
 * explicit fixture setup, not a claim about normal browser growth/identity. */
import {createServer} from 'node:http';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {createTemporaryAccountTransport} from '../server/account-transport';
import {json} from '../server/http';
import {runtime} from '../server/runtime';
import {createLifePlantsB2} from '../server/life-plants-b2';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createReviewedAnimalLife} from '../server/reviewed-animal-life';
import {withWildMint} from '../server/wild-mint';
import {withBasilPlantUses} from '../server/plant-basil';
import {initial,type Action} from '../src/story/state';
import {rooms,entityAt} from '../src/world/data';
import type {LifeSave} from '../src/life/types';
import {GAME_UUID} from '../src/game-id';
// @ts-expect-error frozen authority
import {openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const directory=process.env.HARBOR_SEED_QA_DIRECTORY;if(!directory)throw Error('QA_DIRECTORY_REQUIRED');mkdirSync(directory,{recursive:true});
const store=openAsyncSqliteAuthorityStore({path:directory+'/browser.sqlite',worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'}),b2=createLifePlantsB2(runtime);
const templates:Record<string,LifeSave>={};
for(const fixture of ['new','mixed','legacy']){
 let s:LifeSave={...initial('en',randomUUID()),scene:'garden',position:rooms.garden.spawn,known:['theo','dani'],visited:Object.keys(rooms),flags:['key','unpacked','bag-returned','garden-agreed','alternative-route','route-open','market-open'],items:{key:1,'seed-basil':1,...(fixture==='new'?{}:{'crop-basil':2})}};
 if(fixture!=='legacy'){
  for(const action of ['plant:basil','water-crop','harvest-crop']){
   if(action==='harvest-crop')s={...s,townMinutes:(s.townMinutes??540)+720};
   const e=entityAt('garden','crop-bed-2')!,a:Action={action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:e.approach,target:e.id,action};
   s=(await b2.runtime.prepare(s,a)).head;
  }
 }
 templates[fixture]=s;
}
let fixture='new';
const assembly=createExplorationAssembly({resolveDialogue:async()=>{throw Error('QA_MODEL_DISABLED')},initial:(l:any,id:string)=>({...structuredClone(templates[fixture]),id,locale:l,version:0,cursor:0,history:[]}),afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:createReviewedAnimalLife,decorateLife:(r:any)=>withWildMint(withBasilPlantUses(r,{enabled:true,newStarts:true}),{enabled:true,newStarts:true})});
const usage={status:async()=>({resetAt:0,dialogue:{remaining:0,maximum:0,pending:0,retryAt:null}}),reserve:async()=>{throw Error('QA_MODEL_DISABLED')},settle:async()=>{}};
const api=createTemporaryAccountTransport({mode:'temporary-unverified',gameId:GAME_UUID,store,runtime:assembly.runtime,decorateAuthority:assembly.decorateAuthority,usage,lifeProject:assembly.lifeProject,landProject:assembly.landProject,noteMedia:{}});
const server=createServer(async(req,res)=>{try{
 req.url=req.url?.replace('/'+GAME_UUID,'');const url=new URL(req.url!,'http://localhost');
 const origin=req.headers.origin;if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):(5680|5681)$/.test(origin))return json(res,403,{error:'ORIGIN_REJECTED'});
 let cap=req.headers.cookie?.match(/(?:^|;\s*)harbor_demo=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(url.pathname==='/qa/prepare'&&req.method==='POST'){
  const next=url.searchParams.get('case')??'new';if(!templates[next])return json(res,400,{error:'CASE_UNKNOWN'});fixture=next;cap=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`harbor_demo=${cap}; HttpOnly; SameSite=Strict; Path=/`);return json(res,200,{fixture,syntheticOnly:true});
 }
 if(req.url==='/api/bootstrap'&&req.method==='POST'&&!cap){cap=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`harbor_demo=${cap}; HttpOnly; SameSite=Strict; Path=/`)}
 if(!cap)return json(res,401,{error:'BROWSER_POSSESSION_REQUIRED'});req.headers['x-harbor-game']??=GAME_UUID;return await api(req,res,createHash('sha256').update(cap).digest('hex'));
 }catch(e:any){if(!res.headersSent)json(res,e.status??400,{error:e.code??e.message,terminal:true})}});
server.listen(5681,'127.0.0.1',()=>console.log('Full assembly seed quota SQLite QA 127.0.0.1:5681; synthetic only; no model/media'));
const close=()=>server.close(async()=>{await store.close();process.exit(0)});process.on('SIGINT',close);process.on('SIGTERM',close);
