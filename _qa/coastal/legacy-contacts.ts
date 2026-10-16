import {outdoors,type TerrainPatch} from '../../src/world/outdoors';
import {terrainAt} from '../../src/world/road-boundaries';
import {COASTAL,globalPoint,zonesFor} from '../../src/candidate/continuity';
import type {Point,Rect} from '../../src/engine/world';

type Material=TerrainPatch['material'];
export type TerrainContact={rect:Rect;axis:'x'|'y';negative:Material;positive:Material;native:'grass-dirt'|'dirt-water'|'grass-water'};
const cache=new Map<string,TerrainContact[]>();
const visible=(id:string,p:Point)=>id==='coast'?!(p.x>=1235&&p.x<2035&&p.y>=260&&p.y<820)&&p.y<805:id==='beach'?p.y>=805:id==='path'?p.x>=1235:id==='market'?p.y>=650:id==='bazaar'?p.y<650:true;
const pair=(a:Material,b:Material)=>[a,b].sort().join('/');
// Natural shoreline and beach transitions take native cuts. Built quay,
// boardwalk and bridge contacts keep their authored straight masonry/rail.
const eligible=(id:string,a:Material,b:Material)=>{
 const p=pair(a,b);return p==='sand/stone'||p==='sand/water'||p==='grass/water'||p==='grass/sand'&&!['hill','camp'].includes(id);
};
const native=(a:Material,b:Material):TerrainContact['native']=>a==='water'||b==='water'?(a==='grass'||b==='grass'?'grass-water':'dirt-water'):'grass-dirt';

/** Every visible top-material contact omitted by the existing road atlas.
 * Only paint: do not extend patches, collision, portal or saved coordinates. */
export function terrainContacts(scene:string):TerrainContact[]{
 const prior=cache.get(scene);if(prior)return prior;
 const out:TerrainContact[]=[];
 for(const id of zonesFor(scene)){
  const l=outdoors[id];if(!l)continue;const b=l.bounds;
  const axis=(k:'x'|'y',s:'w'|'h')=>[...new Set([b[k],b[k]+b[s],...l.patches.flatMap(p=>[Math.max(b[k],Math.min(b[k]+b[s],p[k])),Math.max(b[k],Math.min(b[k]+b[s],p[k]+p[s]))])])].sort((a,c)=>a-c);
  const xs=axis('x','w'),ys=axis('y','h');
  const put=(edge:number,start:number,end:number,axis:'x'|'y',negative:Material|undefined,positive:Material|undefined)=>{
   if(!negative||!positive||negative===positive||!eligible(id,negative,positive))return;
   // Check visibility in native-size pieces, then merge adjacent accepted pieces.
   let run:number|undefined;
   const emit=(until:number)=>{if(run===undefined)return;const local=axis==='x'?{x:edge-16,y:run,w:32,h:until-run}:{x:run,y:edge-16,w:until-run,h:32};
    out.push({rect:{...globalPoint(id,local),w:local.w,h:local.h},axis,negative:negative!,positive:positive!,native:native(negative!,positive!)});run=undefined};
   for(let at=start;at<end;at+=16){const stop=Math.min(at+16,end),mid=axis==='x'?{x:edge,y:(at+stop)/2}:{x:(at+stop)/2,y:edge};
    if(visible(id,globalPoint(id,mid))){run??=at}else emit(at)}
   emit(end);
  };
  for(let i=1;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){const x=xs[i],y=(ys[j]+ys[j+1])/2;put(x,ys[j],ys[j+1],'x',terrainAt(l,{x:x-.5,y}),terrainAt(l,{x:x+.5,y}))}
  for(let j=1;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){const y=ys[j],x=(xs[i]+xs[i+1])/2;put(y,xs[i],xs[i+1],'y',terrainAt(l,{x,y:y-.5}),terrainAt(l,{x,y:y+.5}))}
 }
 // The combined coastal renderer hands y=805 from the coast bitmap to the
 // beach bitmap. That ownership seam is not a patch edge in either source.
 // Coast water to the beach's sand backing needs the same native shore cut.
 if(scene===COASTAL){
  // The path's legacy crop begins at x=1235 and paints grass over the sea
  // from y=600 to 820. This is a second cross-zone contact.
  out.push({rect:{x:1219,y:600,w:32,h:220},axis:'x',negative:'water',positive:'grass',native:'grass-water'});
  let run:number|undefined;
  const emit=(stop:number)=>{if(run===undefined)return;out.push({rect:{x:run,y:789,w:stop-run,h:32},axis:'y',negative:'water',positive:'sand',native:'dirt-water'});run=undefined};
  for(let x=70;x<1235;x+=10){const stop=Math.min(x+10,1235),top=terrainAt(outdoors.coast,{x:(x+stop)/2,y:804})??'water';
   if(top==='water'){run??=x}else emit(x)}
  emit(1235);
 }
 cache.set(scene,out);return out;
}
