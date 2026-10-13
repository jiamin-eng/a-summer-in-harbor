/** A visual-only replacement of the bazaar north/west material junction.
 * Unequal lobes alter the silhouette; no frame noise, world or collision changes. */
export const marketContourRect={x:150,y:170,w:620,h:420};
const north=[[0,0],[32,20],[84,-18],[112,9],[178,-23],[220,23],[296,-10],[344,18],[408,-22],[450,14],[526,-16],[580,0]];
const west=[[0,0],[42,-18],[110,22],[150,-26],[208,14],[262,-14],[314,24],[380,0]];
function lobe(knots:number[][],at:number){
 if(at<=0)return 0;for(let i=1;i<knots.length;i++){const [b,v]=knots[i],[a,u]=knots[i-1];if(at<=b){const t=(at-a)/(b-a),s=t*t*(3-2*t);return u+(v-u)*s}}return 0;
}
export function marketContourBoundary(side:'north'|'west',at:number){return (side==='north'?210:190)+Math.round(lobe(side==='north'?north:west,at-(side==='north'?190:210))/2)*2;}
export function marketContourPixel(x:number,y:number):'grass'|'stone'|undefined{
 const top=x>=150&&x<770&&y>=170&&y<250,left=x>=150&&x<230&&y>=170&&y<590;
 if(!top&&!left)return;
 const nx=marketContourBoundary('west',y),ny=marketContourBoundary('north',x);
 // A few two-pixel grass tips interrupt the contour without a new outline.
 const tip=(n:number)=>((Math.floor(n/2)*17+Math.floor(n/12)*31)>>>0)%19<4?4:0;
 return x>=nx+tip(y)&&y>=ny+tip(x)&&x<770&&y<590?'stone':'grass';
}
