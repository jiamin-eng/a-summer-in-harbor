import {weatherPatch} from '../src/weather/state';
import {createHash,randomUUID} from 'node:crypto';
import type {Save,Action} from '../src/story/state';
import {activePlayActionId,type ActivePlayAck} from '../src/candidate/active-play-types';
import type {createActivePlayClock} from './active-play-clock';
import {MotionRejection} from './motion-failure';
const wire=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
/** Same store writer transaction; no second time store, old receipt deletion or vendor mutation. */
export function withActivePlayAuthority(authority:any,store:any,runtime:any,clock:ReturnType<typeof createActivePlayClock>,now=Date.now,npc?:{poke:(owner:string,id:string)=>void;unsent:(id:string,minute:number)=>boolean;mark:(id:string,minute:number)=>void}){
 const method=async(owner:string,id:string,input:Action):Promise<ActivePlayAck>=>{
  if(typeof owner!=='string'||!owner.trim()||owner.length>256)throw new MotionRejection('AUTH_REQUIRED');
  const a=wire(input),p=a?.payload as any;
  if(!a||!['candidate-active-open','candidate-active-tick','candidate-active-pause'].includes(a.action)||!Number.isSafeInteger(a.expected_version)||a.expected_version<0||!Number.isSafeInteger(p?.ordinal)||p.ordinal<1||typeof p.previous!=='string'||p.previous.length>80||typeof p.client!=='string'||!/^[-a-f0-9]{36}$/.test(p.client)||a.action_id!==activePlayActionId(id,p.ordinal))throw new MotionRejection('INVALID_ACTIVE_ACTION');
  try{runtime.validateAction(a)}catch(e:any){if(e.message==='INVALID_ACTION')throw new MotionRejection('INVALID_ACTION');throw e}
  const digest=createHash('sha256').update(JSON.stringify(canonical({id,body:a}))).digest('hex');
  const ack=await store.transaction(async(repo:any)=>{
   if(await repo.receipt(owner,a.action_id))throw new MotionRejection('ACTION_ID_CONFLICT');
   const row=await repo.session(owner,id);if(!row)throw new MotionRejection('SESSION_NOT_FOUND');
   const before:Save=runtime.upgrade(JSON.parse(row.data));if(JSON.stringify(before)!==row.data)throw new MotionRejection('MIGRATION_REQUIRED');runtime.assertReadable(before);
   const last=before.activePlayClock?.transport?.last;
   if(last&&p.ordinal===last.ack.ordinal){if(last.digest!==digest)throw new MotionRejection('ACTION_ID_CONFLICT');return last.ack}
   if(last&&p.ordinal<last.ack.ordinal)throw new MotionRejection('ACTIVE_RECEIPT_RETIRED');
   if(p.ordinal!==(last?.ack.ordinal??0)+1||p.previous!==(last?.ack.token??''))throw new MotionRejection('ACTIVE_CONFIRMATION_REQUIRED');
   if(before.version!==a.expected_version)throw new MotionRejection('VERSION_CONFLICT');
   if(await repo.preparedCount(owner))throw new MotionRejection('MOTION_BUSINESS_PREPARED');
   const next=clock.apply(before,a),cursor=row.cursor+1;next.version=before.version+1;next.cursor=cursor;
   const {transport:_,...c}=next.activePlayClock!;
   const loop=next.npcLoopV1;const ack:ActivePlayAck=wire({schema:1,channel:'active-play',id,mapVersion:next.mapVersion,baseVersion:before.version,version:next.version,cursor,ordinal:p.ordinal,actionId:a.action_id,token:randomUUID(),fields:{...(weatherPatch(before,next)?{weather:weatherPatch(before,next)}:{}),...(next.nativeCrabV1?{nativeCrabV1:next.nativeCrabV1}:{}),townMinutes:next.townMinutes??540,awakeMinutes:next.awakeMinutes??0,energy:next.energy,clock:c,...(loop&&npc?.unsent(id,loop.minute)?{npcLoopV1:loop}:{})}});
   next.activePlayClock!.transport={last:{digest,ack}};runtime.assertReadable(next);await repo.write(owner,next,cursor,now());return ack;
  });
  if(ack.fields.npcLoopV1)npc?.mark(id,ack.fields.npcLoopV1.minute);
  npc?.poke(owner,id);
  return ack;
 };
 return new Proxy(authority,{get(target,key){if(key==='activePlay')return method;const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v}});
}
