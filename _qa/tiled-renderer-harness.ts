import {motionProjection} from '../src/candidate/render-adapter';
import {Assets} from 'pixi.js';
import {createRpgSpace,type Space} from '../src/engine/rpg-space';
import {world,rooms} from '../src/world/data';
import {outdoorBuildingReveals} from '../src/world/outdoor-building-reveal';
import mapDimensions from '../src/world/map-dimensions.json';
import {heroSheet,sheets,propId} from '../src/world/sheets';
import {globalPoint,localPoint} from '../src/candidate/continuity';
import type {Point} from '../src/engine/world';
const w=window as any;let space:Space,busy=false,autoWalk:any;
const spots:Record<string,Point>={hill:{x:650,y:500},market:{x:1082,y:347},station:{x:400,y:395},harbor:{x:805,y:730},coast:{x:1100,y:560},beach:{x:740,y:151},path:{x:460,y:540}};
const selected=sheets.filter(s=>!s.id.startsWith('front-')&&!s.id.startsWith('npc-'));
const event=(id:string,x:number,y:number,graphic:string)=>({id,x,y,event:{onInit(this:any){this.setHitbox(1,1);this.through=true;this.animationFixed=true;this.setGraphic(graphic);this.animationName.set('stand');this.syncChanges()}}});
function status(){if(!space)return;const p=space.position();document.querySelector('#status')!.textContent=space.scene()+' '+Math.round(p.x)+','+Math.round(p.y)}
space=createRpgSpace({world,host:document.querySelector('#rpg')!,scene:'hill',position:spots.hill,speed:112,stride:48,sheet:heroSheet,spritesheets:selected,
 foregroundReveal:outdoorBuildingReveals(),
 mapEvents:id=>{const d=mapDimensions[(id+'-base') as keyof typeof mapDimensions];return [...(d.empty?[]:[event('base-'+id,d.x,d.y,'base-'+id)]),...rooms[id].props.filter(p=>!p.floorDecoration&&!p.visibleWhen).map(p=>event(propId(id,p),p.at.x,p.at.y+(p.depthOffset??0),propId(id,p)))];},
 prepareScene:async id=>{await Assets.load(heroSheet.image);await Promise.all(selected.filter(s=>s.id.endsWith('-'+id)||s.id.startsWith('prop-'+id+'-')).map(s=>Assets.load(s.image)))},
 controlsBlocked:()=>busy,onPosition:()=>status(),onDestination:target=>{if(autoWalk)autoWalk.destination=target},onFrame:(_dt,p,scene)=>{
  // This renderer-only harness has no authority. Consume the actual walked
  // trace locally so its 336px production prediction budget cannot stop a
  // 621px scene-route test. No position is assigned or teleported here.
  if(autoWalk){autoWalk.localAckedPoints+=motionProjection.points.length;const now=performance.now();if(!autoWalk.samples.length||now-autoWalk.samples.at(-1).at>150)autoWalk.samples.push({at:now,scene,position:{...p},queuedBeforeLocalAck:motionProjection.points.length})}
  motionProjection.traceStart=globalPoint(scene,p);motionProjection.points.length=0;status();
 },cameraBounds:id=>({x:0,y:0,w:1440,h:1088}),cameraSafeArea:()=>({left:0,right:0,top:0,bottom:0}),
 onReady:r=>{space=r;motionProjection.networkBlocked=false;motionProjection.block?.(false);r.pause(false);w.harborRendererHarness={space,restore:async(scene:string,p=spots[scene])=>{busy=true;try{await space.restore(scene,p)}finally{busy=false;status()}},snapshot:()=>{const client=(document.querySelector('#rpg') as any).__rpgClient,sources=new Map();let views=0,native=0;const scan=(n:any)=>{if(n.label==='harbor-native-terrain')native++;if(n.texture?.source){views++;const s=n.texture.source;sources.set(s.uid,{uid:s.uid,width:s.width,height:s.height,rgbaBytes:s.width*s.height*4})}for(const ch of n.children??[])scan(ch)};scan(client.canvasApp.stage);return{cache:w.harborTerrainCacheSnapshot(),nativeSprites:native,views,activeSources:[...sources.values()],scene:space.scene()}}};status()},onError:e=>{document.querySelector('#status')!.textContent=String(e);throw e}});
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-scene]'))b.onclick=()=>w.harborRendererHarness?.restore(b.dataset.scene!);
document.querySelector('#walk')!.addEventListener('click',()=>{const scene=space.scene(),start=space.position(),g=scene==='coast'||scene==='beach'||scene==='path'?globalPoint('path',{x:460,y:540}):scene==='harbor'?{x:797,y:611}:scene==='station'?{x:912,y:332}:{x:642,y:870};autoWalk={scene,start,targetGlobal:g,accepted:false,arrived:false,stop:null,localAckedPoints:0,samples:[],qaOnlyNoAuthority:true};w.harborRendererHarness.autoWalk=autoWalk;autoWalk.accepted=space.walkTo(localPoint(scene,g),()=>{autoWalk.arrived=true;autoWalk.stop={scene:space.scene(),position:space.position(),at:performance.now()}});status()});
const stick=document.querySelector<HTMLElement>('#stick')!;let pointer:number|undefined,origin={x:0,y:0};stick.onpointerdown=e=>{pointer=e.pointerId;origin={x:e.clientX,y:e.clientY};stick.setPointerCapture(pointer)};stick.onpointermove=e=>{if(e.pointerId===pointer)space.move((e.clientX-origin.x)/25,(e.clientY-origin.y)/25)};const stop=()=>{pointer=undefined;space.move(0,0)};stick.onpointerup=stop;stick.onpointercancel=stop;
