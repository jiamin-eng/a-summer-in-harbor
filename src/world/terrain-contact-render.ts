import {Assets,type Texture} from 'pixi.js';
import atlasURL from './tiled-native/buch-outdoor.png';
import rules from './tiled-native/terrain-rules.json';
import type {TerrainContact} from './terrain-contacts';
import type {TerrainPatch} from './outdoors';
import {coastalMaterialAt} from './coastal-material-field';
import {coastalSurfaceAssets} from './coastal-surface-assets';
import {createCoastalComposer,type PixelTile} from './coastal-adjacency';

type Material=TerrainPatch['material'];
const images=new Map<string,Promise<HTMLImageElement>>();
const pixels=new Map<Material,ImageData>();
const textures=new Map<string,Texture>();
const source=(url:string)=>{let task=images.get(url);if(!task){task=(async()=>{const image=new Image();image.src=url;await image.decode();return image})();images.set(url,task)}return task};
const materialFile=(m:Material)=>'./art/floor-'+(m==='grass'?'grass-v3':m)+'.png';
const key=(e:TerrainContact)=>[e.scene??'legacy',e.rect.x,e.rect.y,e.rect.w,e.rect.h,e.axis,e.negative,e.positive].join(':');
const palette={1:[63,116,77],2:[121,42,44],4:[52,74,97]};
const signatures=new Map<string,number[]>();
for(const r of rules.rules){const k=r.corners.join(',');signatures.set(k,[...(signatures.get(k)??[]),r.id])}
const profileCache=new Map<string,number[]>();
async function profile(native:HTMLImageElement,id:number,axis:'x'|'y',negative:1|2|4,positive:1|2|4){
 const k=[id,axis,negative,positive].join(':');let found=profileCache.get(k);if(found)return found;
 const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d',{willReadFrequently:true})!;
 ctx.drawImage(native,id%24*16,Math.floor(id/24)*16,16,16,0,0,16,16);
 const data=ctx.getImageData(0,0,16,16).data,a=palette[negative],b=palette[positive],cuts:number[]=[];
 for(let t=0;t<16;t++){let count=0;for(let n=0;n<16;n++){
  const x=axis==='x'?n:t,y=axis==='x'?t:n,i=(y*16+x)*4;
  const distance=(q:number[])=>((data[i]-q[0])**2+(data[i+1]-q[1])**2+(data[i+2]-q[2])**2);
  if(distance(a)<=distance(b))count++;
 }cuts.push(Math.max(4,Math.min(12,count)))}
 profileCache.set(k,cuts);return cuts;
}
/** Repaint only a 32-unit contact band with the existing floor pixels, cut by
 * the official Tiled native terrain silhouettes. The old rectangular seam is
 * fully covered; floor texture phase remains the authored global 160 grid. */
export async function prepareTerrainContact(e:TerrainContact){
 const k=key(e);if(textures.has(k))return;
 if(e.scene==='coast-beach-path'&&[e.negative,e.positive].every(m=>['grass','sand','water'].includes(m))){
  await prepareCoastalContact(e);return;
 }
 const atlas=await source(atlasURL);
 for(const m of [e.negative,e.positive])if(!pixels.has(m)){
  const image=await source(materialFile(m)),c=document.createElement('canvas');c.width=c.height=160;
  const x=c.getContext('2d',{willReadFrequently:true})!;x.imageSmoothingEnabled=false;x.drawImage(image,0,0,160,160);
  pixels.set(m,x.getImageData(0,0,160,160));
 }
 const negative=e.native==='grass-dirt'?1:e.native==='grass-water'?(e.negative==='water'?4:1):(e.negative==='water'?4:2);
 const positive=e.native==='grass-dirt'?2:e.native==='grass-water'?(e.positive==='water'?4:1):(e.positive==='water'?4:2);
 const signature=e.axis==='x'?[positive,positive,negative,negative]:[negative,positive,positive,negative];
 const ids=signatures.get(signature.join(','));if(!ids?.length)throw Error('NATIVE_TERRAIN_SIGNATURE_MISSING:'+signature);
 const profiles=await Promise.all(ids.slice(0,4).map(id=>profile(atlas,id,e.axis,negative as 1|2|4,positive as 1|2|4)));
 const canvas=document.createElement('canvas');canvas.width=e.rect.w;canvas.height=e.rect.h;
 const ctx=canvas.getContext('2d')!,out=ctx.createImageData(canvas.width,canvas.height);
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
  const along=e.axis==='x'?y:x,normal=e.axis==='x'?x:y,globalAlong=e.axis==='x'?e.rect.y+y:e.rect.x+x;
  const phase=Math.floor(globalAlong/32),nativeCut=profiles[((phase%profiles.length)+profiles.length)%profiles.length][((globalAlong%32)+32)%32>>1];
  const cut=Math.max(4,Math.min(28,16+(nativeCut-8)*3));
  const material=normal<cut?e.negative:e.positive,src=pixels.get(material)!.data;
  const sx=((Math.floor(e.rect.x+x)%160)+160)%160,sy=((Math.floor(e.rect.y+y)%160)+160)%160;
  const i=(y*canvas.width+x)*4,j=(sy*160+sx)*4;
  out.data[i]=src[j];out.data[i+1]=src[j+1];out.data[i+2]=src[j+2];out.data[i+3]=255;
 }
 ctx.putImageData(out,0,0);const t=await Assets.load<Texture>(canvas.toDataURL('image/png'));t.source.scaleMode='nearest';textures.set(k,t);
}
export const terrainContactTexture=(e:TerrainContact)=>textures.get(key(e));

let coastalComposer:Promise<ReturnType<typeof createCoastalComposer>>|undefined;
async function prepareCoastalContact(e:TerrainContact){
 const composer=await (coastalComposer??=(async()=>{
  const files={grass:materialFile('grass'),sand:materialFile('sand'),water:materialFile('water')};
  const tiles={} as Record<'grass'|'sand'|'water',PixelTile>;
  for(const [name,url] of Object.entries(files)){
   const im=await source(url),c=document.createElement('canvas');c.width=c.height=160;const ctx=c.getContext('2d')!;
   ctx.imageSmoothingEnabled=false;ctx.drawImage(im,0,0,160,160);tiles[name as keyof typeof tiles]={width:160,height:160,data:ctx.getImageData(0,0,160,160).data};
  }
  const extra={} as {wetSand?:PixelTile;foam?:PixelTile};
  for(const name of ['wetSand','foam'] as const){const url=coastalSurfaceAssets[name];if(!url)continue;if(!url.startsWith('./'))throw Error('COAST_ASSET_RELATIVE_URL_REQUIRED');
   const image=await source(url),size=name==='wetSand'?160:16;
   if(image.width!==size||image.height!==size)throw Error('COAST_ASSET_DIMENSIONS:'+name);
   const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);
   const pixels=ctx.getImageData(0,0,size,size).data;if(name==='wetSand')for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)throw Error('COAST_WET_SAND_MUST_BE_OPAQUE');
   extra[name]={width:size,height:size,data:pixels};
  }
  const im=await source(atlasURL),c=document.createElement('canvas');c.width=im.width;c.height=im.height;
  const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);
  return createCoastalComposer({atlas:{width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data},rules:rules.rules,materials:tiles,materialAt:coastalMaterialAt,...extra});
 })());
 const image=composer.render(e.rect),canvas=document.createElement('canvas');canvas.width=e.rect.w;canvas.height=e.rect.h;
 canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image),canvas.width,canvas.height),0,0);
 const t=await Assets.load<Texture>(canvas.toDataURL('image/png'));t.source.scaleMode='nearest';textures.set(key(e),t);
}
