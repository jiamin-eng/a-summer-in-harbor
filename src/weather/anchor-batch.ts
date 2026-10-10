import type {Point,Rect} from '../engine/world';import type {WeatherDecoration} from './presentation';
/** Round-robin screen cells cover the visible street, not only the spawn point.
 * Sorting happens only on a coarse camera/budget change, never in React. */
export function visibleWeatherPoints(pool:WeatherDecoration[],project:(p:Point)=>Point,size:{w:number;h:number},limit:number){
 const cells:Array<Array<{point:WeatherDecoration;distance:number}>>=Array.from({length:20},()=>[]);
 for(const point of pool){const q=project(point.at);if(q.x<16||q.x>size.w-16||q.y<64||q.y>size.h-20||q.y>size.h-132&&q.x<130)continue;const col=Math.min(3,Math.floor(q.x/size.w*4)),row=Math.min(4,Math.floor(q.y/size.h*5));cells[row*4+col].push({point,distance:(q.x-(col+.5)*size.w/4)**2+(q.y-(row+.5)*size.h/5)**2})}
 for(const cell of cells)cell.sort((a,b)=>a.distance-b.distance||a.point.id.localeCompare(b.point.id));const selected:WeatherDecoration[]=[];
 for(let round=0;selected.length<limit;round++){let added=false;for(let i=0;i<20&&selected.length<limit;i++){const next=cells[i*9%20][round];if(next){selected.push(next.point);added=true}}if(!added)break}
 return selected;
}
export function weatherPointOccluded(p:Point,masks:Rect[]){return masks.some(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)}
/** Reuse DOM slots and the world's existing projection loop. No extra renderer,
 * frame callback, gameplay clock, or per-frame React state. */
export function createWeatherAnchorBatch(){
 let root:HTMLElement|null=null,previousPool:WeatherDecoration[]|undefined,signature='',nodes:HTMLElement[]=[];
 const empty=new WeakMap<HTMLElement,boolean>(),occluded=new WeakMap<HTMLElement,boolean>();
 return {update(host:HTMLElement,pool:WeatherDecoration[],focus:Point,project:(p:Point)=>Point,masks:Rect[]){
  const layer=host.querySelector<HTMLElement>('.harbor-weather'),size={w:host.clientWidth,h:host.clientHeight};
  if(!layer){root=null;nodes=[];return}const next=[Math.floor(focus.x/64),Math.floor(focus.y/64),size.w,size.h,layer.dataset.impactCount].join(':');
  if(root!==layer||previousPool!==pool||signature!==next){root=layer;previousPool=pool;signature=next;nodes=[...layer.querySelectorAll<HTMLElement>('.harbor-weather__anchor--splash,.harbor-weather__anchor--ripple')];
   for(const kind of ['splash','ripple'] as const){const slots=nodes.filter(n=>n.classList.contains('harbor-weather__anchor--'+kind)),points=visibleWeatherPoints(pool.filter(p=>p.kind===kind),project,size,slots.length);slots.forEach((node,i)=>{const point=points[i],missing=!point;if(empty.get(node)!==missing){node.dataset.weatherEmpty=String(missing);empty.set(node,missing)}if(point){node.dataset.worldX=String(point.at.x);node.dataset.worldY=String(point.at.y)}})}
  }
  for(const node of nodes){if(empty.get(node))continue;const hidden=weatherPointOccluded({x:Number(node.dataset.worldX),y:Number(node.dataset.worldY)},masks);if(occluded.get(node)!==hidden){node.dataset.weatherOccluded=String(hidden);occluded.set(node,hidden)}}
 }};
}
