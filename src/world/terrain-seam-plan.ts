import {outdoors,type TerrainPatch} from './outdoors';
import {terrainAt} from './road-boundaries';
import {globalPoint,zonesFor} from '../candidate/continuity';
import type {Point,Rect} from '../engine/world';

type Material=TerrainPatch['material'];
export type TerrainSeam={zone:string;rect:Rect;axis:'x'|'y';negative:Material;positive:Material};
export type TerrainJunction={zone:string;at:Point;quadrants:[Material,Material,Material,Material];materials:Material[]};
const cache=new Map<string,TerrainSeam[]>();

// The source bitmaps have different ownership crops in the two continuous
// spaces. Do not request art for a line hidden by the next source bitmap.
const visible=(id:string,p:Point)=>id==='coast'?!(p.x>=1235&&p.x<2035&&p.y>=260&&p.y<820)&&p.y<805:id==='beach'?p.y>=805:id==='path'?p.x>=1235:id==='market'?p.y>=650:id==='bazaar'?p.y<650:true;
export const seamPair=(a:Material,b:Material)=>[a,b].sort().join('/') as `${Material}/${Material}`;

/** Every visible top-material seam, including built surfaces awaiting art.
 * This is a visual inventory only: it never changes terrain, collision,
 * portals, saved coordinates or renderer admission. */
export function terrainSeams(scene:string):TerrainSeam[]{
 const prior=cache.get(scene);if(prior)return prior;
 const out:TerrainSeam[]=[];
 for(const id of zonesFor(scene)){
  const l=outdoors[id];if(!l)continue;const b=l.bounds;
  const axis=(k:'x'|'y',s:'w'|'h')=>[...new Set([b[k],b[k]+b[s],...l.patches.flatMap(p=>[Math.max(b[k],Math.min(b[k]+b[s],p[k])),Math.max(b[k],Math.min(b[k]+b[s],p[k]+p[s]))])])].sort((a,c)=>a-c);
  const xs=axis('x','w'),ys=axis('y','h');
  const put=(edge:number,start:number,end:number,orientation:'x'|'y',negative:Material|undefined,positive:Material|undefined)=>{
   if(!negative||!positive||negative===positive)return;
   let run:number|undefined;
   const emit=(until:number)=>{if(run===undefined)return;const local=orientation==='x'?{x:edge-16,y:run,w:32,h:until-run}:{x:run,y:edge-16,w:until-run,h:32};
    out.push({zone:id,rect:{...globalPoint(id,local),w:local.w,h:local.h},axis:orientation,negative:negative!,positive:positive!});run=undefined};
   for(let at=start;at<end;at+=16){const stop=Math.min(at+16,end),mid=orientation==='x'?{x:edge,y:(at+stop)/2}:{x:(at+stop)/2,y:edge};
    if(visible(id,globalPoint(id,mid))){run??=at}else emit(at)}
   emit(end);
  };
  for(let i=1;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){const x=xs[i],y=(ys[j]+ys[j+1])/2;put(x,ys[j],ys[j+1],'x',terrainAt(l,{x:x-.5,y}),terrainAt(l,{x:x+.5,y}))}
  for(let j=1;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){const y=ys[j],x=(xs[i]+xs[i+1])/2;put(y,xs[i],xs[i+1],'y',terrainAt(l,{x,y:y-.5}),terrainAt(l,{x,y:y+.5}))}
 }
 cache.set(scene,out);return out;
}

/** Clockwise NW/NE/SE/SW junctions needing an authored inner/outer/T tile.
 * A straight two-material edge is deliberately excluded. */
export function terrainJunctions(scene:string):TerrainJunction[]{
 const out:TerrainJunction[]=[];
 for(const id of zonesFor(scene)){
  const l=outdoors[id];if(!l)continue;const b=l.bounds;
  const xs=[...new Set(l.patches.flatMap(p=>[p.x,p.x+p.w]))].filter(x=>x>b.x&&x<b.x+b.w);
  const ys=[...new Set(l.patches.flatMap(p=>[p.y,p.y+p.h]))].filter(y=>y>b.y&&y<b.y+b.h);
  for(const x of xs)for(const y of ys){
   if(!visible(id,globalPoint(id,{x,y})))continue;
   const q=[[x-.5,y-.5],[x+.5,y-.5],[x+.5,y+.5],[x-.5,y+.5]].map(([a,c])=>terrainAt(l,{x:a,y:c}));
   if(q.some(m=>!m))continue;const [nw,ne,se,sw]=q as [Material,Material,Material,Material];
   const materials=[...new Set(q)] as Material[];
   if(materials.length<2||nw===ne&&sw===se||nw===sw&&ne===se)continue;
   out.push({zone:id,at:globalPoint(id,{x,y}),quadrants:[nw,ne,se,sw],materials});
  }
 }
 return out;
}
