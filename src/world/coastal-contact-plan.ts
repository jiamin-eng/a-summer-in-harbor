import type {Material} from './coastal-adjacency';
type Rect={x:number;y:number;w:number;h:number};
/** Detect contact cells from the rendered world field, with one tile of halo
 * for corners/wet sand. Merge cells into rectangles to bound textures/draws. */
export function coastalContactRects(at:(x:number,y:number)=>Material,bounds:Rect):Rect[]{
 const cells=new Set<string>(),step=16,minX=Math.floor(bounds.x/step),minY=Math.floor(bounds.y/step),maxX=Math.ceil((bounds.x+bounds.w)/step),maxY=Math.ceil((bounds.y+bounds.h)/step);
 const natural=(m:Material)=>m==='grass'||m==='sand'||m==='water';
 for(let ty=minY;ty<maxY;ty++)for(let tx=minX;tx<maxX;tx++){
  const set=new Set<Material>();for(const dy of [0,4,8,12,16])for(const dx of [0,4,8,12,16]){const m=at(tx*step+dx-.01,ty*step+dy-.01);if(natural(m))set.add(m)}
  if(set.size<2)continue;
  for(let y=ty-1;y<=ty+1;y++)for(let x=tx-1;x<=tx+1;x++)if(x>=minX&&x<maxX&&y>=minY&&y<maxY)cells.add(x+':'+y);
 }
 const result:Rect[]=[];let prior=new Map<string,Rect>();
 for(let y=minY;y<maxY;y++){const row:Rect[]=[];let run:Rect|undefined;for(let x=minX;x<maxX;x++)if(cells.has(x+':'+y)){if(run)run.w+=step;else{run={x:x*step,y:y*step,w:step,h:step};row.push(run)}}else run=undefined;
  const next=new Map<string,Rect>();for(const r of row){const key=r.x+':'+r.w,old=prior.get(key);if(old){old.h+=step;next.set(key,old)}else{result.push(r);next.set(key,r)}}prior=next;
 }
 return result;
}
