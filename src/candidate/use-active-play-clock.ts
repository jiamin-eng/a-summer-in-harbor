import {useEffect,useRef,useState} from 'react';
import type {Save} from '../story/state';
import {battleLocksWorld} from '../story/turn-battle';
import {candidateMotion,candidateActivePlay,activePlayClientId,connect,hasPendingAction} from '../story/client';
import {activePlayEnabled,globalPoint,isCluster} from './continuity';
import {motionProjection} from './render-adapter';
import {registerCandidateFlush,registerActivePlayFence} from './exploration-flush';
import {createActivePlayBudget} from './active-play-budget';
import {flushMotionTrace} from './motion-flush';
import {consumeTrace,traceLength} from './motion-outbox';
import {resolvedMotionFailure} from './motion-errors';
import {recoverRejectedPath} from './recover-rejected-path';
const block=(v:boolean)=>{motionProjection.networkBlocked=v;motionProjection.block?.(v)};
/** One queue arbitrates two protocols. Heartbeats use elapsed server time, never rAF distance. */
export function useActivePlayClock(save:Save|null,paused:boolean,ready:boolean,onHead:(s:Save)=>void,onError:()=>void){
 const enabled=activePlayEnabled(),[blocked,setBlocked]=useState(enabled),wake=useRef(()=>{}),latest=useRef({save,paused,ready,onHead,onError});latest.current={save,paused,ready,onHead,onError};
 useEffect(()=>{
  if(!enabled||!save)return;let live=true,head=save,inFlight:Promise<Save|undefined>|undefined,hold=false,resume=true,pagedOut=false,nextPump=-Infinity,motionAt=-Infinity,playAt=-Infinity,roundTrip=0,owned=false;
  const playing=()=>!!latest.current.ready&&!latest.current.paused&&!document.hidden&&!pagedOut&&!latest.current.save?.activeChallenge&&!(latest.current.save&&battleLocksWorld(latest.current.save));
  const budget=createActivePlayBudget(performance.now());
  // Real joystick turns need dispatch before the bounded prediction buffer fills.
  // Idle heartbeat cadence must never postpone already queued movement.
  const motionDue=()=>motionProjection.points.length>=6||traceLength(motionProjection.traceStart,motionProjection.points)>=12;
  const client=activePlayClientId(),publish=(s:Save)=>{head=s;if(live)latest.current.onHead(s)};
  const latency=(started:number)=>{roundTrip=Math.max(performance.now()-started,roundTrip*.9)};
  const active=async(action:string,activeMs?:number)=>{const started=performance.now();const result=await candidateActivePlay(head,action,client,activeMs);latency(started);playAt=started;return result};
  const movement=async(force=false,business=false)=>{
   motionProjection.sample?.();const hasPoints=motionProjection.points.length>0||!!motionProjection.moving?.();
   if(!hasPoints&&!force)return;
   if(business||!head.movingClock?.lease)block(true);
   if(!head.movingClock)publish((await candidateMotion(head,'candidate-clock-enable',head.position,{millisecondsPerMinute:4000})).head);
   motionProjection.sample?.();const points=motionProjection.points.map(p=>({...p})),tail=isCluster(head.scene)?globalPoint(motionProjection.scene,motionProjection.position):motionProjection.position;
   const previous=points.at(-1)??(isCluster(head.scene)?globalPoint(head.scene,head.position):head.position);
   if(Math.hypot(previous.x-tail.x,previous.y-tail.y)>.01)points.push({...tail});
   const limit=business?140:Math.min(140,Math.max(1,112*Math.min(1250,performance.now()-motionAt)/1000));
   try{await flushMotionTrace({head,points,force,renew:performance.now()-motionAt>2500,limit,maxBatches:business?Infinity:1,
    send:async(s,action,position,payload)=>{const started=performance.now(),l=s.activePlayClock?.lease,combined=!business&&playing()&&l?.client===client;
     const activeMs=combined?budget.take(started):0;
     try{const result=await candidateMotion(s,action,position,{...(payload as object),...(combined?{foreground:{client,lease:l.id,sequence:l.sequence+1,activeMs}}:{})});latency(started);motionAt=started;if(combined)playAt=started;return result}
     catch(e:any){if(combined&&resolvedMotionFailure(e))budget.refund(activeMs);throw e}
    },
    wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),isCurrent:()=>live&&latest.current.save?.id===head.id,
    confirmed:(s,_remaining,accepted)=>{motionProjection.points=consumeTrace(motionProjection.traceStart,motionProjection.points,accepted);motionProjection.traceStart=globalPoint(s.scene,s.position);publish(s)},
   });}catch(e:any){
    block(true);
    const recovered=await recoverRejectedPath(e,head,motionProjection,async()=>{
     const result=await candidateMotion(head,'candidate-motion-open',head.position,{});
     motionAt=performance.now();publish(result.head);return result.head;
    },()=>live&&latest.current.save?.id===head.id);
    if(!recovered)throw e;
   }
  };
  const work=async(business=false):Promise<Save|undefined>=>{
   const current=latest.current;if(!current.ready||!current.save||current.save.id!==head.id)return head;
   if(current.save.version>head.version){head=current.save;resume=true;motionProjection.points=[];motionProjection.traceStart=globalPoint(head.scene,head.position)}
   const locked=!!head.activeChallenge||battleLocksWorld(head),stop=current.paused||document.hidden||pagedOut||locked;
   if(hold&&!business)return head;
   try{
    if(hasPendingAction())throw Error('PENDING_ACTION');
    const foreign=head.activePlayClock?.lease&&head.activePlayClock.lease.client!==client;
    if(foreign){
     owned=false;block(true);
     // A second tab must acquire the time lease before touching movement authority.
     if(stop&&!business){block(true);resume=true;if(live)setBlocked(false);return head}
     publish((await active('candidate-active-open')).head);owned=true;resume=false;budget.reset(performance.now(),playing());motionAt=-Infinity;
    }
    if(!stop&&!business&&(resume||!head.activePlayClock?.lease)){
     block(!owned);publish((await active('candidate-active-open')).head);owned=true;resume=false;budget.reset(performance.now(),playing());
    }
    // A stationary business action must retain its exact observation proof.
    // Flush actual movement, but renew idle movement leases only during play.
    const beforePlayAt=playAt;
    if(!locked)await movement(!business&&!stop,business||stop);
    if(business){block(true);return head}
    // Re-read after asynchronous movement: a panel may have opened during its ACK.
    const shouldPause=latest.current.paused||document.hidden||pagedOut||locked,c=head.activePlayClock,l=c?.lease;
    if(shouldPause){block(true);resume=true;if(!locked)await movement(false,true);if(l?.client===client){publish((await active('candidate-active-pause',budget.take(performance.now()))).head)}if(live)setBlocked(false);return head}
    if(resume||!l||l.client!==client){publish((await active('candidate-active-open')).head);owned=true;resume=false;budget.reset(performance.now(),playing())}
    else if(playAt===beforePlayAt){try{publish((await active('candidate-active-tick',budget.take(performance.now()))).head)}catch(e:any){if(e.message!=='ACTIVE_LEASE_EXPIRED')throw e;publish((await active('candidate-active-open')).head);budget.reset(performance.now(),playing())}}
    if(live)setBlocked(false);block(false);return head;
   }catch(e:any){
    if(!live)return undefined;
    owned=false;block(true);resume=true;
    if(['ACTIVE_LEASE_BUSY','VERSION_CONFLICT','ACTIVE_LEASE_EXPIRED','MOTION_EXPIRED','ACTION_ID_CONFLICT','ACTIVE_CONFIRMATION_REQUIRED','ACTIVE_RECEIPT_RETIRED'].includes(e.message)&&!hasPendingAction()){
     const fresh=await connect(head.locale);if(!live||fresh.id!==head.id)return undefined;publish(fresh);setBlocked(true);return head;
    }
    setBlocked(true);latest.current.onError();throw e;
   }finally{const at=performance.now();nextPump=at+Math.max(0,Math.min(motionDue()?0:800,2800-(at-playAt)-roundTrip));if(stop)block(true)}
  };
  const enqueue=(business=false):Promise<Save|undefined>=>{
   if(inFlight)return business?inFlight.then(()=>enqueue(true)):inFlight;
   const next=work(business);inFlight=next;void next.then(()=>{if(inFlight===next)inFlight=undefined;if(live&&!hold&&playing()&&motionDue())void enqueue().catch(()=>{})},()=>{if(inFlight===next)inFlight=undefined});return next;
  };
  const unregister=registerCandidateFlush(async business=>{if(business){budget.set(false,performance.now());hold=true}return enqueue(!!business)},()=>{hold=false;resume=true});
  const unfence=registerActivePlayFence(s=>s.id===head.id&&s.version===head.version?{client,lease:head.activePlayClock?.lease?.id,activeMs:budget.take(performance.now())}:undefined);
  wake.current=()=>{budget.set(!hold&&playing(),performance.now());if(hold)return;const l=head.activePlayClock?.lease;block(!(owned&&playing()&&head.movingClock?.lease&&!hasPendingAction()&&(!l||l.client===client)));const run=()=>{if(live&&!hold)void enqueue().catch(()=>{})};if(inFlight)void inFlight.then(run,()=>{});else run()};
  const visibility=()=>{budget.set(!hold&&playing(),performance.now());resume=true;block(true);if(!hold)void enqueue().catch(()=>{})};
  const pagehide=()=>{pagedOut=true;visibility()},pageshow=()=>{pagedOut=false;visibility()};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);
  const timer=setInterval(()=>{if(!live||inFlight||hold)return;const s=latest.current;if(!s.ready||!s.save)return;const stop=s.paused||document.hidden||s.save.activeChallenge||battleLocksWorld(s.save);if(stop&&!head.activePlayClock?.lease)return;if(performance.now()<nextPump&&!(!stop&&motionDue()))return;void enqueue().catch(()=>{})},50);
  void enqueue().catch(()=>{});
  return()=>{live=false;wake.current=()=>{};unfence();unregister();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);block(true)};
 },[enabled,save?.id]);
 useEffect(()=>{if(enabled)wake.current()},[enabled,paused,ready]);
 return blocked;
}
