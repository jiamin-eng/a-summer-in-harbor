import {withWildMint} from './wild-mint';
import {createReviewedAnimalLife} from './reviewed-animal-life';
import {withBasilPlantUses} from './plant-basil';
import {createExplorationAssembly} from './exploration-assembly';
import {configuredNews} from './news/configured';
import {RELEASE} from '../src/release';
import {createTemporaryAccountTransport} from './account-transport';
// @ts-expect-error bounded game adapter
import {createDynamicAssets,assetHttpStatus} from './dynamic-assets/index.mjs';
/** Public transport adapter. PG is the sole writer; no local DB fallback. */
import {createServer} from 'node:http';import {mkdir} from 'node:fs/promises';import {Pool} from 'pg';
// @ts-expect-error pinned candidate, game-specific release verification required
import {AsyncSessionAuthority,openPgAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
// @ts-expect-error pinned library
import {createPlayerUsage} from '../vendor/dynamic-runtime/packages/dynamic-pipeline/player-usage.mjs';
import {json} from './http';import {privateText,validatePublicConfig,verifiedEdgeOwner} from './public-config';import {createDialogueResolver} from './dialogue';import {createFieldNotes} from './fieldnotes';import {createNoteMedia} from './note-media';import {GAME_UUID} from '../src/game-id';
const config=validatePublicConfig(JSON.parse(await privateText(process.env.HARBOR_CONFIG_FILE))),token=await privateText(process.env.HARBOR_EDGE_FILE);if(!/^[a-f0-9]{64}$/.test(token))throw Error('EDGE_TOKEN_INVALID');
const pool=new Pool({host:config.pgHost,database:config.database,user:config.user,password:await privateText(process.env.HARBOR_PG_PASSWORD_FILE),max:4,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
// The frozen library retains its historical test gate. This adapter does not
// relabel that as generic certification; public release needs the game's canary.
const store=await openPgAuthorityStore({pool,schema:config.schema,worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'});
await mkdir('.data/rules',{recursive:true});
const assembly=createExplorationAssembly({resolveDialogue:await createDialogueResolver(store,{afterRain:true}),notes:await createFieldNotes(store),defaultRate:4000,afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:createReviewedAnimalLife,decorateLife:(r:any)=>withWildMint(withBasilPlantUses(r,{enabled:true,newStarts:true}),{enabled:true,newStarts:true}),decorateRuntime:(r:any)=>configuredNews(r,process.env.HARBOR_NEWS_CATALOG)});
const {runtime,newsProject}=assembly;
const authority=assembly.decorateAuthority(new AsyncSessionAuthority(store,runtime),store);
const dynamicAssets=await createDynamicAssets({pool,authority,config,edgeToken:token});
const deps={store,runtime,newsProject,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority,dynamicAssets,usage:createPlayerUsage({store}),noteMedia:createNoteMedia(store)};
const api=createTemporaryAccountTransport({...deps,mode:config.identityMode,gameId:GAME_UUID,accountOnly:true});
const server=createServer({maxHeaderSize:8192},async(req,res)=>{try{
 const who=verifiedEdgeOwner(req,config,token);const path=new URL(req.url!,'http://localhost').pathname;
 if(path==='/api/health')return json(res,200,{ok:true,gameId:GAME_UUID,release:'harbor-public-r1',sourceRelease:RELEASE,identity:config.identityMode,platformIdentityVerified:false,persistence:'postgresql',runtimeCandidate:'2026-10-01.2'});
 if(!['GET','POST'].includes(req.method??''))return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 return await api(req,res,who);
 }catch(e:any){const error=String(e.code??e.message??'REQUEST_FAILED');const known=/^[A-Z][A-Z0-9_]{1,90}$/.test(error);json(res,req.url?.includes('/assets/')?assetHttpStatus(e):e.status??(error==='EDGE_IDENTITY_REQUIRED'?401:error==='PLAY_WINDOW_CLOSED'?410:400),{error:known?error:'SERVICE_UNAVAILABLE',terminal:e.terminal??error!=='MODEL_CALL_PENDING_OR_INTERRUPTED'})}});
server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxConnections=64;
server.listen(config.port,'0.0.0.0',()=>console.log(JSON.stringify({ready:true,gameId:GAME_UUID,release:'harbor-public-r1'})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(async()=>{await store.close();await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),130000).unref()});
