import {createStaticMapSprites} from './static-map-sprites';
import {createSpriteLifecycle} from './sprite-lifecycle';
import {createSceneResourceCache} from './scene-resource-cache';
import {instanceClientModules} from './module-instance';
import {explorationCamera,type CameraInsets} from './exploration-camera';
import {TilingSprite,Sprite,Graphics,Container as FloorContainer,Texture,Rectangle} from 'pixi.js';
import {createForegroundReveal} from './foreground-reveal';
import {candidateEnabled} from '../candidate/continuity';
import {adaptContinuousSpace} from '../candidate/render-adapter';
import type {Viewport} from 'pixi-viewport';
import type {Container} from 'pixi.js';
import {Direction} from '@rpgjs/common';
import {startGame,provideClientGlobalConfig,provideClientModules,provideRpg,type RpgClientEngine} from '@rpgjs/client';
import {createServer,provideServerModules,type RpgPlayer} from '@rpgjs/server';
import {provideTiledMap as tiledClient} from '@rpgjs/tiledmap/client';
import {provideTiledMap as tiledServer} from '@rpgjs/tiledmap/server';
import {advanceRoute,moveWithCollision} from './distance-motion';
import {createElapsedMotion} from './elapsed-motion';
import {findPath,walkable,type Point,type World} from './world';

export type Space={
 dispose?:()=>void;
 suspendPrediction?:(blocked:boolean)=>void;
 sampleMovement?:()=>void;movementPending?:()=>boolean;
 projectEventGraphic?:(id:string,graphic:string[])=>void;
 installSpritesheets:(sheets:any[])=>void;
 position:()=>Point;scene:()=>string;renderedScene:()=>string|null;
 move:(x:number,y:number)=>void;walkTo:(target:Point,arrive?:()=>void)=>boolean;
 pause:(value:boolean)=>void;restore:(scene:string,position:Point)=>Promise<void>;
 project:(point:Point)=>Point;toWorld:(point:Point)=>Point;face:(target:Point)=>void;
};
export type SpaceOptions={
 world:World;host:HTMLElement;scene:string;position:Point;speed:number;stride:number;
 sheet:any;spritesheets:any[];mapEvents:(scene:string)=>any[];
 eventGraphics?:(scene:string,eventId:string)=>string[]|undefined;
 arrivalWalkable?:(point:Point,scene:string)=>boolean;
 collisionWorld?:()=>World;
 walkable?:(point:Point,scene:string)=>boolean;findPath?:(from:Point,to:Point,scene:string)=>Point[];
 prepareScene?:(scene:string)=>Promise<void>;
 controlsBlocked:()=>boolean;worldPaused?:()=>boolean;onPosition:(point:Point)=>void;onDestination:(point:Point|null)=>void;
 onFrame?:(dt:number,position:Point,scene:string,paused:boolean)=>void;
 onMotionPoint?:(point:Point)=>void;
 cameraBounds?:(scene:string)=>{x:number;y:number;w:number;h:number};
 cameraWalkBounds?:(scene:string)=>{x:number;y:number;w:number;h:number};
 cameraSafeArea?:()=>CameraInsets;cameraBackdrop?:(scene:string)=>Texture;
 floorLayers?:(scene:string)=>{texture:Texture;at:Point;clip:{x:number;y:number;w:number;h:number};crop?:{x:number;y:number;w:number;h:number};polygon?:Point[];repeat?:{w:number;h:number;tileW:number;tileH:number};nativeTerrain?:boolean}[];
 foregroundReveal?:Parameters<typeof createForegroundReveal>[0][];
 onReady:(space:Space)=>void;onError:(error:unknown)=>void;
};

export function createRpgSpace(options:SpaceOptions){
 return candidateEnabled()?adaptContinuousSpace(options,createRawRpgSpace):createRawRpgSpace(options);
}
function createRawRpgSpace(options:SpaceOptions){
 if(options.host.id!=='rpg')throw new Error('RPG_MOUNT_ID_REQUIRED');
 const {world,host}=options,ids=Object.keys(world.scenes);
 const reveals=(options.foregroundReveal??[]).map(createForegroundReveal);
 const debug=new URLSearchParams(location.search).has('debug');
 let scene=options.scene,pos={...options.position},client:RpgClientEngine|undefined,player:RpgPlayer|undefined;
 let disposed=false,frame=0;
 let loaded:string|null=null,joined:string|null=null,paused=true,changing=false,last=0,stride=0,stick={x:0,y:0},route:Point[]=[];
 let arrive:(()=>void)|undefined,engineWidth=360,engineHeight=520,scale=1,leftInset=0,predictionBlocked=false;
 const checks=new Set<()=>void>(),keys=new Set<string>();
 const input=()=>predictionBlocked?{x:0,y:0,route:[] as Point[]}:{x:stick.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),y:stick.y+Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup')),route};
 const elapsed=createElapsedMotion(performance.now(),input()),changedInput=()=>elapsed.input(performance.now(),input());
 const wait=(id:string)=>new Promise<void>((resolve,reject)=>{const check=()=>{if(loaded===id&&joined===id){clearTimeout(timer);checks.delete(check);resolve()}};const timer=setTimeout(()=>{checks.delete(check);reject(new Error('MAP_LOAD_TIMEOUT'))},12000);checks.add(check);check()});
 const cancel=()=>{route=[];arrive=undefined;options.onDestination(null)};
 const projectPlayer=()=>{const sprite=client?.getCurrentPlayer();if(!sprite||!player)return;
  // This local actor is already projected from Harbor's swept elapsed motion.
  // RPGJS also queues one interpolation frame per teleport (including network
  // sampling), but consumes only one per renderer tick. Do not replay that
  // second presentation queue over the current local pose. NPC queues and the
  // complete authoritative motion trace remain untouched.
  if(candidateEnabled())sprite.frames.length=0;
  sprite.animationFixed=true;if(sprite.x()!==pos.x)sprite.x.set(pos.x);if(sprite.y()!==pos.y)sprite.y.set(pos.y);if(sprite.direction()!==player.direction())sprite.direction.set(player.direction());if(sprite.animationName()!==player.animationName())sprite.animationName.set(player.animationName())};
 const stand=()=>{stride=0;if(player&&player.animationName()!=='stand')player.animationName.set('stand');projectPlayer()};
 const stage=()=>(client as unknown as {canvasApp?:{stage:Container}})?.canvasApp?.stage;
 const viewport=():Viewport|undefined=>{const visit=(node:Container|undefined):Viewport|undefined=>{if(!node)return;if('toWorld' in node&&'clamp' in node)return node as Viewport;for(const child of node.children??[]){const found=visit(child);if(found)return found}};return visit(stage())};
 let cameraSignature='',backdrop:TilingSprite|undefined;
 const floorResources=createSceneResourceCache(scene=>{
  const layers=options.floorLayers?.(scene)??[],cuts:Texture[]=[],container=new FloorContainer();
  container.label='harbor-continuous-floors';container.zIndex=-999999;
  const nativeGroups=new Map<string,FloorContainer>();
  for(const layer of layers){
   const texture=layer.crop?new Texture({source:layer.texture.source,frame:new Rectangle(layer.crop.x,layer.crop.y,layer.crop.w,layer.crop.h)}):layer.texture;if(layer.crop)cuts.push(texture);
   if(layer.nativeTerrain&&layer.repeat){
    const sprite=new TilingSprite({texture,width:layer.clip.w,height:layer.clip.h});sprite.label='harbor-native-terrain';sprite.position.set(layer.clip.x,layer.clip.y);sprite.tileScale.set(layer.repeat.tileW/texture.width,layer.repeat.tileH/texture.height);sprite.tilePosition.set(layer.at.x-layer.clip.x,layer.at.y-layer.clip.y);
    if(layer.polygon){const key=JSON.stringify(layer.polygon);let group=nativeGroups.get(key);if(!group){group=new FloorContainer();const mask=new Graphics().poly(layer.polygon.flatMap(p=>[p.x,p.y])).fill(0xffffff);group.mask=mask;container.addChild(group,mask);nativeGroups.set(key,group)}group.addChild(sprite)}else container.addChild(sprite);
    continue;
   }
   const sprite=new Sprite(texture),mask=new Graphics();if(layer.polygon)mask.poly(layer.polygon.flatMap(p=>[p.x,p.y]));else mask.rect(layer.clip.x,layer.clip.y,layer.clip.w,layer.clip.h);mask.fill(0xffffff);sprite.position.set(layer.at.x,layer.at.y);sprite.mask=mask;container.addChild(sprite,mask);
  }
  return{container,cuts,reusable:layers.some(layer=>layer.nativeTerrain)};
 },entry=>{entry.container.parent?.removeChild(entry.container)},entry=>{if(!entry.container.destroyed)entry.container.destroy({children:true,context:true});for(const cut of entry.cuts)if(!cut.destroyed)cut.destroy(false)},entry=>!entry.container.destroyed);
 const configureCamera=()=>{
  if(changing)return;
  const view=viewport();if(!view)return;
  // Pausing plugins alone does not disable RPGJS character.ce's reactive
  // instant-follow callback, which calls moveCenter again when x/y change.
  // A reserved non-actor target releases that default owner. Map transfers
  // reset the target, so reclaim it before every safe-area camera solve.
  if(client?.cameraFollowTargetId()!=='harbor-safe-area-camera')client?.setCameraFollow('harbor-safe-area-camera',false);
  const visual=options.cameraBounds?.(scene)??{x:0,y:0,w:world.width,h:world.height};
  const walk=options.cameraWalkBounds?.(scene)??world.scenes[scene].interior;
  const safe=options.cameraSafeArea?.()??{left:0,top:0,right:0,bottom:0};
  const size={x:engineWidth/view.scale.x,y:engineHeight/view.scale.y};
  const camera=explorationCamera(visual,walk,size,safe,scale*view.scale.x),b=camera.bounds;
  const signature=[scene,engineWidth,engineHeight,view.scale.x,...Object.values(safe),...Object.values(visual),...Object.values(walk)].join(':');
  if(signature!==cameraSignature){
   view.resize(engineWidth,engineHeight,world.width,world.height);
   view.clamp({left:b.x,top:b.y,right:b.x+b.w,bottom:b.y+b.h,underflow:'none'});
   const texture=options.cameraBackdrop?.(scene);
   if(texture){
    if(!backdrop||backdrop.destroyed||backdrop.parent!==view){backdrop?.destroy();backdrop=new TilingSprite({texture,width:b.w,height:b.h});backdrop.label='exploration-overscan';backdrop.zIndex=-1000000;view.addChild(backdrop)}
    backdrop.texture=texture;backdrop.position.set(b.x,b.y);backdrop.width=b.w;backdrop.height=b.h;
    // Match the authored floor assembler's 160-world-unit tile and world phase.
    backdrop.tileScale.set(160/texture.width,160/texture.height);backdrop.tilePosition.set(-b.x,-b.y);
   }
   cameraSignature=signature;
  }
  // Reuse cached source textures with masks, never a giant new coastal bitmap.
  const floors=floorResources.enter(scene).container;if(floors.parent!==view){floors.parent?.removeChild(floors);view.addChild(floors)}
  // One camera owner: default RPGJS follow/initial animation must not recenter
  // after our safe-area solve. Immediate following has no lag at a world edge.
  view.plugins.pause('follow');view.plugins.pause('animate');
  const center={x:pos.x+world.actor.w/2+size.x/2-camera.anchor.x,y:pos.y+world.actor.h+size.y/2-camera.anchor.y};
  view.moveCenter(Math.max(b.x+size.x/2,Math.min(b.x+b.w-size.x/2,center.x)),Math.max(b.y+size.y/2,Math.min(b.y+b.h-size.y/2,center.y)));
 };
 const screen=(point:Point)=>{const q=viewport()?.toScreen(point.x,point.y)??point;return {x:leftInset+q.x*scale,y:q.y*scale}};
 const unproject=(point:Point)=>{const q={x:(point.x-leftInset)/scale,y:point.y/scale};const p=viewport()?.toWorld(q.x,q.y)??q;return {x:p.x,y:p.y}};
 const resize=()=>{
  const box=host.parentElement!,width=box.clientWidth,height=box.clientHeight;
  engineHeight=Math.max(220,height/1.3); // Keep actor scale stable when HUD frees more vertical space.
  engineWidth=width/Math.max(1,height)*engineHeight;
  scale=height/engineHeight;leftInset=(width-engineWidth*scale)/2;
  host.style.width=`${engineWidth}px`;host.style.height=`${engineHeight}px`;host.style.left='50%';host.style.top='0';host.style.transformOrigin='top center';host.style.transform=`translateX(-50%) scale(${scale})`;
  const resolution=Math.min(3,Math.max(1,Math.ceil(scale*(devicePixelRatio||1)*4)/4));
  if(client?.renderer){client.renderer.resize(engineWidth,engineHeight,resolution);client.width.set(String(engineWidth));client.height.set(String(engineHeight));configureCamera()}
 };
 // The embedded RPGJS sync/physics tick may apply an older local ACK after
 // Harbor's rAF projection. Commit the same swept pose and camera together at
 // the public Pixi paint boundary; this performs no motion or time settlement.
 const spriteLifecycle=createSpriteLifecycle(new URLSearchParams(location.search).get('terrain-native')==='1');
 const staticSprites=createStaticMapSprites(options,new URLSearchParams(location.search).get('terrain-native')==='1');
 const prepareVisualScene=async(id:string)=>{await options.prepareScene?.(id);await staticSprites.prepare(id)};
 const presentation={prerender:()=>{if(!disposed&&candidateEnabled()){projectPlayer();configureCamera();staticSprites.mount(client)}}};
 const observer=new ResizeObserver(resize);observer.observe(host.parentElement!);resize();
 const runtime:Space={dispose:()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clearInput);document.removeEventListener('visibilitychange',visibility);checks.clear();spriteLifecycle.dispose();staticSprites.dispose();floorResources.dispose();backdrop?.destroy();backdrop=undefined;client?.renderer?.runners.prerender.remove(presentation);client?.clear();client=undefined;player=undefined},sampleMovement:()=>{if(candidateEnabled())advancePlayer(performance.now(),paused||changing||options.controlsBlocked()||document.hidden,0)},movementPending:()=>!!(stick.x||stick.y||keys.size||route.length),suspendPrediction:value=>{predictionBlocked=value;changedInput()},projectEventGraphic:(id,graphic)=>{const e=(client as any)?.sceneMap?.events?.()[id];if(e&&JSON.stringify(e.graphics())!==JSON.stringify(graphic))e.graphics.set([...graphic])},installSpritesheets:sheets=>{if(!client)throw Error("RENDERER_NOT_READY");for(const sheet of sheets)client.addSpriteSheet(sheet)},position:()=>({...pos}),scene:()=>scene,renderedScene:()=>loaded,
  move:(x,y)=>{stick={x,y};if(x||y)cancel();changedInput()},
  walkTo:(target,callback)=>{if(paused||changing)return false;const next=options.findPath?.(pos,target,scene)??findPath(world,scene,pos,target);if(!next.length)return false;route=next;arrive=callback;options.onDestination(target);changedInput();return true},
  pause:value=>{paused=value;stick={x:0,y:0};keys.clear();if(value){cancel();stand()}elapsed.reset(performance.now(),input())},
  restore:async(next,p)=>{if(!(options.arrivalWalkable?.(p,next)??walkable(world,next,p)))throw new Error('INVALID_ARRIVAL');changing=true;cancel();stick={x:0,y:0};stand();try{if(next!==scene){await prepareVisualScene(next);floorResources.leave();loaded=null;joined=null;const changed=await player!.changeMap(next,p);if(!changed)throw new Error('MAP_CHANGE_REJECTED');await wait(next);spriteLifecycle.prune(client)}else await player!.teleport(p);scene=next;pos={...p};changing=false;cameraSignature='';configureCamera();player!.syncChanges();projectPlayer();options.onPosition(pos)}finally{changing=false;elapsed.reset(performance.now(),input())}},
  project:screen,toWorld:unproject,
  face:target=>{if(!player)return;const dx=target.x-pos.x,dy=target.y-pos.y;player.direction.set(Math.abs(dx)>Math.abs(dy)?(dx>0?Direction.Right:Direction.Left):(dy>0?Direction.Down:Direction.Up));stand();player.syncChanges()},
 };
 const down=(event:KeyboardEvent)=>{if(paused||changing||(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement))return;const key=event.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){if(options.controlsBlocked()&&!candidateEnabled())return;event.preventDefault();if(!keys.has(key)){keys.add(key);cancel();changedInput()}}};
 const up=(event:KeyboardEvent)=>{if(keys.delete(event.key.toLowerCase()))changedInput()};
 const clearInput=()=>{keys.clear();stick={x:0,y:0};cancel();stand();elapsed.reset(performance.now(),input())};
 const visibility=()=>document.hidden&&clearInput();
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',visibility);
 // Each authored map is a bounded cached scene. Large visual layer events have
 // an origin far from the player; point-based MMORPG chunk streaming would
 // remove their entire floor texture even while that texture fills the screen.
 const server=createServer({providers:[tiledServer({basePath:'./map',streaming:false}),provideServerModules([{player:{
  onJoinMap(instance,map){if(disposed)return;player=instance;instance.setGraphic(options.sheet.id);instance.setHitbox(world.actor.w,world.actor.h);instance.animationFixed=true;instance.animationName.set('stand');joined=map.id.replace(/^map-/,'');checks.forEach(fn=>fn())},
  async onConnected(instance){if(disposed)return;player=instance;try{instance.setGraphic(options.sheet.id);instance.setHitbox(world.actor.w,world.actor.h);instance.animationFixed=true;instance.animationName.set('stand');await prepareVisualScene(scene);await instance.changeMap(scene,pos);void wait(scene).then(()=>{if(disposed)return;projectPlayer();options.onReady(runtime)}).catch(error=>{if(!disposed)options.onError(error)})}catch(error){if(!disposed)options.onError(error)}}
 },maps:ids.map(id=>({id,events:staticSprites.mapEvents(id)}))}]) ]});
 startGame({providers:[
  provideClientGlobalConfig({prediction:{enabled:false},bootstrapCanvasOptions:{antialias:false,backgroundAlpha:0,autoDensity:true,resolution:1}}),
  instanceClientModules(tiledClient({basePath:'./map'})),
  provideClientModules([{spritesheets:[options.sheet,...options.spritesheets],sprite:spriteLifecycle.hooks,sceneMap:{onAfterLoading(){cameraSignature='';loaded=client?.activeRoom()?.name?.replace(/^map-/,'')??null;checks.forEach(fn=>fn())}},engine:{onStart(engine){if(disposed){engine.clear();return}client=engine;if(debug)(host as HTMLElement&{__rpgClient?:RpgClientEngine}).__rpgClient=engine;engine.stopProcessingInput=true;engine.renderer.background.alpha=0;engine.renderer.runners.prerender.add(presentation);resize()}}}]),provideRpg(server)
 ]}).catch(error=>{if(!disposed)options.onError(error)});
 const advancePlayer=(time:number,blocked:boolean,dt:number)=>{
  if(player&&!blocked){
   const slices=candidateEnabled()?elapsed.consume(time):[{ms:dt*1000,input:input()}];
   for(const slice of slices){
   if(options.controlsBlocked())break;
   let {x,y}=slice.input;const activeRoute=slice.input.route;
   let distance=0,finished=false;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length}
   const clear=(point:Point)=>!options.controlsBlocked()&&(options.walkable?.(point,scene)??walkable(world,scene,point));
   if(!x&&!y&&activeRoute.length){const result=advanceRoute(pos,activeRoute,options.speed*slice.ms/1000,clear,options.onMotionPoint);pos=result.position;distance=result.distance;x=result.direction.x;y=result.direction.y;activeRoute.splice(0,result.consumed);finished=result.arrived&&activeRoute===route;if(result.blocked&&!options.controlsBlocked()){activeRoute.splice(0);cancel();changedInput()}}
   else if(x||y){const result=moveWithCollision(pos,{x:x*options.speed*slice.ms/1000,y:y*options.speed*slice.ms/1000},clear,options.onMotionPoint);x=result.position.x-pos.x;y=result.position.y-pos.y;pos=result.position;distance=result.distance}
   if(distance>1e-7){stride=(stride+distance)%options.stride;const phase=Math.floor(stride/options.stride*4);const pose=['stride-0','stride-1','stride-2','stride-1'][phase];if(player.animationName()!==pose)player.animationName.set(pose);player.direction.set(Math.abs(x)>Math.abs(y)?(x>0?Direction.Right:Direction.Left):(y>0?Direction.Down:Direction.Up));void player.teleport(pos);player.syncChanges();options.onPosition(pos)}else stand();
   if(finished){const callback=arrive;arrive=undefined;options.onDestination(null);stand();callback?.()}
   }
  }else elapsed.reset(time,input());
 };
 const tick=(time:number)=>{
  if(disposed)return;
  const dt=last?Math.min(Math.max(0,(time-last)/1000),.04):0;last=time;
  const worldPaused=paused||changing||(options.worldPaused?.()??options.controlsBlocked())||document.hidden;
  const blocked=worldPaused||options.controlsBlocked();
  advancePlayer(time,blocked,dt);
  configureCamera();staticSprites.mount(client);for(const reveal of reveals)reveal(stage(),scene,pos);
  options.onFrame?.(dt,{...pos},scene,worldPaused);projectPlayer();frame=requestAnimationFrame(tick);
  if(debug){host.dataset.projectedX=String(pos.x);host.dataset.projectedY=String(pos.y);host.dataset.predictionBlocked=String(blocked);host.dataset.worldPaused=String(worldPaused);const sprite=client?.getCurrentPlayer();host.dataset.playerGraphics=String(sprite?.graphics().length??-1);host.dataset.playerSheets=String(sprite?.graphicsSignals().length??-1);host.dataset.roomEvents=String(Object.keys((client?.activeRoom() as unknown as {events?:()=>Record<string,unknown>})?.events?.()??{}).length)}
 };
 frame=requestAnimationFrame(tick);
 return runtime;
}
