import {outdoors,type TerrainPatch} from './outdoors';
const poly=[[1280,140],[2600,140],[2600,1228],[1235,1228],[1235,1100],[1244,1100],[1244,1052],[1256,1052],[1256,1004],[1268,1004],[1268,956],[1280,956],[1280,908],[1272,908],[1272,860],[1260,860],[1260,812],[1244,812],[1244,760],[1235,760],[1235,708],[1248,708],[1248,660],[1260,660],[1260,620],[1272,620],[1272,580],[1280,580]];
const reversed=Object.fromEntries(Object.entries(outdoors).map(([id,l])=>[id,l.patches.slice().reverse()]));
const sample=(id:string,a:number,b:number,fallback:TerrainPatch['material'])=>reversed[id].find(p=>a>=p.x&&a<p.x+p.w&&b>=p.y&&b<p.y+p.h)?.material??fallback;
/** Render ownership only. Never consumed by collision, navigation, saves or NPCs.
 * All contacts sample this same field, including across source bitmap crops. */
export function coastalMaterialAt(x:number,y:number):TerrainPatch['material']{

 let m:TerrainPatch['material']=y>=805&&x>=70&&x<1280?sample('beach',x-70,y-650,'sand'):sample('coast',x,y,'water');
 // The actual adapter draws this entire playable path crop on top of coast.
 if(x>=1235&&x<2035&&y>=260&&y<820)m=sample('path',x-1155,y-140,'grass');
 // The outer source path uses this authored polygon. Sample its ownership,
 // not a second phase origin for its native ground.

 let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
 if(inside)m=sample('path',x-1155,y-140,'grass');
 // Existing beach-entry grass erasure reuses this sand rectangle.
 if(x>=150&&x<950&&y>=805&&y<895)m='sand';
 // Authored hard road taper: never soften or recolour this stone geometry.
 if(y>=415&&y<535&&x>=1210){const right=y<419||y>=531?1240:y<423||y>=527?1260:y<425||y>=525?1280:1390;if(x<right)m='stone';}
 return m;
}
