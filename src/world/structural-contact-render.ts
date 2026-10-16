import {Texture} from 'pixi.js';
import stoneWaterURL from './terrain-contact-native/stone-water.png';
import woodWaterURL from './terrain-contact-native/wood-water.png';
import stoneWoodURL from './terrain-contact-native/stone-wood.png';
import grassWoodURL from './terrain-contact-native/grass-wood.png';
import junctionURL from './terrain-contact-native/three-material-junctions.png';
import {structuralContactPlan,composeStructuralPiece,type StructuralAtlas} from './structural-contact-plan';
import type {PixelTile} from './coastal-adjacency';

const urls:Record<StructuralAtlas,string>={
 'stone-water':stoneWaterURL,'wood-water':woodWaterURL,'stone-wood':stoneWoodURL,
 'grass-wood':grassWoodURL,'three-material-junctions':junctionURL,
};
type Layer={texture:Texture;at:{x:number;y:number};clip:{x:number;y:number;w:number;h:number}};
const layers=new Map<string,Layer[]>();
let sourceTask:Promise<Record<StructuralAtlas,PixelTile>>|undefined;
const sources=()=>sourceTask??=(async()=>{
 const out={} as Record<StructuralAtlas,PixelTile>;
 for(const [key,url] of Object.entries(urls)){
  const image=new Image();image.src=url;await image.decode();
  if(image.width!==200||image.height!==200)throw Error('STRUCTURAL_ATLAS_DIMENSIONS:'+key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=200;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
  out[key as StructuralAtlas]={width:200,height:200,data:ctx.getImageData(0,0,200,200).data};
 }
 return out;
})();

export async function prepareStructuralContacts(scene:string){
 if(layers.has(scene))return;
 const plan=structuralContactPlan(scene);
 if(!plan.length){layers.set(scene,[]);return}
 const atlases=await sources(),out:Layer[]=[];
 for(const piece of plan){
  const pixels=composeStructuralPiece(scene,piece,plan,atlases);
  if(!pixels.some((v,i)=>i%4===3&&v>0))continue;
  const canvas=document.createElement('canvas');canvas.width=piece.rect.w;canvas.height=piece.rect.h;
  const ctx=canvas.getContext('2d')!,image=ctx.createImageData(canvas.width,canvas.height);
  image.data.set(pixels);ctx.putImageData(image,0,0);
  const texture=Texture.from(canvas);texture.source.scaleMode='nearest';
  out.push({texture,at:{x:piece.rect.x,y:piece.rect.y},clip:piece.rect});
 }
 layers.set(scene,out);
}
export const structuralContactLayers=(scene:string)=>layers.get(scene)??[];
