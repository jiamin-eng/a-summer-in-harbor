import {techNomadAdmitted} from './tech-nomads';
import {cropArt,soilTextureId} from './crop-art';
import mapDimensions from './map-dimensions.json';
import type {Direction} from '@rpgjs/common';import dimensions from './art-dimensions.json';import {rooms,people,type Prop} from './data';
const row=(d:Direction)=>({down:0,left:1,right:2,up:3}[d]??0);
export const heroSheet={id:'harbor-hero',image:'./art/hero.png',width:384,height:512,framesWidth:3,framesHeight:4,textures:Object.fromEntries([['stand',1],['stride-0',0],['stride-1',1],['stride-2',2]].map(([name,col])=>[name,{animations:({direction}:{direction:Direction})=>[[{frameX:col,frameY:row(direction),time:0,anchor:[.5,122/128],scale:[56/108,56/108],x:8,y:12}]]}]))};
const still=(anchor:number[],scale:number,y=0)=>({animations:()=>[[{frameX:0,frameY:0,time:0,anchor,scale:[scale,scale],x:0,y}]]});
const graphic=(id:string,image:string,width:number,height:number,anchor:number[],scale:number,y=0)=>({id,image,width,height,framesWidth:1,framesHeight:1,textures:{stand:still(anchor,scale,y)}});
export const propId=(r:string,p:Prop)=>`prop-${r}-${p.id}`;
export const sheets:any[]=Object.values(rooms).flatMap(r=>[
 ...['base','north','side','front'].flatMap(layer=>{const d=mapDimensions[(r.id+'-'+layer) as keyof typeof mapDimensions];return d.empty?[]:[graphic(`${layer}-${r.id}`,`./map/${r.id}-${layer}.png`,d.width,d.height,[0,layer==='front'?1:0],1)]}),
 ...r.props.filter(p=>!p.floorDecoration).flatMap(p=>[p.art,...(p.state?[p.state.art]:[])].map((art,index)=>{const d=dimensions[art as keyof typeof dimensions];return graphic(propId(r.id,p)+(index?'-active':''),`./art/${art}.png`,d.width,d.height,[.5,1],p.width/d.width)}))]);

const npcRow=(id:string,d:Direction)=>id==='gabriel'?({down:0,up:1,left:2,right:3}[d]??0):row(d);
const npcTexture=(id:string,col:number)=>({animations:({direction}:{direction:Direction})=>[[{frameX:col,frameY:npcRow(id,direction),time:0,anchor:[.5,122/128],scale:[56/108,56/108],x:0,y:0}]]});
export const npcSheets=Object.keys(people).filter(techNomadAdmitted).map(id=>({...heroSheet,id:'npc-'+id,image:`./art/npc-${people[id].mapArt??people[id].art}.png`,textures:Object.fromEntries([['stand',1],['stride-0',0],['stride-1',1],['stride-2',2]].map(([name,col])=>[name,npcTexture(id,Number(col))]))}));
sheets.push(...npcSheets);

// Three platform-generated growth stages, one shared image/world scale and root anchor.
const growth=rooms.garden.props.find(p=>p.id==='growing-fern')!;
for(const stage of ['young','unfurling','grown'] as const)sheets.push(graphic('prop-garden-growing-fern-'+stage,'./art/fern-'+stage+'.png',256,256,[.5,1],growth.width/256));

for(const a of cropArt.filter(a=>a.stage!=='harvest'))sheets.push(graphic('prop-garden-'+a.key,a.image,256,256,a.anchor.map(n=>n/256),a.scale));

sheets.push(graphic('prop-garden-crop-soil',soilTextureId,64,32,[.5,1],.75,24));
