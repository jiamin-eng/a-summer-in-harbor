import {outdoors,type TerrainPatch} from './outdoors';
import {terrainAt} from './road-boundaries';
import {globalPoint,localPoint,zonesFor} from '../candidate/continuity';
import type {Point,Rect} from '../engine/world';
export type RoadMaterial='stone'|'sand'|'wood';
export type RoadEndPiece={zone:string;rect:Rect;kind:'tail'|'cap';material:RoadMaterial;background:TerrainPatch['material'];side?:'N'|'E'|'S'|'W'};
const visible=(id:string,p:Point)=>id==='coast'?!(p.x>=1235&&p.x<2035&&p.y>=260&&p.y<820)&&p.y<805:id==='beach'?p.y>=805:id==='path'?p.x>=1235:id==='market'?p.y>=650:id==='bazaar'?p.y<650:true;
const inside=(r:Rect,p:Point)=>p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.w&&p.y<r.y+r.h;
/** Presentation ownership only. Never imported by authority/collision. */
export function roadEndVisible(scene:string,zone:string,p:Point){return visible(zone,p)&&!zonesFor(scene).some(id=>id!==zone&&outdoors[id]&&inside(outdoors[id].bounds,localPoint(id,p)))}
const road=(m:unknown,background:string):m is RoadMaterial=>['stone','wood',...(background==='grass'?['sand']:[])].includes(m as string);
const plans=new Map<string,RoadEndPiece[]>();
export function roadEndPlan(scene:string):RoadEndPiece[]{
 const old=plans.get(scene);if(old)return old;const out:RoadEndPiece[]=[];
 for(const zone of zonesFor(scene)){
  const l=outdoors[zone];if(!l)continue;const b=l.bounds,background=l.patches[0].material;
  const axis=(key:'x'|'y',size:'w'|'h',max:number)=>[...new Set([0,max,b[key],b[key]+b[size],...l.patches.flatMap(p=>[p[key],p[key]+p[size]])])].filter(n=>n>=0&&n<=max).sort((a,c)=>a-c);
  const xs=axis('x','w',1440),ys=axis('y','h',1088);
  const add=(rect:Rect,kind:RoadEndPiece['kind'],material:RoadMaterial,side?:RoadEndPiece['side'])=>out.push({zone,rect:{...globalPoint(zone,rect),w:rect.w,h:rect.h},kind,material,background,side});
  for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){
   const r={x:xs[i],y:ys[j],w:xs[i+1]-xs[i],h:ys[j+1]-ys[j]},p={x:r.x+r.w/2,y:r.y+r.h/2},m=terrainAt(l,p);
   if(!inside(b,p)&&road(m,background)&&roadEndVisible(scene,zone,globalPoint(zone,p))){
    // Also erase the old contact band's footprint outside the world: otherwise
    // its outline would survive as a rectangular frame over the repainted water.
    const paint=r.y+r.h<=b.y?{x:r.x-20,y:r.y-20,w:r.w+40,h:r.h+20}:r.y>=b.y+b.h?{x:r.x-20,y:r.y,w:r.w+40,h:r.h+20}:r.x+r.w<=b.x?{x:r.x-20,y:r.y-20,w:r.w+20,h:r.h+40}:{x:r.x,y:r.y-20,w:r.w+20,h:r.h+40};
    add(paint,'tail',m);
   }
  }
  for(const side of ['N','E','S','W'] as const){const vertical=side==='E'||side==='W',edge=side==='N'?b.y:side==='S'?b.y+b.h:side==='W'?b.x:b.x+b.w,values=(vertical?ys:xs).filter(n=>n>=(vertical?b.y:b.x)&&n<=(vertical?b.y+b.h:b.x+b.w)),dir=side==='N'||side==='W'?-1:1;
   for(let i=0;i<values.length-1;i++){const a=values[i],z=values[i+1],mid=(a+z)/2,outer=vertical?{x:edge+dir*.5,y:mid}:{x:mid,y:edge+dir*.5},inner=vertical?{x:edge-dir*.5,y:mid}:{x:mid,y:edge-dir*.5},m=terrainAt(l,inner);
    if(road(m,background)&&roadEndVisible(scene,zone,globalPoint(zone,outer)))add(vertical?{x:edge-16,y:a,w:32,h:z-a}:{x:a,y:edge-16,w:z-a,h:32},'cap',m,side);
   }
  }
 }
 plans.set(scene,out);return out;
}
