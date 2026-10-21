import type {Point,Rect} from '../engine/world';

const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const overlap=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export const padCaptionRect=(r:Rect,p=4):Rect=>({x:r.x-p,y:r.y-p,w:r.w+p*2,h:r.h+p*2});
/** Caption placement is screen-only. The authoritative landing point never moves. */
export function placeShoreCaption(point:Point,size:{w:number;h:number},viewport:{w:number;h:number},avoid:Rect[]):Rect|null{
 const {w,h}=size,edge=8;
 if(![point.x,point.y,w,h,viewport.w,viewport.h].every(Number.isFinite)||w<=0||h<=0||w>viewport.w-edge*2||h>viewport.h-edge*2)return null;
 const blocks=[...avoid.map(r=>padCaptionRect(r)),{x:point.x-14,y:point.y-14,w:28,h:28}];
 const xs=[point.x+18,point.x-w-18,point.x-w/2,edge,viewport.w-w-edge,...blocks.flatMap(r=>[r.x-w,r.x+r.w])];
 const ys=[point.y+18,point.y-h-18,point.y-h/2,edge,viewport.h-h-edge,...blocks.flatMap(r=>[r.y-h,r.y+r.h])];
 const choices:Rect[]=[];
 for(const x of xs)for(const y of ys){const r={x:clamp(x,edge,viewport.w-w-edge),y:clamp(y,edge,viewport.h-h-edge),w,h};if(!blocks.some(b=>overlap(r,b)))choices.push(r)}
 const score=(r:Rect)=>Math.hypot(clamp(point.x,r.x,r.x+r.w)-point.x,clamp(point.y,r.y,r.y+r.h)-point.y)+Math.hypot(r.x+w/2-point.x,r.y+h/2-point.y)*.001;
 return choices.sort((a,b)=>score(a)-score(b))[0]??null;
}
export function captionLeaderEnd(point:Point,label:Rect):Point{return{x:clamp(point.x,label.x,label.x+label.w),y:clamp(point.y,label.y,label.y+label.h)}}
