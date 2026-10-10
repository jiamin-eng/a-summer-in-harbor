import type {Point,Rect} from '../engine/world';
type Patch=Rect&{material:string};type Plant={at:Point;width:number;height:number};
export type WeatherDecoration={id:string;at:Point;kind:'splash'|'ripple'|'leaves';width:number};
/** Immutable authored-ground pool. The original camera reuses a bounded subset;
 * footprint margins keep impacts off roofs, obstacles and water/land edges. */
export function weatherDecorations(patches:Patch[],barriers:Rect[],plants:Plant[],spawn:Point):WeatherDecoration[]{
 const contains=(r:Rect,p:Point)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h,top=[...patches].reverse();
 const ground:Point[]=[],water:Point[]=[];
 for(let row=0,y=24;y<=1064;row++,y+=16)for(let col=0,x=24;x<=1416;col++,x+=16){
  const p={x:x+(row*17+col*23)%9-4,y:y+(row*11+col*7)%9-4},patch=top.find(r=>contains(r,p));
  if(!patch)continue;const corners=[p,{x:p.x-16,y:p.y-16},{x:p.x+16,y:p.y-16},{x:p.x-16,y:p.y+16},{x:p.x+16,y:p.y+16}];
  if(corners.some(q=>top.find(r=>contains(r,q))?.material!==patch.material)||barriers.some(r=>p.x+16>=r.x&&p.x-16<r.x+r.w&&p.y+16>=r.y&&p.y-16<r.y+r.h))continue;
  (patch.material==='water'?water:ground).push(p);
 }
 const nearest=(list:Point[],cap:number)=>list.sort((a,b)=>(a.x-spawn.x)**2+(a.y-spawn.y)**2-((b.x-spawn.x)**2+(b.y-spawn.y)**2)).slice(0,cap);
 return [...nearest(ground,8192).map((at,i)=>({id:'splash-'+i,at,kind:'splash' as const,width:12})),...nearest(water,4096).map((at,i)=>({id:'ripple-'+i,at,kind:'ripple' as const,width:24})),...plants.slice(0,4).map((p,i)=>({id:'leaves-'+i,at:{x:p.at.x,y:p.at.y-p.height*.65},kind:'leaves' as const,width:Math.min(60,p.width*.6)}))];
}
