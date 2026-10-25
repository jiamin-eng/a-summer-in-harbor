import {useEffect,useRef,useState} from 'react';
import {replayTap,tapWindow as makeWindow,type TapWindow} from '../challenges/fishing-tap';
import {fishingInitial,type FishingRun} from '../challenges/fishing';
import {speciesNames,type PendingFishingResult,type ShoreEncounter,type ShoreInput} from '../challenges/shore-fishing';
import {fishingLifecycle} from '../challenges/fishing-lifecycle';
import {fishingBaitCue,fishingPresentationEvent,type FishingPresentation} from './fishing-experience';
import {tx,type Locale,type Words} from '../world/data';
type Phase='waiting'|'bite'|'haul'|'result';
type Props={locale:Locale;onFinish:(runs:FishingRun[],shore?:ShoreInput)=>unknown;onLeave:()=>unknown;firstDiscovery?:boolean;busy?:boolean;error?:Words|null;onReconnect?:()=>void;encounter?:ShoreEncounter;tapWindow?:TapWindow;pendingResult?:PendingFishingResult;onReserve?:(runs:FishingRun[],input?:ShoreInput)=>Promise<unknown>;journeyId?:string;challengeId?:string};
export function TapFishing({locale,onFinish,onLeave,firstDiscovery,busy,error,onReconnect,encounter,tapWindow,pendingResult,onReserve,journeyId,challengeId}:Props){
 const windowRule=tapWindow??{...makeWindow(encounter?.first),hookWindow:encounter?.hookWindow as 120|180??120};
 const key='fishing-tap-c-v1:'+journeyId+':'+challengeId;
 const [boot]=useState(()=>{
  try{const input=pendingResult?.input??JSON.parse(window.alteruLocalStorage.getItem(key)??'null');if(!pendingResult&&input?.draft==='waiting'&&Number.isSafeInteger(input.ticks)&&input.ticks>=0&&input.ticks<windowRule.biteTick+windowRule.hookWindow)return{ticks:input.ticks,input:null as ShoreInput|null,result:null,phase:(input.ticks>=windowRule.biteTick?'bite':'waiting')as Phase};if(input){const result=replayTap(windowRule,input as ShoreInput);return{ticks:(input as ShoreInput).waitTicks,input:input as ShoreInput,result,phase:'result' as Phase}}}catch{}
  return{ticks:0,input:null as ShoreInput|null,result:null as {result:'caught'|'escaped'}|null,phase:'waiting' as Phase};
 });
 const [phase,setPhase]=useState<Phase>(boot.phase),[ticks,setTicks]=useState(boot.ticks),[haul,setHaul]=useState(0),[paused,setPaused]=useState(document.hidden||!document.hasFocus()),[draftError,setDraftError]=useState(false),[reserveError,setReserveError]=useState(false),[saving,setSaving]=useState(false),[submitting,setSubmitting]=useState(false);
 const root=useRef<HTMLElement>(null),clock=useRef(boot.ticks),phaseRef=useRef(boot.phase),input=useRef(boot.input),result=useRef(boot.result),haulClock=useRef(0),reserving=useRef(false),submitLock=useRef(false),confirmed=useRef(false),props=useRef({onReserve,pendingResult});props.current={onReserve,pendingResult};
 const change=(p:Phase)=>{phaseRef.current=p;setPhase(p)};
 const persist=()=>{if(confirmed.current)return;try{window.alteruLocalStorage.setItem(key,JSON.stringify(input.current??{draft:'waiting',ticks:clock.current}))}catch{setDraftError(true)}};
 const settle=(hookTick:number|null)=>{if(input.current)return;const next:ShoreInput={hookTick,waitTicks:clock.current,runs:[]};result.current=replayTap(windowRule,next);input.current=next;persist();change(result.current.result==='caught'?'haul':'result')};
 const reserve=async()=>{if(!input.current||!props.current.onReserve||props.current.pendingResult||reserving.current)return;reserving.current=true;setSaving(true);setReserveError(false);try{if(!await props.current.onReserve([],input.current))setReserveError(true)}catch{setReserveError(true)}finally{reserving.current=false;setSaving(false)}};
 useEffect(()=>{if(input.current&&!pendingResult)void reserve()},[phase,!!pendingResult]);
 useEffect(()=>{
  const node=root.current,prior=document.activeElement as HTMLElement|null;node?.focus();let id=0,last=0,acc=0;
  const life=fishingLifecycle(window,document,p=>{setPaused(p);last=0;acc=0;persist()});
  const frame=(now:number)=>{
   if(!life.paused){if(last)acc+=Math.min(.1,(now-last)/1000);while(acc>=1/30){acc-=1/30;
    if(phaseRef.current==='waiting'||phaseRef.current==='bite'){clock.current++;if(clock.current>=windowRule.biteTick+windowRule.hookWindow)settle(null);else if(clock.current>=windowRule.biteTick&&phaseRef.current==='waiting')change('bite');setTicks(clock.current);if(clock.current%5===0)persist()}
    else if(phaseRef.current==='haul'){haulClock.current++;setHaul(Math.min(1,haulClock.current/18));if(haulClock.current>=18)change('result')}
   }}last=now;id=requestAnimationFrame(frame);
  };id=requestAnimationFrame(frame);const unload=()=>persist();window.addEventListener('beforeunload',unload);
  return()=>{persist();cancelAnimationFrame(id);life.dispose();window.removeEventListener('beforeunload',unload);if(prior?.isConnected)prior.focus()};
 },[]);
 useEffect(()=>{
  const app=root.current?.closest<HTMLElement>('.harbor-app');if(!app)return;app.dataset.fishingPhase=phase;app.dataset.fishingInteraction='tap-c';
  const detail:FishingPresentation={challenge:challengeId??'tap-c-local',phase:phase==='haul'?'reeling':phase,paused,held:false,state:{...fishingInitial(),tick:Math.round(haul*18),progress:phase==='result'&&result.current?.result==='caught'?1:haul,result:phase==='result'?result.current?.result??'playing':'playing'},waitTicks:ticks,...(encounter?{anchor:{scene:encounter.scene,standing:encounter.standing,target:encounter.cast}}:{})};
  app.dispatchEvent(new CustomEvent(fishingPresentationEvent,{detail}));
 },[phase,ticks,haul,paused]);
 useEffect(()=>{const app=root.current?.closest<HTMLElement>('.harbor-app');return()=>{app?.dispatchEvent(new CustomEvent(fishingPresentationEvent,{detail:{challenge:challengeId??'tap-c-local',phase:'closed'}}));if(app){delete app.dataset.fishingPhase;delete app.dataset.fishingInteraction}}},[]);
 async function submit(confirm:boolean){if(submitLock.current||busy)return;submitLock.current=true;setSubmitting(true);persist();try{const ok=await(confirm?onFinish([],input.current??undefined):onLeave());if(ok){confirmed.current=true;window.alteruLocalStorage.removeItem(key)}}finally{submitLock.current=false;setSubmitting(false)}}
 const caught=result.current?.result==='caught',locked=busy||submitting,canConfirm=phase==='result'&&!locked&&(!onReserve||!!pendingResult);
 const cue:Words=phase==='waiting'?['留意浮漂，咬钩时点一下提竿。','Watch the float. Tap Hook when it dips.']:phase==='bite'?['咬钩了，现在提竿！','A bite—hook now!']:phase==='haul'?['鱼正靠岸…','Bringing it ashore…']:caught?['钓上来了！','You caught one!']:input.current?.hookTick===null?['错过咬钩了，下次浮漂下沉时提竿。','The bite passed. Hook when the float dips next time.']:['提竿太早，鱼游走了。等浮漂下沉再提竿。','Too early. Wait for the float to dip before hooking.'];
 return <section ref={root} tabIndex={-1} className="harbor-panel harbor-fishing harbor-fishing-dock harbor-fishing-tap" role="region" aria-label={tx(['场景内钓鱼','Fishing in the scene'],locale)} data-fishing-phase={phase} data-fishing-paused-state={paused}>
  <div className="harbor-panel__body">
   <p className="harbor-fishing__cue" data-fishing-cue role={phase==='bite'?'alert':'status'}>{tx(cue,locale)}</p>
   {(phase==='waiting'||phase==='bite')&&<small data-fishing-current-bait>{tx(fishingBaitCue(encounter),locale)}</small>}
   {paused&&phase!=='result'&&<p data-fishing-paused role="status">{tx(['已暂停，回到此页后继续。','Paused. Return to continue.'],locale)}</p>}
   {phase==='result'&&<div data-fishing-result>{caught&&<strong>{tx(encounter?speciesNames[encounter.species]:['鲜鱼','Fresh fish'],locale)}</strong>}{caught&&firstDiscovery&&<span data-fishing-first> · {tx(['首次发现','First discovery'],locale)}</span>}<small>{tx(caught?(encounter?.ticket&&encounter.ticket.bait!=='reusable-fishing-lure'?['确认入包：精力−2，鱼饵−1。','On confirmation: 2 energy and one bait.']:['确认入包：精力−2，拟饵保留。','On confirmation: 2 energy; reusable lure kept.']):['鱼饵与精力未消耗。','No bait or energy used.'],locale)}</small></div>}
   {onReserve&&input.current&&<p data-fishing-saved={!!pendingResult} role="status">{tx(pendingResult?(caught?['结果已保存，确认后入包。','Result saved. Confirm to put it in your bag.']:['结果已保存。','Result saved.']):reserveError?['结果尚未保存，请重试并保持页面。','Result not saved. Retry and keep this page open.']:['正在保存结果…','Saving result…'],locale)}</p>}
   {reserveError&&!pendingResult&&<button disabled={saving||busy} onClick={()=>void reserve()}>{tx(['重试保存','Retry saving'],locale)}</button>}
   {draftError&&!pendingResult&&<p role="status">{tx(['设备暂不能保存进度，请保持页面并等待结果保存。','Device storage is unavailable. Keep the page open until the result saves.'],locale)}</p>}
   {error&&<p className="harbor-error" role="alert">{tx(error,locale)}</p>}{(error||reserveError&&!pendingResult)&&onReconnect&&<button disabled={locked} onClick={onReconnect}>{tx(['重新连接，核对进度','Reconnect and check progress'],locale)}</button>}
  </div>
  <footer className="harbor-fishing__actions">
   {phase==='result'?<button data-fishing-confirm className="harbor-primary" disabled={!canConfirm} onClick={()=>void submit(true)}>{tx(caught?['确认鱼获入包','Confirm catch to bag']:['返回准备','Back to preparation'],locale)}</button>:phase!=='haul'&&<button data-fishing-hook className="harbor-primary" disabled={locked||paused} onClick={()=>{if(!paused&&!locked&&['waiting','bite'].includes(phaseRef.current))settle(clock.current)}}>{tx(['提竿','Hook'],locale)}</button>}
   {!caught&&phase!=='result'&&<button data-fishing-leave disabled={locked} onClick={()=>void submit(false)}>{tx(['收竿','Leave'],locale)}</button>}
  </footer>
 </section>;
}
