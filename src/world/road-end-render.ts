import {Texture} from 'pixi.js';
import stoneWater from './terrain-contact-native/stone-water.png';
import woodWater from './terrain-contact-native/wood-water.png';
import stoneGrass from './road-edge-native/road-stone-atlas.png';
import soilGrass from './road-edge-native/road-soil-atlas.png';
import {roadEndPlan,roadEndVisible,type RoadEndPiece} from './road-end-plan';
type Layer={texture:Texture;at:{x:number;y:number};clip:RoadEndPiece['rect']};
const images=new Map<string,Promise<HTMLImageElement>>(),layers=new Map<string,Layer[]>();
const load=(url:string)=>{let task=images.get(url);if(!task){task=(async()=>{const im=new Image();im.src=url;await im.decode();return im})();images.set(url,task)}return task};
const mod=(n:number,d:number)=>((n%d)+d)%d;
/** Small cached repair layers from existing floor pixels/approved native trim.
 * No new full-map texture, per-frame composition, geometry or source image edit. */
export async function prepareRoadEnds(scene:string){
 if(layers.has(scene))return;const result:Layer[]=[];
 for(const p of roadEndPlan(scene)){
  const {rect:r}=p,c=document.createElement('canvas');c.width=r.w;c.height=r.h;const ctx=c.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  if(p.kind==='tail'){
   const im=await load('./art/floor-'+(p.background==='grass'?'grass-v3':p.background)+'.png');
   for(let y=-mod(r.y,160);y<c.height;y+=160)for(let x=-mod(r.x,160);x<c.width;x+=160)ctx.drawImage(im,x,y,160,160);
  }else{
   const vertical=p.side==='E'||p.side==='W',structural=p.background==='water',im=await load(structural?(p.material==='wood'?woodWater:stoneWater):(p.material==='sand'?soilGrass:stoneGrass));
   const index=structural?['N','E','S','W'].indexOf(p.side!):['center','N','E','S','W'].indexOf(p.side!),cell=structural?40:256,cols=structural?5:4,worldCell=structural?40:80;
   // Atlas grass/road split differs by side; place that split on the actual bound.
   const split=structural?20:(p.material==='sand'?({N:8,E:30,S:30,W:8}[p.side!]):({N:13,E:23,S:24,W:14}[p.side!]))*2;
   for(let at=-(mod(vertical?r.y:r.x,worldCell));at<(vertical?c.height:c.width);at+=worldCell){const x=vertical?16-split:at,y=vertical?at:16-split;ctx.drawImage(im,index%cols*cell,Math.floor(index/cols)*cell,cell,cell,x,y,worldCell,worldCell)}
   if(!structural){const pixels=ctx.getImageData(0,0,c.width,c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const normal=vertical?x:y,i=(y*c.width+x)*4,grass=pixels.data[i+1]-pixels.data[i]>=6&&pixels.data[i+1]-pixels.data[i+2]>=15,road=p.side==='N'||p.side==='W'?normal>=16:normal<16;if(p.material==='stone'&&grass!==road&&Math.abs(normal-16)>=2)pixels.data[i+3]=0;const margin=Math.min(normal,31-normal),noise=mod(Math.floor((r.x+x)/2)*17+Math.floor((r.y+y)/2)*31,16)/16;if(margin<6&&noise>=margin/6)pixels.data[i+3]=0}ctx.putImageData(pixels,0,0)}
  }
  const pixels=ctx.getImageData(0,0,c.width,c.height);let painted=false;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(!roadEndVisible(scene,p.zone,{x:r.x+x+.5,y:r.y+y+.5}))pixels.data[i+3]=0;if(pixels.data[i+3])painted=true}if(!painted)continue;ctx.putImageData(pixels,0,0);
  const texture=Texture.from(c);texture.source.scaleMode='nearest';result.push({texture,at:r,clip:r});
 }
 layers.set(scene,result);
}
export const roadEndLayers=(scene:string)=>layers.get(scene)??[];
