import type {CameraInsets} from '../engine/exploration-camera';
/** Measure the game HUD and reserve space for the visible external visitor bar. */
export function explorationLayout(world:HTMLElement){
 const app=world.closest<HTMLElement>('.harbor-app')!;
 let insets:CameraInsets={left:12,top:0,right:12,bottom:0};
 let banner:HTMLElement|null=null;
 const box=(selector:string)=>{const node=app.querySelector<HTMLElement>(selector);if(!node||getComputedStyle(node).visibility==='hidden')return undefined;return node.getBoundingClientRect()};
 const measure=()=>{
  const set=(name:string,value:number)=>{const px=`${value}px`;if(app.style.getPropertyValue(name)!==px)app.style.setProperty(name,px)};
  const a=app.getBoundingClientRect(),b=banner?.getBoundingClientRect();
  const visible=!!banner&&!!b&&b.width>0&&b.height>0&&getComputedStyle(banner).visibility!=='hidden';
  const overlaps=visible&&b!.right>a.left&&b!.left<a.right&&b!.top<window.innerHeight;
  set('--harbor-host-top',overlaps?Math.max(0,Math.ceil(b!.bottom)+4):0);
  const shifted=app.getBoundingClientRect(),header=box('.harbor-header');
  if(header)set('--harbor-header-bottom',header.bottom-shifted.top);
  const location=box('.harbor-location');
  if(location)set('--harbor-location-bottom',location.bottom-shifted.top);
  const w=world.getBoundingClientRect(),objective=box('.harbor-objective'),controls=box('.harbor-controls');
  insets={left:12,top:Math.max(0,(objective?.bottom??location?.bottom??header?.bottom??w.top)-w.top)+12,right:12,bottom:Math.max(0,w.bottom-(controls?.top??w.bottom))+12};
 };
 const observer=new ResizeObserver(measure);
 const observe=()=>{observer.disconnect();for(const selector of ['.harbor-header','.harbor-location','.harbor-objective','.harbor-controls']){const e=app.querySelector(selector);if(e)observer.observe(e)}observer.observe(world);measure()};
 const mutations=new MutationObserver(observe);mutations.observe(app,{childList:true,subtree:true});
 const bannerResize=new ResizeObserver(measure);
 const bannerAttributes=new MutationObserver(measure);
 const bindBanner=()=>{
  const next=document.getElementById('alteru-guest-banner');
  if(next===banner)return;
  bannerResize.disconnect();bannerAttributes.disconnect();banner=next;
  if(banner){bannerResize.observe(banner);bannerAttributes.observe(banner,{attributes:true,attributeFilter:['style','class','hidden']})}
  measure();
 };
 // The external shell mounts its host directly under body; game DOM updates are unrelated.
 const hostMutations=new MutationObserver(bindBanner);hostMutations.observe(document.body,{childList:true});
 window.addEventListener('resize',measure);document.fonts.ready.then(measure);observe();bindBanner();
 return {insets:()=>{measure();return insets},dispose:()=>{observer.disconnect();mutations.disconnect();bannerResize.disconnect();bannerAttributes.disconnect();hostMutations.disconnect();window.removeEventListener('resize',measure)}};
}
