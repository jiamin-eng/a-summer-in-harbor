import slots from './woodrail-native/slots.json';
import matrices from './woodrail-native/matrices.json';
import groundURL from './woodrail-native/ground-atlas.png';
import raisedURL from './woodrail-native/raised-atlas.png';
import shadowURL from './woodrail-native/shadow-atlas.png';
import {Assets,type Texture} from 'pixi.js';
const query=typeof location==='undefined'?new URLSearchParams():new URLSearchParams(location.search);
export const railEnabled=query.get('rail-native')==='1'||query.get('terrain-native')==='1';
const caseName=query.get('rail-case'),frames=slots.frames;
export type RailPiece={name:string;root:{x:number;y:number}};
export function railPieces(scene:string):RailPiece[]{
 if(!railEnabled||scene!=='harbor')return [];
 if(caseName){const c=matrices.cases.find(c=>c.name===caseName);if(!c)throw Error('Unknown rail QA case');return c.placements.map(p=>({name:p.name,root:{x:700+p.worldFoot[0],y:620+p.worldFoot[1]}}))}
 const pieces:RailPiece[]=[];
 for(const [side,x] of [['W',746],['E',864]] as const){
  for(let y=600;y<=880;y+=40){const name=y===600?(side==='W'?'cap-N--W':'cap-N'):y===880?(side==='W'?'cap-S--W':'cap-S'):side;pieces.push({name,root:{x,y}})}
  for(let y=600;y<=880;y+=80)pieces.push({name:'post-'+side,root:{x,y}});
 }
 return pieces;
}
const frame=(name:string)=>{const f=frames.find(f=>f.name===name);if(!f)throw Error('Missing approved rail frame');return f};
export const railSheets=railEnabled?frames.map(f=>({id:'harbor-native-rail-'+f.name,image:'harbor-native-rail-raised-atlas',width:220,height:350,framesWidth:5,framesHeight:5,textures:{stand:{animations:()=>[[{frameX:f.sourceRect.x/44,frameY:f.sourceRect.y/70,time:0,anchor:[f.bodyFootRoot[0]/44,f.bodyFootRoot[1]/70],scale:[1,1],y:1}]]}}})):[];
export function railEvents(scene:string){return railPieces(scene).map((p,i)=>({id:'harbor-native-raised-'+i,x:p.root.x,y:p.root.y-1,event:{onInit(this:any){this.setHitbox(1,1);this.through=true;this.animationFixed=true;this.setGraphic('harbor-native-rail-'+p.name);this.animationName.set('stand');this.syncChanges()}}}))}
let floor:Texture|undefined,extent:{x:number;y:number;w:number;h:number}|undefined;
export const railDiagnostics:{caseName:string|null;pieces:RailPiece[];shadowMaxAlpha:number;shadowSamples:number;unionMaxSamples:number;extent?:typeof extent}={caseName,pieces:[],shadowMaxAlpha:0,shadowSamples:0,unionMaxSamples:0};
export async function prepareRail(scene:string){
 const pieces=railPieces(scene);if(!pieces.length||floor)return;
 Assets.add({alias:'harbor-native-rail-raised-atlas',src:raisedURL});const raised=await Assets.load<Texture>('harbor-native-rail-raised-atlas');raised.source.scaleMode='nearest';
 const source=async(url:string)=>{const i=new Image();i.src=url;await i.decode();return i};
 const [ground,shadow]=await Promise.all([source(groundURL),source(shadowURL)]);
 const left=Math.min(...pieces.map(p=>p.root.x-20)),top=Math.min(...pieces.map(p=>p.root.y-46)),right=Math.max(...pieces.map(p=>p.root.x+24)),bottom=Math.max(...pieces.map(p=>p.root.y+24));extent={x:left,y:top,w:right-left,h:bottom-top};
 const c=document.createElement('canvas');c.width=extent.w;c.height=extent.h;const ctx=c.getContext('2d')!;ctx.imageSmoothingEnabled=false;
 const sc=document.createElement('canvas');sc.width=220;sc.height=350;const sx=sc.getContext('2d')!;sx.drawImage(shadow,0,0);const sp=sx.getImageData(0,0,220,350).data,pixels=ctx.createImageData(c.width,c.height),coverage=new Uint16Array(c.width*c.height);
 for(const p of pieces){const f=frame(p.name),r=f.sourceRect,dx=p.root.x-20-left,dy=p.root.y-46-top;
  for(let y=0;y<70;y++)for(let x=0;x<44;x++){const si=((r.y+y)*220+r.x+x)*4,di=((dy+y)*c.width+dx+x)*4,a=sp[si+3];if(!a)continue;coverage[di/4]++;if(a>pixels.data[di+3]){pixels.data[di]=sp[si];pixels.data[di+1]=sp[si+1];pixels.data[di+2]=sp[si+2];pixels.data[di+3]=a}}
 }
 ctx.putImageData(pixels,0,0);
 railDiagnostics.shadowMaxAlpha=Math.max(...pixels.data.filter((_,i)=>i%4===3));railDiagnostics.shadowSamples=coverage.filter(v=>v>0).length;railDiagnostics.unionMaxSamples=coverage.filter(v=>v>1).length;
 for(const p of pieces){const r=frame(p.name).sourceRect;ctx.drawImage(ground,r.x,r.y,r.w,r.h,p.root.x-20-left,p.root.y-46-top,r.w,r.h)}
 floor=await Assets.load<Texture>(c.toDataURL('image/png'));floor.source.scaleMode='nearest';railDiagnostics.pieces=pieces;railDiagnostics.extent=extent;
 if(query.has('debug'))Object.assign(window,{harborRailQA:railDiagnostics});
}
export const railFloorLayers=(scene:string)=>railPieces(scene).length&&floor&&extent?[{texture:floor,at:extent,clip:extent}]:[];
