import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {summerAudio} from '../audio';
import {startStormSequence} from './storm';
import type {WeatherDecoration} from './presentation';
import type {WeatherKind} from './state';
export type WeatherQuality='full'|'low';
export type RainProfile='light'|'heavy'|'storm';
export type FlashReport={source:'natural'|'manual';shown:boolean;reason?:string};
/** Existing camera projects bounded anchors; CSS moves children, never the world. */
export function WeatherLayer({kind,outdoor,paused,quality,decorations=[],storm=false,heavyRain=false,reduceFlashes=false,reduceMotion=false,flashCue=0,onFlash}:{kind:WeatherKind;outdoor:boolean;paused:boolean;quality:WeatherQuality;decorations?:WeatherDecoration[];storm?:boolean;heavyRain?:boolean;reduceFlashes?:boolean;reduceMotion?:boolean;flashCue?:number;onFlash?:(report:FlashReport)=>void}){
 const [hidden,setHidden]=useState(()=>document.hidden),[systemReduced,setSystemReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[stormFrame,setStormFrame]=useState({gust:false,flash:0});
 const lastFlash=useRef(-Infinity),lastCue=useRef(flashCue),flashReport=useRef(onFlash);flashReport.current=onFlash;
 useEffect(()=>{const changed=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed)},[]);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),changed=()=>setSystemReduced(query.matches);query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed)},[]);
 useEffect(()=>{if(!stormFrame.flash)return;const id=window.setTimeout(()=>setStormFrame(f=>({...f,flash:0})),120);return()=>clearTimeout(id)},[stormFrame.flash]);
 const profile:RainProfile=storm?'storm':heavyRain?'heavy':'light',moving=!reduceMotion&&!systemReduced,flashAllowed=quality==='full'&&moving&&!reduceFlashes&&outdoor&&!paused&&!hidden&&storm&&kind==='light-rain';
 useEffect(()=>{setStormFrame({gust:false,flash:0});if(!storm||kind!=='light-rain'||paused||hidden)return;
  let suppressed=false;summerAudio.setStormGust(false);
  return startStormSequence({after:(fn,ms)=>window.setTimeout(fn,ms),cancel:id=>clearTimeout(id as number)},frame=>{
   suppressed=frame.flash>0&&performance.now()-lastFlash.current<6000;
   if(frame.flash>0&&!suppressed){lastFlash.current=performance.now();flashReport.current?.({source:'natural',shown:true})}
   summerAudio.setStormGust(frame.gust);setStormFrame(suppressed?{...frame,flash:0}:frame);
  },()=>{if(!suppressed)summerAudio.queueThunder(!outdoor)},()=>{summerAudio.cancelThunder();summerAudio.setStormGust(false)},flashAllowed);
 },[storm,kind,paused,hidden,outdoor,flashAllowed]);
 useEffect(()=>{if(flashCue===lastCue.current)return;lastCue.current=flashCue;
  const reason=!storm||kind!=='light-rain'?'请先选择雷阵雨':!outdoor?'室内不会出现闪电':paused||hidden?'天气已暂停':quality==='low'||!moving||reduceFlashes?'闪光已关闭':performance.now()-lastFlash.current<6000?'刚刚闪过，至少间隔6秒':undefined;
  if(reason){flashReport.current?.({source:'manual',shown:false,reason});return}
  lastFlash.current=performance.now();setStormFrame(f=>({...f,flash:-flashCue}));summerAudio.queueThunder(false);flashReport.current?.({source:'manual',shown:true});
 },[flashCue,storm,kind,outdoor,paused,hidden,moving,reduceFlashes,quality]);
 if(!outdoor)return null;
 const count=kind==='light-rain'?(profile==='light'?(quality==='low'?4:12):profile==='heavy'?(quality==='low'?8:24):(quality==='low'?10:32)):0;
 const budgets=quality==='full'?(profile==='light'?[48,12]:profile==='heavy'?[112,32]:stormFrame.gust?[144,40]:[88,24]):(profile==='light'?[12,3]:profile==='heavy'?[24,6]:stormFrame.gust?[32,8]:[20,5]);
 const activeDecorations=[...(kind==='light-rain'?[...decorations.filter(d=>d.kind==='splash').slice(0,budgets[0]),...decorations.filter(d=>d.kind==='ripple').slice(0,budgets[1])]:[]),...(quality==='full'?decorations.filter(d=>d.kind==='leaves').slice(0,4):[])];
 return <div className="harbor-weather" data-weather={kind} data-rain-profile={profile} data-storm={storm&&kind==='light-rain'} data-storm-gust={stormFrame.gust} data-impact-count={activeDecorations.filter(d=>d.kind!=='leaves').length} data-weather-reduced={reduceMotion||systemReduced} data-weather-quality={quality} data-weather-paused={paused||hidden} aria-hidden="true">
  <div className="harbor-weather__shade"/>
  {flashAllowed&&<div className="harbor-weather__lightning" data-active={stormFrame.flash!==0} onAnimationEnd={()=>setStormFrame(f=>({...f,flash:0}))}><b/></div>}
  {quality==='full'&&kind!=='clear'&&<div className="harbor-weather__clouds"><b/><b/></div>}
  {activeDecorations.map((d,i)=><span key={d.id} className={'harbor-weather__anchor harbor-weather__anchor--'+d.kind} data-world-x={d.at.x} data-world-y={d.at.y} style={{'--weather-delay':`${-((i*47)%97)/97*2.3}s`,'--weather-width':`${d.width}px`} as CSSProperties}>{d.kind==='leaves'?<><b/><b/><b/></>:<b/>}</span>)}
  {count>0&&<div className="harbor-weather__rain">{Array.from({length:count},(_,i)=><i key={i} style={{'--rain-x':`${(i*37+11)%100}%`,'--rain-delay':`${-(i%7)*.13}s`,'--rain-duration':`${.9+(i%3)*.12}s`} as CSSProperties}/>)}</div>}
 </div>
}
