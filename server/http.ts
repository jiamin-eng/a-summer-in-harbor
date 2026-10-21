import {fishingClientContract} from './fishing-client-contract';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {motionHttpFailure} from './motion-failure';
import {activeBusinessHttpFailure} from './active-business-failure';
export const json=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
export function createApiHandler({authority,usage,noteMedia,dynamicAssets,newsProject,lifeProject,landProject}:any){return async(req:IncomingMessage,res:ServerResponse,who:string)=>{const path=new URL(req.url!,'http://localhost').pathname,method=req.method;
  if(fishingClientContract(req,res))return;
  let body:any={};if(method==='POST'){let size=0,parts:Buffer[]=[];for await(const c of req){size+=c.length;if(size>(path.includes('/assets/')||(path.endsWith('/motion')||path.endsWith('/active-play'))?16384:1500000))return json(res,413,{error:'REQUEST_TOO_LARGE',...((path.endsWith('/motion')||path.endsWith('/active-play'))?{terminal:true}:{})});parts.push(c)}body=JSON.parse(Buffer.concat(parts).toString()||'{}')}
  const project=async(head:any):Promise<any>=>{if(head?.head)return {...head,head:await project(head.head)};return newsProject?newsProject(head):head};
  if(path==='/api/usage'&&method==='GET')return json(res,200,await usage.status(who));
  if(path==='/api/sessions'&&method==='GET')return json(res,200,await authority.directory(who));
  if(path==='/api/sessions'&&method==='POST')return json(res,200,await project(await authority.create(who,body.enrollment_id,body.locale)));
  const assetMatch=path.match(/^\/api\/sessions\/([a-f0-9-]{36})\/assets\/(home|cafe|garden)\/(prepare|package|check|manifest|blob)$/);
  if(assetMatch){const [,id,room,op]=assetMatch;if(!dynamicAssets)return json(res,403,{error:'ASSET_QA_CLOSED'});if(method!==(op==='package'?'GET':'POST'))return json(res,405,{error:'METHOD_NOT_ALLOWED'});return dynamicAssets.handle(req,res,who,id,room,op,body)}
  const mediaMatch=path.match(/^\/api\/sessions\/([a-f0-9-]{36})\/media\/(workshop-annex-[12])(?:\/(status|prepare))?$/);
  if(mediaMatch){const [,id,room,op]=mediaMatch;if(op==='status'&&method==='GET')return json(res,200,await noteMedia.status(who,id,room));if(op==='prepare'&&method==='POST')return json(res,200,await noteMedia.ensure(who,id,room));if(!op&&method==='GET'){const {bytes,type}=await noteMedia.image(who,id,room);res.writeHead(200,{'Content-Type':type,'Cache-Control':'private,max-age=86400','X-Content-Type-Options':'nosniff'});return res.end(bytes)}return json(res,405,{error:'METHOD_NOT_ALLOWED'})}
  const match=path.match(/^\/api\/sessions\/([a-f0-9-]{36})(?:\/(action|motion|active-play|checkpoint|events|life|land-preview))?$/);
  if(!match)return json(res,404,{error:'NOT_FOUND'});const [,id,operation]=match;
  const inContext=(fn:()=>Promise<any>)=>dynamicAssets?dynamicAssets.context(who,id,fn):fn();
  // Capability is public format negotiation, never an extra DB transaction
  // before the existing write/CAS and its ambiguous-outcome handling.
  const currentLandClient=(head?:any)=>req.headers['x-harbor-land']==='2'||head?.landV1?.schema!==2;
  const refreshLandClient=()=>json(res,409,{error:'CLIENT_REFRESH_REQUIRED',terminal:false});
  const currentFernClient=(head:any)=>req.headers['x-harbor-fern']==='1'||!head?.ornamentalFernV1?.plant;
  if(operation==='action'&&typeof body.action==='string'&&body.action.startsWith('fern:')&&req.headers['x-harbor-fern']!=='1')return refreshLandClient();
  if(operation==='action'&&['life:expand-land','life:clear-bed'].includes(body.action)&&req.headers['x-harbor-land']!=='2')return refreshLandClient();

  if(dynamicAssets?.policy.entry(who,id)&&req.headers['x-harbor-dynamic-assets']!=='1')return json(res,409,{error:'CLIENT_REFRESH_REQUIRED'});
  if(!operation&&method==='GET')return inContext(async()=>{const head=await authority.get(who,id);if(!currentLandClient(head)||!currentFernClient(head))return refreshLandClient();return json(res,200,await project(dynamicAssets?await dynamicAssets.project(who,head):head))});
  if((operation==='life'||operation==='land-preview')&&method==='GET'){
   const projection=operation==='life'?lifeProject:landProject;
   if(!projection)return json(res,403,{error:'LIFE_B2_UNAVAILABLE'});
   return inContext(async()=>{const head=await authority.get(who,id);if(!currentLandClient(head)||!currentFernClient(head))return refreshLandClient();return json(res,200,await projection(head,new URL(req.url!,'http://localhost').searchParams))});
  }
  if(operation==='active-play'&&method==='POST'){if(typeof authority.activePlay!=='function')return json(res,403,{error:'CANDIDATE_ACTIVE_CLOSED',terminal:true});try{return json(res,200,await inContext(()=>authority.activePlay(who,id,body)))}catch(error){const failure=motionHttpFailure(error);return json(res,failure.status,failure.body)}}
  if(operation==='motion'&&method==='POST'){if(typeof authority.motion!=='function')return json(res,403,{error:'CANDIDATE_MOTION_CLOSED',terminal:true});try{return json(res,200,await inContext(()=>authority.motion(who,id,body)))}catch(error){const failure=motionHttpFailure(error);return json(res,failure.status,failure.body)}}
  if(operation==='action'&&method==='POST'){
   const execute=async()=>{
   if(!['ask','notes-generate'].includes(body.action))return json(res,200,await inContext(async()=>project(await authority.action(who,id,body))));
   const allowance=body.action==='ask'?'dialogue':'room';await usage.reserve(who,allowance,body.action_id,{session:id,body});
   try{const result=await inContext(async()=>project(await authority.action(who,id,body)));await usage.settle(who,allowance,body.action_id,true);return json(res,200,result)}catch(e:any){if(e.code!=='MODEL_CALL_PENDING_OR_INTERRUPTED')await usage.settle(who,allowance,body.action_id,false);throw e}
   };
   if(body.activePlay){try{return await execute()}catch(error){const failure=activeBusinessHttpFailure(error);return json(res,failure.status,failure.body)}}
   return execute();
  }
  if(operation==='checkpoint'&&method==='POST')return json(res,200,await inContext(async()=>project(await authority.checkpoint(who,id,body))));
  if(operation==='events'&&method==='GET')return json(res,200,await authority.events(who,id,Number(new URL(req.url!,'http://localhost').searchParams.get('after')??0)));
  return json(res,405,{error:'METHOD_NOT_ALLOWED'});

}}
