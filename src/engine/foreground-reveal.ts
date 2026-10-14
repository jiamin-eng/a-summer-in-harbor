import {Sprite,Texture,type Container} from 'pixi.js';
type Point={x:number;y:number};
export type ForegroundRevealConfig={textureForScene:(id:string)=>string;size:{w:number;h:number};originForScene?:(id:string)=>{x:number;y:number;width:number;height:number;worldWidth?:number;worldHeight?:number};center:Point;radius:number;opacity:number;active:(position:Point,id:string)=>boolean};

const maskTextures=new Map<string,Texture>();
function maskTexture(config:ForegroundRevealConfig,extent:number){
 const key=[config.size.w,config.size.h,config.radius,config.opacity].join(':');
 const cached=maskTextures.get(key);if(cached&&!cached.destroyed)return cached;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 const ctx=canvas.getContext('2d')!,r=config.radius*512/extent;
 const gradient=ctx.createRadialGradient(256,256,0,256,256,r);
 gradient.addColorStop(0,`rgba(255,255,255,${config.opacity})`);gradient.addColorStop(.58,`rgba(255,255,255,${config.opacity})`);gradient.addColorStop(1,'white');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
 const texture=Texture.from(canvas);maskTextures.set(key,texture);return texture;
}

/** Cached alpha mask: soft circular cutaway, no per-frame texture regeneration. */
export function createForegroundReveal(config:ForegroundRevealConfig){
 const extent=2*Math.max(config.size.w,config.size.h),texture=maskTexture(config,extent);
 let scene='',nextScan=0,entries:{wall:Sprite;mask:Sprite}[]=[];
 const clear=()=>{for(const {wall,mask} of entries){if(!wall.destroyed)wall.mask=null;if(!mask.destroyed)mask.destroy()}entries=[]};
 return (stage:Container|undefined,id:string,position:Point)=>{
  if(scene!==id){clear();scene=id;nextScan=0}
  const near=config.active(position,id);
  if(!near){for(const {wall,mask} of entries){if(!wall.destroyed)wall.mask=null;mask.visible=false}return}
  if(stage&&!entries.length&&performance.now()>=nextScan){
   nextScan=performance.now()+500;
   const visit=(node:Container)=>{const wall=node as Sprite,label=wall.texture?.source?.label;
    if(typeof label==='string'&&label.includes(config.textureForScene(id))&&wall.parent){
     const mask=new Sprite({texture});mask.label='local-reveal-mask';mask.anchor.set(.5);wall.parent.addChild(mask);entries.push({wall,mask});return;
    }
    for(const child of [...(node.children??[])])visit(child);
   };visit(stage);
  }
  if(!entries.length)return;
  const origin=config.originForScene?.(id)??{x:0,y:0,width:config.size.w,height:config.size.h};
  for(const {wall,mask} of entries){
   if(wall.destroyed)continue;
   const sx=origin.width/(origin.worldWidth??origin.width),sy=origin.height/(origin.worldHeight??origin.height);
   mask.visible=true;mask.scale.set(extent/512*wall.scale.x*sx,extent/512*wall.scale.y*sy);
   mask.position.set(wall.x+((position.x-origin.x+config.center.x)*sx-wall.anchor.x*origin.width)*wall.scale.x,wall.y+((position.y-origin.y+config.center.y)*sy-wall.anchor.y*origin.height)*wall.scale.y);
   if(wall.mask!==mask)wall.setMask({mask,inverse:false});
  }
 };
}
