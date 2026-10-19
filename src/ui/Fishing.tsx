import {useEffect,useRef,useState} from 'react';
import {fishingInitial,fishingPull,fishingStep,recordFishing,type FishingRun} from '../challenges/fishing';
import {tx,type Locale,type Words} from '../world/data';
export function Fishing({locale,onFinish,onLeave,busy=false,error,onReconnect}:{locale:Locale;onFinish:(runs:FishingRun[])=>unknown;onLeave:()=>unknown;busy?:boolean;error?:Words|null;onReconnect?:()=>void}){
 const [started,setStarted]=useState(false),[display,setDisplay]=useState(fishingInitial),[submitting,setSubmitting]=useState(false);
 const state=useRef(fishingInitial()),held=useRef(false),runs=useRef<FishingRun[]>([]),pointers=useRef(new Set<number>()),spaceHeld=useRef(false),armed=useRef(false),lock=useRef(false);
 const finished=display.result!=='playing',locked=busy||submitting;
 useEffect(()=>{
  if(!started)return;let id=0,last=0,acc=0;
  const clear=()=>{held.current=false;spaceHeld.current=false;pointers.current.clear();armed.current=false;last=0;acc=0};
  const key=(e:KeyboardEvent)=>{if(e.code==='Space'){if(e.type==='keyup'){held.current=false;spaceHeld.current=false}else if(state.current.result==='playing'){e.preventDefault();spaceHeld.current=true;held.current=true}}};
  const release=(e:PointerEvent)=>{pointers.current.delete(e.pointerId);held.current=false};
  const visibility=()=>{if(document.hidden)clear()};
  const frame=(now:number)=>{
   if(!document.hidden){if(last)acc+=Math.min(.1,(now-last)/1000);while(acc>=1/30&&state.current.result==='playing'){acc-=1/30;recordFishing(runs.current,held.current);state.current=fishingStep(state.current,held.current)}setDisplay({...state.current})}
   last=now;if(state.current.result==='playing')id=requestAnimationFrame(frame);
  };
  window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility);id=requestAnimationFrame(frame);
  return()=>{cancelAnimationFrame(id);window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility)};
 },[started]);
 // A completed reel gesture may end over the new result button. Only a new
 // gesture on a result control can arm confirmation, including keyboard input.
 const confirmGesture={onPointerDown:()=>{armed.current=!pointers.current.size&&!spaceHeld.current},onPointerCancel:()=>{armed.current=false},onKeyDown:(e:React.KeyboardEvent)=>{if((e.key==='Enter'||e.code==='Space')&&!e.repeat&&!spaceHeld.current)armed.current=true},onClick:()=>{if(!armed.current)return;armed.current=false;void submit(true)}};
 async function submit(confirm:boolean){if(lock.current||busy)return;lock.current=true;setSubmitting(true);try{await (confirm?onFinish(runs.current):onLeave())}finally{lock.current=false;setSubmitting(false)}}
 const pull=fishingPull(display.tick);
 return <section className="harbor-panel harbor-fishing">
 <header><div><small>{tx(['钓鱼码头','FISHING PIER'],locale)}</small><h2>{tx(['慢慢收，别着急','Easy does it'],locale)}</h2></div>{finished?<button disabled={locked} {...confirmGesture}>{tx(['确认结果，收竿','Confirm result and leave'],locale)}</button>:<button disabled={locked} onClick={()=>void submit(false)}>{tx(['收竿','Leave'],locale)}</button>}</header>
 <div className="harbor-panel__body">
 <div className="harbor-fishing__water"><div className="harbor-fishing__float" style={{left:(25+display.progress*50)+'%',transform:'translateY('+(Math.sin(display.tick/8)*(4+pull*8))+'px)'}}><i/></div><div className="harbor-fishing__caption">{!started?tx(['露丝把鱼竿递给你。','Ruth offers you the rod.'],locale):finished?tx(display.result==='caught'?['鱼靠岸了！','You brought it in!']:['鱼游走了，下次再试。','It slipped away. Another time.'],locale):tx(pull>.65?['鱼正在用力——松手放线','It’s pulling—let the line out']:['鱼安静些了——按住收线','It’s calmer—hold to reel'],locale)}</div></div>
 {!started?<><p>{tx(['按住按钮收线，鱼用力时松开。线绷到红色时，先放松一点。没钓到也不会损失东西。','Hold to reel. Release when the fish pulls. If the line reaches the red zone, ease off. You won’t lose anything if it gets away.'],locale)}</p><button className="harbor-primary harbor-wide" disabled={locked} onClick={()=>setStarted(true)}>{tx(['抛下鱼钩','Cast the line'],locale)}</button></>:finished?<section key="fishing-result" data-fishing-result role="status"><p>{tx(display.result==='caught'?['钓获1条鱼。确认后放进行囊，消耗2精力。','One fish caught. Confirm to put it in your bag and use 2 energy.']:['未钓获，没有物品或精力损失。确认后返回。','No catch. No goods or energy lost. Confirm to return.'],locale)}</p><button key="confirm-result" className="harbor-primary harbor-wide" disabled={locked} {...confirmGesture}>{tx(['确认结果，收竿','Confirm result and leave'],locale)}</button></section>:<><label className="harbor-fishing__meter">{tx(['鱼离岸边','Bringing it ashore'],locale)}<progress max={1} value={display.progress}/></label><label className={'harbor-fishing__meter '+(display.tension>.78?'is-danger':'')}>{tx(['鱼线张力','Line tension'],locale)}<progress max={1} value={display.tension}/></label><button key="reel" className="harbor-primary harbor-fishing__reel" disabled={locked} onPointerDown={e=>{pointers.current.add(e.pointerId);e.currentTarget.setPointerCapture(e.pointerId);held.current=true}} onPointerUp={()=>{held.current=false}} onPointerCancel={()=>{held.current=false}} onLostPointerCapture={()=>{held.current=false}}>{tx(['按住收线 · 松开放线','Hold to reel · release to ease'],locale)}</button></>}
 {error&&<p className="harbor-error" role="alert">{tx(error,locale)}</p>}{onReconnect&&error&&<button disabled={submitting} onClick={onReconnect}>{tx(['重新读取，确认进度','Reload and check progress'],locale)}</button>}
 </div></section>;
}
