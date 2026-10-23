import type {Point,Rect} from '../engine/world';
import {weatherDecorations,type WeatherDecoration} from './presentation';
import {visibleWeatherPoints,weatherPointOccluded} from './anchor-batch';
/** Water blockers prevent walking, not foam. Use authored water + visual masks. */
export function typhoonWaterPoints(patches:Array<Rect&{material:string}>,visualMasks:Rect[],spawn:Point):WeatherDecoration[]{return weatherDecorations(patches,visualMasks,[],spawn).filter(p=>p.kind==='ripple')}
/** Called by the existing View loop. No extra RAF or React frame updates. */
export function createTyphoonAnchorBatch(){
 let root:HTMLElement|null=null,previousPool:WeatherDecoration[]|undefined,signature='',nodes:HTMLElement[]=[];
 const visibility=new WeakMap<HTMLElement,boolean>();
 return {update(host:HTMLElement,pool:WeatherDecoration[],focus:Point,project:(p:Point)=>Point,masks:Rect[],sceneMatched=true){
  const layer=host.querySelector<HTMLElement>('.harbor-typhoon');if(!layer){root=null;nodes=[];return}const matched=String(sceneMatched);if(layer.dataset.sceneMatched!==matched)layer.dataset.sceneMatched=matched;if(!sceneMatched)return;
  const projectedFocus=project(focus),size={w:host.clientWidth,h:host.clientHeight},next=[Math.floor(projectedFocus.x/32),Math.floor(projectedFocus.y/32),Math.floor(focus.x/64),Math.floor(focus.y/64),size.w,size.h,layer.dataset.quality].join(':');
  if(root!==layer||previousPool!==pool||signature!==next){root=layer;previousPool=pool;signature=next;nodes=[...layer.querySelectorAll<HTMLElement>('.harbor-typhoon__foam')];const points=visibleWeatherPoints(pool,project,size,nodes.length);
   nodes.forEach((node,i)=>{const point=points[i];node.dataset.weatherEmpty=String(!point);if(point){node.dataset.worldX=String(point.at.x);node.dataset.worldY=String(point.at.y)}})}
  for(const node of nodes){if(node.dataset.weatherEmpty==='true')continue;const at={x:Number(node.dataset.worldX),y:Number(node.dataset.worldY)},blocked=weatherPointOccluded(at,masks);if(visibility.get(node)!==blocked){node.dataset.weatherOccluded=String(blocked);visibility.set(node,blocked)}}
 }}
}
