import {useEffect,useRef,type RefObject} from 'react';
import {fishingPresentationEvent,type FishingPresentation} from '../ui/fishing-experience';
import type {Point} from '../engine/world';
/** Scene-only bridge: authoritative encounter anchor, or explicit visual-only legacy shore sample. */
type SceneState={scene:string;project:(p:Point)=>Point|null;legacyAnchor?:()=>FishingPresentation['anchor']};
/** Imperative scene bridge; detached explicitly so lifecycle can be verified without a GPU. */
export function attachFishingScene(root:SVGSVGElement,app:EventTarget,latest:{current:SceneState}){
  let snapshot:FishingPresentation|null=null,frame=0,changed=0,challenge='',borrowedAnchor:FishingPresentation['anchor'];
  const rod=root.querySelector<SVGPathElement>('[data-fishing-rod]')!,line=root.querySelector<SVGPathElement>('[data-fishing-line]')!,float=root.querySelector<SVGGElement>('[data-fishing-float]')!,ripple=root.querySelector<SVGEllipseElement>('[data-fishing-ripple]')!,fish=root.querySelector<SVGPathElement>('[data-fishing-fish]')!;
  const hide=()=>{root.style.display='none';root.style.visibility='hidden';fish.style.visibility='hidden';fish.removeAttribute('transform');for(const key of ['fishingScenePhase','fishingAnchorSource','fishingProgress','fishingTension','fishingCastX','fishingCastY'])delete root.dataset[key]};
  const reset=()=>{snapshot=null;borrowedAnchor=undefined;challenge='';cancelAnimationFrame(frame);frame=0;hide()};
  hide();
  const draw=(now:number)=>{
   frame=0;const s=snapshot,a=s?.anchor;
   if(!s||s.phase==='closed'||s.phase==='ready'||!a||a.scene!==latest.current.scene){reset();return}
   const standing=latest.current.project(a.standing),target=latest.current.project(a.target),up=latest.current.project({x:a.standing.x,y:a.standing.y-26});
   if(!standing||!target||!up){hide();frame=requestAnimationFrame(draw);return}
   const scale=Math.max(.5,Math.min(3,Math.abs(standing.y-up.y)/26)),hand={x:standing.x+4*scale,y:standing.y-25*scale},dx=target.x-hand.x,dy=target.y-hand.y,length=Math.max(1,Math.hypot(dx,dy)),tip={x:hand.x+dx/length*22*scale,y:hand.y+dy/length*14*scale-16*scale};
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||s.paused,age=reduced?1000:Math.max(0,now-changed),progress=Math.max(0,Math.min(1,s.state.progress)),tight=Math.max(0,Math.min(1,s.state.tension));
   let x=target.x,y=target.y;
   const casting=s.phase==='waiting'&&s.waitTicks<9||s.anchorSource==='legacy-shore-check'&&s.phase==='reeling'&&s.state.tick<9;
   if(casting&&age<250){const t=age/250;x=tip.x+(x-tip.x)*t;y=tip.y+(y-tip.y)*t-Math.sin(t*Math.PI)*20*scale}
   if(s.phase==='reeling'||s.phase==='result'&&s.state.result==='caught'){const t=progress*.72;x+=(hand.x-x)*t;y+=(standing.y-y)*t}
   if(s.phase==='bite')y+=6*scale;
   if(!reduced&&s.phase==='waiting')y+=Math.sin(age/250)*1.5*scale;
   const escape=s.phase==='result'&&s.state.result==='escaped',caught=s.phase==='result'&&s.state.result==='caught';
   if(escape){x+=dx/length*Math.min(24,age/20)*scale;y+=dy/length*Math.min(24,age/20)*scale}
   rod.setAttribute('d',`M ${hand.x} ${hand.y} L ${tip.x} ${tip.y}`);
   line.setAttribute('d',`M ${tip.x} ${tip.y} Q ${(tip.x+x)/2} ${(tip.y+y)/2+(1-tight)*18*scale} ${x} ${y}`);line.style.strokeWidth=String((1+tight)*scale);line.style.opacity=escape?'0.25':'1';
   float.setAttribute('transform',`translate(${x} ${y}) scale(${scale})`);float.style.opacity=escape?'0.25':caught?'0':'1';
   ripple.setAttribute('cx',String(x));ripple.setAttribute('cy',String(y+4*scale));ripple.setAttribute('rx',String((s.phase==='bite'?12:7)*scale));ripple.setAttribute('ry',String(3*scale));
   fish.setAttribute('transform',`translate(${x} ${y-(caught?Math.sin(Math.min(1,age/400)*Math.PI)*14*scale:0)}) scale(${scale})`);fish.style.visibility=caught||s.phase==='reeling'?'visible':'hidden';fish.style.opacity=caught?'1':'.3';
   root.style.display='';root.style.visibility='visible';root.dataset.fishingScenePhase=s.phase;root.dataset.fishingAnchorSource=s.anchorSource??'encounter';root.dataset.fishingProgress=String(progress);root.dataset.fishingTension=String(tight);root.dataset.fishingCastX=String(a.target.x);root.dataset.fishingCastY=String(a.target.y);
   frame=requestAnimationFrame(draw);
  };
  const receive=(event:Event)=>{const next=(event as CustomEvent<FishingPresentation>).detail;if(!next||typeof next.challenge!=='string')return;if(snapshot&&next.challenge!==challenge&&next.phase==='closed')return;if(next.phase==='closed'||next.phase==='ready'){reset();return}if(challenge!==next.challenge){borrowedAnchor=undefined;hide()}if(challenge!==next.challenge||snapshot?.phase!==next.phase){changed=performance.now();challenge=next.challenge}if(!next.anchor&&!borrowedAnchor)borrowedAnchor=latest.current.legacyAnchor?.();snapshot=next.anchor?{...next,anchorSource:'encounter'}:borrowedAnchor?{...next,anchor:borrowedAnchor,anchorSource:'legacy-shore-check'}:next;if(!frame)frame=requestAnimationFrame(draw)};
  app.addEventListener(fishingPresentationEvent,receive);return()=>{app.removeEventListener(fishingPresentationEvent,receive);reset()};
}
export function FishingScene({host,scene,project,legacyAnchor}:{host:RefObject<HTMLDivElement|null>;scene:string;project:(p:Point)=>Point|null;legacyAnchor?:()=>FishingPresentation['anchor']}){
 const svg=useRef<SVGSVGElement>(null),latest=useRef<SceneState>({scene,project,legacyAnchor});latest.current={scene,project,legacyAnchor};
 useEffect(()=>{const root=svg.current,app=host.current?.closest('.harbor-app');if(root&&app)return attachFishingScene(root,app,latest)},[scene]);
 return <svg ref={svg} style={{display:'none',visibility:'hidden'}} className="harbor-fishing-scene" aria-hidden="true"><path data-fishing-rod/><path data-fishing-line/><ellipse data-fishing-ripple/><g data-fishing-float><path d="M 0 -7 V 5"/><ellipse cy="1" rx="3" ry="5"/></g><path data-fishing-fish d="M -7 0 Q 0 -6 6 0 Q 0 6 -7 0 L -11 -4 V 4 Z"/></svg>;
}
