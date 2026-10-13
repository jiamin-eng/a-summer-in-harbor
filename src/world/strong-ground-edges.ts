import {outdoors} from './outdoors';
import {roadBoundaries,terrainAt} from './road-boundaries';
import {globalPoint,zonesFor} from '../candidate/continuity';
import type {Rect,Point} from '../engine/world';
export type GroundEdge={rect:Rect;material:'sand'|'stone'|'wood';phase:number;native?:'stone'|'soil';sourceRect?:Rect;roadSide?:'N'|'E'|'S'|'W';seamOffset?:number;cornerRoads?:boolean[]};
const cache=new Map<string,GroundEdge[]>();
const visible=(id:string,p:Point)=>id==='coast'?!(p.x>=1235&&p.x<2035&&p.y>=260&&p.y<820)&&p.y<805:id==='beach'?p.y>=805:id==='path'?p.x>=1235:id==='market'?p.y>=650:id==='bazaar'?p.y<650:true;
const scale=2,cell=40;
const names=['center','N','E','S','W','outer-NW','outer-NE','outer-SE','outer-SW','inner-NW','inner-NE','inner-SE','inner-SW'];
const junction={stone:{N:13,E:23,S:24,W:14},soil:{N:8,E:30,S:30,W:8}};
const atlasRect=(index:number,r:Rect):Rect=>({...r,x:index%4*cell+r.x,y:Math.floor(index/4)*cell+r.y});
/** Existing native grass bites and stone/soil fragments, at twice their old world size.
 * No collision, material patch, portal, camera or save coordinate mutation. */
export function strongGroundEdges(scene:string):GroundEdge[]{
 const cached=cache.get(scene);if(cached)return cached;
 const out:GroundEdge[]=[];
 for(const id of zonesFor(scene)){
  const layout=outdoors[id];if(!layout)continue;
  const allowed=(r:Rect,road:string)=>{
   for(let y=r.y+1;y<r.y+r.h;y+=4)for(let x=r.x+1;x<r.x+r.w;x+=4){
    if(!['grass',road].includes(terrainAt(layout,{x,y})??''))return false;
    if(!visible(id,globalPoint(id,{x,y})))return false;
   }
   return true;
  };
  // Follow the same top-material union and source cut measurements as the old native composer.
  const edges=roadBoundaries(layout).filter(e=>e.road==='stone'||['hill','camp'].includes(id));
  for(const e of edges){
   const native=e.road==='stone'?'stone':'soil',v=e.from.x===e.to.x,z=junction[native][e.side];
   const lo=Math.max(0,z-12),hi=Math.min(cell,z+12),index=names.indexOf(e.side);
   const from=v?e.from.y:e.from.x,to=v?e.to.y:e.to.x,global=globalPoint(id,e.from),phase=(v?global.y:global.x)-from;
   for(let at=Math.floor((from+phase)/(cell*scale))*cell*scale-phase;at<to;at+=cell*scale){
    const start=Math.max(at,from),length=Math.min(at+cell*scale,to)-start;
    const local={x:v?e.from.x+(lo-z)*scale:start,y:v?start:e.from.y+(lo-z)*scale,w:v?(hi-lo)*scale:length,h:v?length:(hi-lo)*scale};
    if(!allowed(local,e.road))continue;
    const sourceRect=atlasRect(index,{x:v?lo:(start-at)/scale,y:v?(start-at)/scale:lo,w:v?hi-lo:length/scale,h:v?length/scale:hi-lo});
    out.push({rect:{...globalPoint(id,local),w:local.w,h:local.h},material:e.road,phase:index,native,sourceRect,roadSide:e.side,seamOffset:(z-lo)*scale});
   }
  }
  const endpoints=new Map<string,Point>();for(const e of edges)for(const p of [e.from,e.to])endpoints.set(p.x+':'+p.y,p);
  for(const p of endpoints.values()){
   const around=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([dx,dy])=>terrainAt(layout,{x:p.x+dx,y:p.y+dy}));
   for(const native of ['stone','soil'] as const){
    if(native==='soil'&&!['hill','camp'].includes(id))continue;
    const road=native==='stone'?'stone':'sand';if(around.some(a=>a!=='grass'&&a!==road))continue;
    const q=around.map(a=>a===road),n=q.filter(Boolean).length;if(n!==1&&n!==3)continue;
    const direction=n===1?['SE','SW','NE','NW'][q.indexOf(true)]:['NW','NE','SW','SE'][q.indexOf(false)];
    const index=names.indexOf((n===1?'outer-':'inner-')+direction),local={x:p.x-20,y:p.y-20,w:40,h:40};
    if(!allowed(local,road))continue;
    out.push({rect:{...globalPoint(id,local),w:40,h:40},material:road,phase:index,native,sourceRect:atlasRect(index,{x:10,y:10,w:20,h:20}),cornerRoads:q});
   }
  }
 }
 // Harbor/dock are deliberately unchanged until the user's screenshot seam can be located.
 for(const id of zonesFor(scene))for(const e of waterBanks(id)){
  const v=e.from.x===e.to.x,len=v?e.to.y-e.from.y:e.to.x-e.from.x,dir=e.side==='E'||e.side==='S'?1:-1;
  for(let t=0,i=0;t<len;t+=32,i++){
   const n=Math.min(32,len-t),depth=[14,22,18,26][i%4],p={x:e.from.x+(v?0:t),y:e.from.y+(v?t:0)};
   const r={x:v?p.x+(dir>0?-depth:0):p.x,y:v?p.y:p.y+(dir>0?-depth:0),w:v?depth:n,h:v?n:depth};
   let dry=true;for(let y=r.y+2;y<r.y+r.h;y+=4)for(let x=r.x+2;x<r.x+r.w;x+=4)if(!['wood','stone'].includes(terrainAt(outdoors[id],{x,y})??''))dry=false;
   if(dry)out.push({rect:{...globalPoint(id,r),w:r.w,h:r.h},material:'wood',phase:i%4});
  }
 }
 cache.set(scene,out);return out;
}
export type WaterBank={from:Point;to:Point;side:'N'|'E'|'S'|'W';dry:'stone'|'wood'};
export function waterBanks(id:string):WaterBank[]{const l=outdoors[id];if(!l||!['harbor','dock'].includes(id))return [];const b=l.bounds,xs=[...new Set([b.x,b.x+b.w,...l.patches.flatMap(p=>[Math.max(b.x,Math.min(b.x+b.w,p.x)),Math.max(b.x,Math.min(b.x+b.w,p.x+p.w))])])].sort((a,b)=>a-b),ys=[...new Set([b.y,b.y+b.h,...l.patches.flatMap(p=>[Math.max(b.y,Math.min(b.y+b.h,p.y)),Math.max(b.y,Math.min(b.y+b.h,p.y+p.h))])])].sort((a,b)=>a-b),out:WaterBank[]=[];const add=(a:any,c:any,from:Point,to:Point,s:WaterBank['side'],r:WaterBank['side'])=>{if(c==='water'&&['stone','wood'].includes(a))out.push({from,to,side:s,dry:a});else if(a==='water'&&['stone','wood'].includes(c))out.push({from,to,side:r,dry:c})};for(let j=0;j<ys.length-1;j++)for(let i=1;i<xs.length-1;i++){const x=xs[i],y=(ys[j]+ys[j+1])/2;add(terrainAt(l,{x:(xs[i-1]+x)/2,y}),terrainAt(l,{x:(x+xs[i+1])/2,y}),{x,y:ys[j]},{x,y:ys[j+1]},'E','W')}for(let j=1;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){const x=(xs[i]+xs[i+1])/2,y=ys[j];add(terrainAt(l,{x,y:(ys[j-1]+y)/2}),terrainAt(l,{x,y:(y+ys[j+1])/2}),{x:xs[i],y},{x:xs[i+1],y},'S','N')}return out;}
