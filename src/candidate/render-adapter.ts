import {nativeTerrainEnabled,prepareNativeTerrain,nativeTerrainLayers} from '../world/tiled-native-render';
import {originalMapReplay,prepareOriginalMap,originalMapLayers} from '../world/original-map-replay';
import {railEnabled,railSheets,railEvents,prepareRail,railFloorLayers} from '../world/full-rail-render';
import approvedCurb from '../world/road-edge-native/stone-curb-v1-approved.png';
import {materialDemoPieces} from '../world/material-demo';
import nativeStone from '../world/road-edge-native/road-stone-atlas.png';
import nativeSoil from '../world/road-edge-native/road-soil-atlas.png';
import {strongGroundEdges as candidateGroundEdges} from '../world/strong-ground-edges';
import {strongGroundEdges as formalGroundEdges} from '../world/qa-formal-ground';
import {terrainContacts} from '../world/terrain-contacts';
import {prepareTerrainContact,terrainContactTexture} from '../world/terrain-contact-render';
import {sharedGroup} from './shared-admission';
import {boundaryPieces,boundaryArtWidths,boundaryAsset} from '../world/outdoor-boundaries';
import {prepareCropImage} from '../world/crop-art';
import type {Texture} from 'pixi.js';
import dimensions from '../world/art-dimensions.json';
import {Assets} from 'pixi.js';
import type {Space,SpaceOptions} from '../engine/rpg-space';
import type {Point} from '../engine/world';
import {walkable,findPath} from '../engine/world';
import {appendMotionTrace} from './motion-trace';
import {predictionHorizon,maximumQueuedPoints,traceLength} from './motion-outbox';
import {CLUSTER,COASTAL,zonesFor,clusters,clusterFor,clusterWorld,clusterWalkable,globalPoint,localPoint,renderScene,isCluster,pointZone,sameCluster,continuousPath,traceZone} from './continuity';
const boundaryTextures=new Map<string,Texture>();
const edgeTextures=new Map<string,Texture>();
const edgeKey=(p:ReturnType<typeof strongGroundEdges>[number])=>[p.material,p.rect.w,p.rect.h,p.phase,p.native,JSON.stringify(p.sourceRect),p.roadSide,p.seamOffset,JSON.stringify(p.cornerRoads)].join(':');
const edgeSources=new Map<string,Promise<HTMLImageElement>>();
function edgeSource(url:string){let task=edgeSources.get(url);if(!task){task=(async()=>{const image=new Image();image.src=url;await image.decode();return image})();edgeSources.set(url,task)}return task}
/** Enlarge whole old native fragments with nearest sampling; feather only the outer crop margin. */
async function prepareEdgePixels(p:ReturnType<typeof strongGroundEdges>[number]){
 const key=edgeKey(p);if(edgeTextures.has(key))return;
 const source=await edgeSource(p.native?(p.native==='stone'?nativeStone:nativeSoil):'./art/floor-'+p.material+'.png');
 const canvas=document.createElement('canvas');canvas.width=p.rect.w;canvas.height=p.rect.h;
 const context=canvas.getContext('2d')!;context.imageSmoothingEnabled=false;
 const ratio=source.naturalWidth/160,r=p.sourceRect??{x:(p.phase*181)%(source.naturalWidth-p.rect.w*ratio),y:(p.phase*137)%(source.naturalHeight-p.rect.h*ratio),w:p.rect.w*ratio,h:p.rect.h*ratio};
 context.drawImage(source,r.x,r.y,r.w,r.h,0,0,p.rect.w,p.rect.h);
 if(p.native){
  const pixels=context.getImageData(0,0,canvas.width,canvas.height),corner=p.phase>=5,vertical=p.phase===2||p.phase===4;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const margin=corner?Math.min(x,y,canvas.width-1-x,canvas.height-1-y):vertical?Math.min(x,canvas.width-1-x):Math.min(y,canvas.height-1-y);
   const gx=Math.floor((p.rect.x+x)/2),gy=Math.floor((p.rect.y+y)/2),noise=((gx*17+gy*31+(gx^gy)*13)>>>0)%16/16;
   const pixel=(y*canvas.width+x)*4;
   if(p.native==='stone'){
    // Preserve the authored floor. Add only native fragments crossing its material boundary,
    // plus a two-unit contact core; do not replace an entire 48-unit band with paving.
    const normal=vertical?x:y,road=p.cornerRoads?p.cornerRoads[(y>=canvas.height/2?2:0)+(x>=canvas.width/2?1:0)]:p.roadSide==='N'||p.roadSide==='W'?normal>=p.seamOffset!:normal<p.seamOffset!;
    const grass=pixels.data[pixel+1]-pixels.data[pixel]>=6&&pixels.data[pixel+1]-pixels.data[pixel+2]>=15;
    const core=p.cornerRoads?Math.min(Math.abs(x-canvas.width/2),Math.abs(y-canvas.height/2))<2:Math.abs(normal-p.seamOffset!)<2;
    if(grass!==road&&!core)pixels.data[pixel+3]=0;
   }
   if(margin<8&&noise>=margin/8)pixels.data[pixel+3]=0;
  }
  context.putImageData(pixels,0,0);
 }
 const texture=await Assets.load<Texture>(canvas.toDataURL('image/png'));texture.source.scaleMode='nearest';edgeTextures.set(key,texture);
}
const demoMode=typeof location==='undefined'?'':new URLSearchParams(location.search).get('material-demo')??'';
const strongGroundEdges=(id:string):ReturnType<typeof candidateGroundEdges>=>demoMode==='current'?formalGroundEdges(id):candidateGroundEdges(id);
const contactEdges=(id:string)=>demoMode==='current'?[]:terrainContacts(id);
const demoTextures=new Map<string,Texture>();
const demoKey=(p:ReturnType<typeof materialDemoPieces>[number])=>JSON.stringify(p);
async function prepareMaterialDemo(id:string){
 const pieces=materialDemoPieces(id,demoMode);if(!pieces.length)return;
 const [stone,wood,curb]=await Promise.all([edgeSource(nativeStone),edgeSource('./art/floor-wood.png'),edgeSource(approvedCurb)]);
 for(const p of pieces){const key=demoKey(p);if(demoTextures.has(key))continue;const c=document.createElement('canvas');c.width=p.rect.w;c.height=p.rect.h;const x=c.getContext('2d')!;x.imageSmoothingEnabled=false;
  if(p.kind==='stone'){
   if(demoMode==='B'){const i=p.side==='N'?1:p.side==='NW'?5:4,sx=i%5*40,sy=Math.floor(i/5)*40;if(p.side==='NW')x.drawImage(curb,sx,sy,40,40,0,0,40,40);else if(p.side==='N'){for(let a=0;a<c.width;a+=40){const n=Math.min(40,c.width-a);x.drawImage(curb,sx,sy,n,40,a,0,n,40)}}else{for(let a=0;a<c.height;a+=40){const n=Math.min(40,c.height-a);x.drawImage(curb,sx,sy,40,n,0,a,40,n)}}}
   const index=p.side==='N'?1:p.side==='NW'?5:4,sx=index%4*40,sy=Math.floor(index/4)*40,z=p.side==='N'?13:14;
   if(demoMode==='A'||demoMode==='C'){if(p.side==='NW')x.drawImage(stone,sx+8,sy+8,24,24,0,0,24,24);else if(p.side==='N'){for(let a=0;a<c.width;a+=40){const n=Math.min(40,c.width-a);x.drawImage(stone,sx,sy+z-12,n,24,a,0,n,24)}}else{for(let a=0;a<c.height;a+=40){const n=Math.min(40,c.height-a);x.drawImage(stone,sx+z-12,sy,24,n,0,a,24,n)}}}
   if(demoMode==='C'){
    if(p.side==='NW'){x.fillStyle='#53605e';x.fillRect(7,8,9,16);x.fillRect(8,8,16,9);x.fillStyle='#909c89';x.fillRect(9,8,5,16);x.fillRect(9,8,15,5);}if(p.side!=='NW'){const width=5,face=2,at=12-width/2;
    x.fillStyle='#53605e';if(p.side==='N')x.fillRect(0,at+width-face,c.width,face+2);else x.fillRect(at-face,0,face+2,c.height);
    x.fillStyle='#909c89';if(p.side==='N')x.fillRect(0,at,c.width,width-face);else x.fillRect(at,0,width-face,c.height);
    x.fillStyle='#788780';if(p.side==='N'){for(let a=0;a<c.width;a+=40)x.fillRect(a,at,1,width-face)}else{for(let a=0;a<c.height;a+=40)x.fillRect(at,a,width-face,1)}}
   }
  }else{
   const right=p.side==='E',root=right?4:36,outer=right?1:-1;
   for(let y=0;y<c.height;y+=160)x.drawImage(wood,0,0,wood.naturalWidth,wood.naturalHeight,0,y,160,160);
   const pixels=x.getImageData(0,0,c.width,c.height);for(let yy=0;yy<c.height;yy++)for(let xx=0;xx<c.width;xx++)if(Math.abs(xx-root)>4)pixels.data[(yy*c.width+xx)*4+3]=0;x.putImageData(pixels,0,0);
   if(demoMode!=='A'){
    x.strokeStyle=demoMode==='B'?'#bc9660':'#d1c19b';x.lineWidth=demoMode==='B'?3:2;
    const rail=root+outer*9;x.beginPath();x.moveTo(rail,0);if(demoMode==='C'){for(let y=0;y<c.height;y+=80){const end=Math.min(y+80,c.height);x.moveTo(rail,y);x.quadraticCurveTo(rail+outer*10,(y+end)/2,rail,end)}}else x.lineTo(rail,c.height);x.stroke();
    if(demoMode==='B'){x.strokeStyle='#705133';x.lineWidth=2;x.beginPath();x.moveTo(rail+outer*6,0);x.lineTo(rail+outer*6,c.height);x.stroke()}
    for(let y=0;y<c.height;y+=80){x.fillStyle='#523e2f';x.fillRect(rail-2,y,5,26);x.fillStyle='#aa8250';x.fillRect(rail-1,y,3,22);x.fillStyle='#ccb076';x.fillRect(rail-2,y,5,3)}
   }
  }
  const t=await Assets.load<Texture>(c.toDataURL('image/png'));t.source.scaleMode='nearest';demoTextures.set(key,t);
 }
}
const materialDemoLayers=(id:string)=>materialDemoPieces(id,demoMode).filter(p=>!(originalMapReplay&&id==='harbor')&&(!railEnabled||p.kind!=='wood')).map(p=>({texture:demoTextures.get(demoKey(p))!,at:p.rect,clip:p.rect}));
const boundaryWidths=boundaryArtWidths;
const boundarySheets=Object.entries(boundaryWidths).map(([art,width])=>{const d=dimensions[boundaryAsset(art as keyof typeof boundaryWidths)];return {id:'harbor-boundary-sheet-'+art,image:'harbor-boundary-image-'+art,width:d.width,height:d.height,framesWidth:1,framesHeight:1,textures:{stand:{animations:()=>[[{frameX:0,frameY:0,time:0,anchor:[.5,1],scale:[width/d.width,width/d.width]}]]}}}});
const boundaryEvents=(id:string)=>boundaryPieces(id).filter(p=>!(originalMapReplay&&p.scene==='harbor')&&(!railEnabled||p.scene!=='harbor'||p.rect.x+p.rect.w<700||p.rect.x>905||p.rect.y+p.rect.h<575||p.rect.y>925)).map((p,i)=>({id:'harbor-boundary-'+p.scene+'-'+i,x:p.rect.x+p.rect.w/2,y:p.rect.y+p.rect.h,event:{onInit(this:any){this.setHitbox(1,1);this.through=true;this.animationFixed=true;this.setGraphic('harbor-boundary-sheet-'+p.art);this.animationName.set('stand');this.syncChanges()}}}));
export const motionProjection:{scene:string;position:Point;points:Point[];lastSample:number;traceStart:Point;networkBlocked:boolean;block?:(value:boolean)=>void;sample?:()=>void;moving?:()=>boolean;restore?:(scene:string,p:Point)=>Promise<void>;restoreConfirmed?:(scene:string,p:Point)=>Promise<void>}={scene:'station',position:{x:0,y:0},points:[],lastSample:0,traceStart:{x:0,y:0},networkBlocked:true};
export function adaptContinuousSpace(original:SpaceOptions,create:(o:SpaceOptions)=>Space):Space{
 let raw:Space,logical=original.scene,predictedZone=logical,previousGlobal=globalPoint(logical,original.position);
 const desiredGraphics=new Map<string,string[]>(),debug=new URLSearchParams(location.search).has('debug');
 const zone=()=>{if(!raw||!clusters[raw.scene()])return logical;const p=raw.position();predictedZone=traceZone(predictedZone,previousGlobal,[p]);previousGlobal={...p};return predictedZone;};
 const projected=(p:Point)=>raw&&clusters[raw.scene()]?localPoint(zone(),p):p;
 const reset=(id:string,p:Point)=>{logical=predictedZone=id;previousGlobal=globalPoint(id,p);motionProjection.scene=id;motionProjection.position={...p};motionProjection.points=[];motionProjection.traceStart=globalPoint(id,p);motionProjection.lastSample=0};reset(logical,original.position);
 const facade:Space={
  dispose:()=>{if(motionProjection.sample===raw.sampleMovement){motionProjection.sample=undefined;motionProjection.moving=undefined;motionProjection.block=undefined;motionProjection.restore=undefined;motionProjection.restoreConfirmed=undefined;motionProjection.points=[];motionProjection.networkBlocked=true}raw.dispose?.()},
  installSpritesheets:s=>raw.installSpritesheets(s),position:()=>projected(raw.position()),scene:zone,renderedScene:()=>raw.renderedScene()&&clusters[raw.renderedScene()!]?zone():raw.renderedScene(),move:(x,y)=>raw.move(x,y),
  walkTo:(p,arrive)=>raw.walkTo(globalPoint(logical,p),arrive),pause:p=>raw.pause(p),
  restore:async(id,p)=>{const dest=globalPoint(id,p),crossing=id!==logical&&zone()===id,same=sameCluster(id,logical)&&raw.scene()===renderScene(id);logical=id;
   // A crossing acknowledgement retains current prediction; explicit distant arrivals still snap.
   if(crossing&&same&&(motionProjection.points.length>0||Math.hypot(raw.position().x-dest.x,raw.position().y-dest.y)<90))return;
   reset(id,p);await raw.restore(renderScene(id),dest);
  },project:p=>raw.project(globalPoint(logical,p)),toWorld:p=>localPoint(logical,raw.toWorld(p)),face:p=>raw.face(globalPoint(logical,p))
 };
 const wrappedEvent=(id:string,e:any)=>{
  const init=e.event.onInit;return {...e,id:id+'--'+e.id,...globalPoint(id,e),event:{...e.event,onInit(this:any){
   const actor=this;const proxy=new Proxy(actor,{get(target,key){if(key==='teleport')return(p:Point)=>target.teleport(globalPoint(id,p));if(key==='setGraphic')return(g:string|string[])=>{desiredGraphics.set(id+'--'+e.id,Array.isArray(g)?[...g]:[g]);target.setGraphic(g)};const value=Reflect.get(target,key,target);return typeof value==='function'&&!('set' in value)?value.bind(target):value}});init.call(proxy);
  }}};
 };
 if(new URLSearchParams(location.search).has('debug')&&new URLSearchParams(location.search).get('terrain-native')==='1')Object.assign(window,{harborTerrainReview:{restore:facade.restore}});
 const base=clusterWorld(original.world),ground={id:'base-'+CLUSTER,image:'./map/'+CLUSTER+'-base.png',width:1440,height:1632,framesWidth:1,framesHeight:1,textures:{stand:{animations:()=>[[{frameX:0,frameY:0,time:0,anchor:[0,0],scale:[1,1]}]]}}};
 // Register only the combined renderer map. Registering the two source maps as
 // well lets their onInit closures overwrite the actor handles for this map.
 const renderWorld={...base,scenes:Object.fromEntries(Object.entries(base.scenes).filter(([id])=>!isCluster(id)))};
 raw=create({...original,world:renderWorld,scene:renderScene(logical),position:globalPoint(logical,original.position),spritesheets:[...original.spritesheets,ground,...boundarySheets,...railSheets],
  mapEvents:id=>[...(!clusters[id]?original.mapEvents(id):[
   ...(id===CLUSTER?[{id:'base-'+CLUSTER,x:0,y:0,event:{onInit(this:any){this.setHitbox(1,1);this.through=true;this.animationFixed=true;this.setGraphic(ground.id);this.animationName.set('stand');this.syncChanges()}}}]:[]),
   ...clusters[id].zones.flatMap(zone=>original.mapEvents(zone).filter(e=>!e.id.startsWith('base-')).map(e=>wrappedEvent(zone,e)))]).filter(e=>nativeTerrainEnabled(id)?!e.id.startsWith('base-'):originalMapReplay&&id==='harbor'?!e.id.startsWith('base-'):!strongGroundEdges(id).length||!e.id.startsWith('base-')),...boundaryEvents(id),...railEvents(id)],
  cameraBounds:id=>clusters[id]?.canvas??original.cameraBounds?.(id)??clusters[CLUSTER].canvas,
  cameraWalkBounds:id=>clusters[id]?base.scenes[id].interior:original.cameraWalkBounds?.(id)??original.world.scenes[id].interior,
  cameraSafeArea:original.cameraSafeArea,
  floorLayers:id=>nativeTerrainEnabled(id)?[...nativeTerrainLayers(id),...materialDemoLayers(id),...railFloorLayers(id)]:originalMapReplay&&id==='harbor'?[...originalMapLayers(id),...railFloorLayers(id)]:[...(id===COASTAL?[
   {texture:Assets.get('./map/coast-base.png'),at:{x:0,y:0},clip:{x:0,y:0,w:1280,h:805}},
   {texture:Assets.get('./map/beach-base.png'),at:globalPoint('beach',{x:0,y:0}),clip:{x:70,y:805,w:1210,h:933}},
   {texture:Assets.get('./map/path-base.png'),at:globalPoint('path',{x:0,y:0}),clip:{x:1235,y:140,w:1365,h:1088},polygon:[{x:1280,y:140},{x:2600,y:140},{x:2600,y:1228},{x:1235,y:1228},{x:1235,y:1100},{x:1244,y:1100},{x:1244,y:1052},{x:1256,y:1052},{x:1256,y:1004},{x:1268,y:1004},{x:1268,y:956},{x:1280,y:956},{x:1280,y:908},{x:1272,y:908},{x:1272,y:860},{x:1260,y:860},{x:1260,y:812},{x:1244,y:812},{x:1244,y:760},{x:1235,y:760},{x:1235,y:708},{x:1248,y:708},{x:1248,y:660},{x:1260,y:660},{x:1260,y:620},{x:1272,y:620},{x:1272,y:580},{x:1280,y:580}]},
   // The entire old path playable rectangle is dry/wet source ground, not an invisible jagged ownership edge.
   {texture:Assets.get('./map/path-base.png'),crop:{x:80,y:120,w:800,h:560},at:{x:1235,y:260},clip:{x:1235,y:260,w:800,h:560}},
   // Reuse undistorted source pixels: unify the beach entry's legacy grass rectangles.
   {texture:Assets.get('./map/beach-base.png'),crop:{x:80,y:400,w:800,h:90},at:{x:150,y:805},clip:{x:150,y:805,w:800,h:90}},
   // Existing stone pixels taper 120px coast road to the 100px path road.
   {texture:Assets.get('./map/coast-base.png'),crop:{x:100,y:415,w:180,h:120},at:{x:1210,y:415},clip:{x:1210,y:415,w:180,h:120},polygon:[{x:1210,y:415},{x:1240,y:415},{x:1240,y:419},{x:1260,y:419},{x:1260,y:423},{x:1280,y:423},{x:1280,y:425},{x:1390,y:425},{x:1390,y:525},{x:1280,y:525},{x:1280,y:527},{x:1260,y:527},{x:1260,y:531},{x:1240,y:531},{x:1240,y:535},{x:1210,y:535}]}
  ]:strongGroundEdges(id).length||contactEdges(id).length?[{texture:Assets.get(id===CLUSTER?ground.image:'./map/'+id+'-base.png'),at:{x:0,y:0},clip:clusters[id]?.canvas??original.cameraBounds?.(id)??original.world.scenes[id].interior},...(original.floorLayers?.(id)??[])]:original.floorLayers?.(id)??[]),...strongGroundEdges(id).map(p=>({texture:edgeTextures.get(edgeKey(p))!,at:p.rect,clip:p.rect})),...contactEdges(id).map(p=>({texture:terrainContactTexture(p)!,at:p.rect,clip:p.rect})),...materialDemoLayers(id),...railFloorLayers(id)],
  cameraBackdrop:original.cameraBackdrop?(id=>original.cameraBackdrop!(clusters[id]?zone():id)):undefined,
  foregroundReveal:original.foregroundReveal?.map(reveal=>({...reveal,active:(p,id)=>reveal.active?.(clusters[id]?localPoint(zone(),p):p,clusters[id]?zone():id)??true,textureForScene:id=>reveal.textureForScene(clusters[id]?zone():id),originForScene:reveal.originForScene?(id)=>{const source=clusters[id]?zone():id,origin=reveal.originForScene!(source);return clusters[id]?{...origin,...globalPoint(source,origin)}:origin}:undefined})),
  prepareScene:async id=>{if(clusters[id]){await Promise.all(clusters[id].zones.map(zone=>original.prepareScene?.(zone)));if(id===CLUSTER)await Assets.load(ground.image)}else await original.prepareScene?.(id);await prepareMaterialDemo(id);await prepareRail(id);await prepareOriginalMap(id);await prepareNativeTerrain(id);const edges=strongGroundEdges(id);if(edges.length){for(const p of edges)await prepareEdgePixels(p)};for(const p of contactEdges(id))await prepareTerrainContact(p);await Promise.all([...new Set(boundaryPieces(id).map(p=>p.art))].map(async art=>{if(boundaryTextures.has(art))return;const asset=boundaryAsset(art),url='./art/'+asset+'.png',source=['coastal-rocks','flower-planter'].includes(asset)?await prepareCropImage(url):url;const alias='harbor-boundary-image-'+art;Assets.add({alias,src:source});const texture=await Assets.load<Texture>(alias);texture.source.scaleMode='nearest';boundaryTextures.set(art,texture)}))},
  walkable:(p,id)=>{if(!clusters[id])return original.walkable?.(p,id)??walkable(original.world,id,p);let z=zone();const start=raw.position(),sweptWorld=original.collisionWorld?.()??original.world;let previous=start;const steps=Math.max(1,Math.ceil(Math.hypot(p.x-start.x,p.y-start.y)));for(let i=1;i<=steps;i++){const q={x:start.x+(p.x-start.x)*i/steps,y:start.y+(p.y-start.y)*i/steps};if(!clusterWalkable(sweptWorld,q,z,previous))return false;z=pointZone(q,z,previous);if(!sharedGroup(z)&&original.walkable&&!original.walkable(localPoint(z,q),z))return false;previous=q;}return true},
  // Arrival validates the preserved logical map, whose overlap can differ from
  // the combined renderer's static obstacle union. Prediction still uses its
  // shared swept dynamic collision checks.
  arrivalWalkable:(p,id)=>clusters[id]?walkable(original.world,logical,localPoint(logical,p)):(original.arrivalWalkable?.(p,id)??walkable(original.world,id,p)),
  findPath:(a,b,id)=>{
   if(!clusters[id])return original.findPath?.(a,b,id)??findPath(original.world,id,a,b);
   const from=pointZone(a,predictedZone),to=pointZone(b,from);
   return continuousPath(original.collisionWorld?.()??original.world,from,a,to,b,(zone,x,y)=>original.findPath?.(x,y,zone)??findPath(original.world,zone,x,y));
  },
  worldPaused:original.worldPaused??original.controlsBlocked,
  controlsBlocked:()=>original.controlsBlocked()||motionProjection.networkBlocked||motionProjection.points.length>=maximumQueuedPoints||traceLength(motionProjection.traceStart,motionProjection.points)>=predictionHorizon,
  onMotionPoint:p=>appendMotionTrace(motionProjection.points,motionProjection.traceStart,p),
  onPosition:p=>{const z=zone(),local=projected(p);motionProjection.scene=z;motionProjection.position={...local};original.onPosition(local)},
  onFrame:(dt,p,_id,paused)=>{if(debug){const host=document.querySelector<HTMLElement>('#rpg');if(host){host.dataset.motionPoints=String(motionProjection.points.length);host.dataset.motionDistance=String(traceLength(motionProjection.traceStart,motionProjection.points));host.dataset.motionBlock=motionProjection.networkBlocked?'network':motionProjection.points.length>=maximumQueuedPoints?'corners':traceLength(motionProjection.traceStart,motionProjection.points)>=predictionHorizon?'distance':'none'}}original.onFrame?.(dt,projected(p),zone(),paused);for(const [id,graphic] of desiredGraphics){const [source,eventId]=id.split('--');raw.projectEventGraphic?.(id,original.eventGraphics?.(source,eventId)??graphic)}},
  onReady:()=>original.onReady(facade),
 });motionProjection.sample=raw.sampleMovement;motionProjection.moving=raw.movementPending;motionProjection.block=value=>{motionProjection.networkBlocked=value;raw.suspendPrediction?.(value)};motionProjection.restore=facade.restore;motionProjection.restoreConfirmed=async(id,p)=>{reset(id,p);await raw.restore(renderScene(id),globalPoint(id,p))};return facade;
}
