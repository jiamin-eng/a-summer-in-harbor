import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {rooms} from '../world/data';
import {propId} from '../world/sheets';
import type {SpaceOptions} from './rpg-space';
/** Native draw handles for through-only visual markers. World collision remains
 * authoritative; NPCs, animals, portals and dynamic life actors stay in RPGJS. */
export function createStaticMapSprites(options:SpaceOptions,enabled:boolean){
 const ids=new Set(Object.values(rooms).flatMap(r=>r.props.filter(p=>!p.floorDecoration).map(p=>propId(r.id,p))));
 const sheets=new Map(options.spritesheets.map(s=>[s.id,s]));const definitions=new Map<string,any[]>();
 let active='',roots:Container[]=[],parent:Container|undefined;const frames=new Map<string,Texture>();
 const qualifies=(id:string)=>ids.has(id.split('--').at(-1)!)||id.startsWith('harbor-boundary-')||id.startsWith('harbor-native-raised-');
 const mapEvents=(scene:string)=>{const all=options.mapEvents(scene);if(!enabled)return all;definitions.set(scene,all.filter(e=>qualifies(e.id)));return all.filter(e=>!qualifies(e.id))};
 const destroy=()=>{for(const root of roots)root.destroy({children:true});roots=[];parent=undefined;active=''};
 const diagnostics={staticDraws:0,removedReactiveMarkers:0,frames:[] as any[]};
 async function prepare(scene:string){if(!enabled||scene===active)return;destroy();active=scene;const defs=definitions.get(scene)??[];diagnostics.frames=[];
 for(const e of defs){const root=new Container();root.label='harbor-native-static:'+e.id;root.position.set(e.x,e.y);let graphic:string[]=[],animation='stand',direction='down',height=1,ready=false;
 const draw=()=>{if(!ready||root.destroyed)return;for(const child of [...root.children])child.destroy();root.removeChildren();for(const id of graphic){const s=sheets.get(id);if(!s)throw Error('STATIC_SHEET_MISSING:'+id);const texture=Assets.get<Texture>(s.image);if(!texture)throw Error('STATIC_SOURCE_NOT_PREPARED:'+s.image);const f=s.textures[animation]?.animations({direction})?.[0]?.[0];if(!f)throw Error('STATIC_FRAME_MISSING:'+id);const fw=s.width/s.framesWidth,fh=s.height/s.framesHeight,frame=new Rectangle(f.frameX*fw,f.frameY*fh,fw,fh),cacheKey=id+':'+f.frameX+':'+f.frameY,cut=frames.get(cacheKey)??new Texture({source:texture.source,frame});frames.set(cacheKey,cut);const sprite=new Sprite(cut);sprite.anchor.set(f.anchor?.[0]??0,f.anchor?.[1]??0);sprite.scale.set(f.scale?.[0]??1,f.scale?.[1]??1);sprite.position.set(f.x??0,f.y??0);root.addChild(sprite)}root.visible=graphic.length>0;root.zIndex=root.y+height;diagnostics.frames.push({id:e.id,x:root.x,y:root.y,z:root.zIndex,graphics:[...graphic]})};
 const signal=(read:()=>any,set:(v:any)=>void)=>Object.assign(read,{set});
 const handle:any={id:e.id,through:true,animationFixed:true,x:()=>root.x,y:()=>root.y,graphics:signal(()=>graphic,(g:string[])=>{graphic=g;draw()}),animationName:signal(()=>animation,(n:string)=>{if(animation===n)return;animation=n;draw()}),direction:signal(()=>direction,(d:string)=>{if(direction===d)return;direction=d;draw()}),setHitbox(_w:number,h:number){height=h;root.zIndex=root.y+h},setGraphic(g:string|string[]){const next=Array.isArray(g)?g:[g];if(JSON.stringify(next)===JSON.stringify(graphic))return;graphic=next;draw()},teleport(p:{x:number;y:number}){root.position.set(p.x,p.y);root.zIndex=root.y+height;return Promise.resolve()},syncChanges(){},setOpacity(a:number){root.alpha=a}};
 await e.event.onInit.call(handle);for(const id of graphic){const s=sheets.get(id);if(!s)throw Error('STATIC_SHEET_MISSING:'+id);await Assets.load(s.image)}ready=true;draw();roots.push(root);
 }
 diagnostics.staticDraws=roots.length;diagnostics.removedReactiveMarkers=defs.length;if(new URLSearchParams(location.search).has('debug'))Object.assign(window,{harborStaticSpritesQA:diagnostics});
 }
 function mount(client:any){if(!enabled||!roots.length)return;const player=client?.getCurrentPlayer?.();if(!player)return;let found:Container|undefined;const visit=(n:any)=>{if(n?.x===player.x()&&n?.y===player.y()&&n?.zIndex===player.y()+options.world.actor.h)found=n.parent;for(const child of n?.children??[])if(!child.label?.startsWith('harbor-native-static:'))visit(child)};visit(client.canvasApp?.stage);if(!found)return;if(parent!==found){parent=found;for(const [i,root] of roots.entries())found.addChildAt(root,i)}found.sortChildren()}
 return{mapEvents,prepare,mount,destroy,dispose(){destroy();for(const cut of frames.values())cut.destroy(false);frames.clear()}};
}
