import heroCaptionBounds from './hero-caption-bounds.json';
import {placeShoreCaption,captionLeaderEnd,padCaptionRect} from './shore-caption';
import {projectShorePreview,type ShorePreview} from './shore-preview';
import {fishingWaypoints} from './fishing-waypoints';
import {arrivalFacing} from './arrival-facing';
import {fernImage} from '../life/ornamental-fern-config';
import {fernGraphicId,syncFernDisplay} from './ornamental-fern-render';
import {landClick} from '../life/land-selection';
import {landRenderSlots} from '../life/land-contract';
import {prepareSceneAssets} from './prepare-assets';
import {entrySpan,entryTimer} from '../account-link/entry-timing';
import {neighborPartyActive,type NeighborChapter} from './neighbor-gathering';
import {weatherSceneMasks} from '../weather/scene-masks';
import {createWeatherAnchorBatch} from '../weather/anchor-batch';
import {weatherDecorations} from '../weather/presentation';
import {residentRainPause} from '../weather/resident-reactions';
import type {WeatherState} from '../weather/state';
import type {WeatherEcologyState} from '../weather/ecology';
import {WeatherLayer,type WeatherQuality} from '../weather/WeatherLayer';
import type {WeatherKind} from '../weather/state';
import {createNativeDogRuntime,nativeDogSheet,nativeDogEntities,nativeDogId,nativeDogBody,nativeDogTargets} from '../animals/native-dog';
import {mintEntities,mintSheets,wildMintAssets,mintArtAccepted} from './wild-mint-art';
import {nativeCrabCollision,nativeCrabFrame,nativeCrabTargets,type NativeCrabSave} from '../animals/native-crab-game';
import {nativeCrabId} from '../animals/native-crab-config';
import {nativeCrabBody,type CrabFrame} from '../animals/native-crab';
import {nativeCrabSheet,nativeCrabAnimation} from '../animals/native-crab-art';
import {explorationLayout} from './exploration-layout';
import {outdoors} from './outdoors';
import {outdoorBuildingReveals} from './outdoor-building-reveal';
import {createDaylightTransition} from './daylight';
import {authoredLights} from './daylight-sources';
import type {AnimalSample} from '../animal-life/types';
import {landWorld,landRegions,landRegion,landEntities,landFootprint,type LandState} from '../life/land';
import {candidateEnabled,internalPassage,isCluster,zonesFor} from '../candidate/continuity';
import type {AnimalSave} from '../animals/types';
import {acceptedAnimals,animalArts,animalSheets} from '../animals/art';
import {createAnimalRuntime} from '../animals/behavior';
import {animalPresentation} from '../animals/render-contract';
import {animalAnimation} from '../animals/rpgjs-sheet';
import {gameAnimalContext} from '../animals/game';
import {cropGraphic,prepareCropWorld,prepareCropImage} from './crop-art';
import {lifeCropSheets,lifeCropGraphic} from './life-crop-art';
import type {LifeView} from '../ui/LifeBag';
import {Icon} from '../ui/icons';
import {cropArtStage} from '../story/crop-art-stage';
import {plotStatus,plotIds,type Plot} from '../story/crops';
import {presentEntity,patrolRadius,townPeriod,fernStage,residentClearOfPlayer} from './residents';
import {dynamicWorld,slots} from '../dynamic-assets/layout';
import {summerAudio} from '../audio';
import {FootstepCadence} from '../footsteps';
import artDimensions from './art-dimensions.json';
import mapDimensions from './map-dimensions.json';
import {Direction} from '@rpgjs/common';
import {findPath,walkable} from '../engine/world';
import {useEffect,useMemo,useRef,useState,useId} from 'react';import {Assets} from 'pixi.js';import type {RpgPlayer} from '@rpgjs/server';
import {createRpgSpace,type Space} from '../engine/rpg-space';import {rooms,world,worldWithFlags,tx,entityLabel,type Locale,type Entity} from './data';import {heroSheet,sheets,propId,npcSheets} from './sheets';import type {Point} from '../engine/world';
export type WorldHandle={move:(x:number,y:number)=>void;position:()=>Point;approach:(e:Entity)=>boolean;reactAnimal:(id:string,verb:'call'|'pet')=>void};
const plantLabel=(e:Entity,plants?:LifeView['plants']):Entity=>{const p=plants?.plots.find(p=>p.target===e.id);return p?.status?{...e,label:p.status.ready?['成熟脆荚菜畦','Ready pea bed']:['生长中的菜畦','Growing bed']}:e};
export function View({shorePreview,neighborChapterV1,weatherV1,weatherEcologyV1,weather='clear',weatherQuality='full',storm=false,heavyRain=false,weatherFlashCue=0,onWeatherFlash,reduceFlashes=false,weatherReducedMotion=false,nativeCrabV1,nativeCrabEnabled=false,animalSample,lifePlants,landV1,landEnabled=false,landCandidate,landSelecting,onLandPick,journeyId,animalsV1,plots,townMinutes=540,fernStartedAt,scene,start,locale,flags,titles,paused,onNear,onPosition,onRenderReady,onLoadError,onRetry,handle,dynamicAssets}:{shorePreview?:ShorePreview;neighborChapterV1?:NeighborChapter;weatherV1?:WeatherState;weatherEcologyV1?:WeatherEcologyState;weather?:WeatherKind;weatherQuality?:WeatherQuality;storm?:boolean;heavyRain?:boolean;weatherFlashCue?:number;onWeatherFlash?:(report:import('../weather/WeatherLayer').FlashReport)=>void;reduceFlashes?:boolean;weatherReducedMotion?:boolean;nativeCrabV1?:NativeCrabSave;nativeCrabEnabled?:boolean;animalSample?:AnimalSample;lifePlants?:LifeView['plants'];landV1?:LandState;landEnabled?:boolean;landCandidate?:{region:string;at:Point};landSelecting?:string;onLandPick?:(at:Point)=>void;journeyId?:string;animalsV1?:AnimalSave;plots?:Record<string,Plot>;townMinutes?:number;fernStartedAt?:number;dynamicAssets?:{sheets:any[];scene:string};scene:string;start:Point;locale:Locale;flags:string[];titles:Record<string,[string,string]>;paused:boolean;onNear:(e:Entity|null)=>void;onPosition:(p:Point)=>void;onRenderReady:(ready:boolean)=>void;onLoadError?:()=>void;onRetry?:()=>void;handle:{current:WorldHandle|null}}){
 const shoreMaskId='shore-'+useId().replace(/:/g,'');
 const decorations=useMemo(()=>{const r=rooms[scene],o=outdoors[scene];if(!r.outdoor||!o)return [];return weatherDecorations(o.patches,[...o.barriers,...weatherSceneMasks(scene),...r.props.flatMap(p=>{const d=artDimensions[p.art as keyof typeof artDimensions],height=d?p.width*d.height/d.width:p.width;return [...(p.footprint?[p.footprint]:[]),...(!p.floorDecoration?[{x:p.at.x-p.width/2,y:p.at.y-height,w:p.width,h:height}]:[])]})],r.props.filter(p=>/tree-|plant|flower/.test(p.art)).map(p=>{const d=artDimensions[p.art as keyof typeof artDimensions];return {at:p.at,width:p.width,height:d?p.width*d.height/d.width:p.width}}),r.spawn)},[scene]);
 useEffect(()=>{summerAudio.setRain(weather==='light-rain'&&rooms[scene].outdoor&&!paused,storm?'storm':heavyRain?'heavy':'light');return()=>summerAudio.setRain(false)},[weather,scene,paused,storm,heavyRain]);
 const weatherCandidates=useRef(decorations);weatherCandidates.current=decorations;
 const daylight=useRef<ReturnType<typeof createDaylightTransition>|null>(null);
 const animalsRuntime=useRef(createAnimalRuntime(acceptedAnimals));
 const dogRuntime=useRef(createNativeDogRuntime());
 const restores=useRef<Promise<void>>(Promise.resolve());
 const samePhysical=useRef<string>(scene);
 const host=useRef<HTMLDivElement>(null),space=useRef<Space|null>(null),engine=useRef<Space|null>(null),latest=useRef({shorePreview,neighborChapterV1,weatherV1,weatherEcologyV1,nativeCrabV1,nativeCrabEnabled,animalSample,lifePlants,landV1,landEnabled,landCandidate,landSelecting,onLandPick,animalsV1,plots,townMinutes,fernStartedAt,journeyId,scene,start,paused,onNear,onPosition,locale,flags,dynamicAssets});latest.current={shorePreview,neighborChapterV1,weatherV1,weatherEcologyV1,nativeCrabV1,nativeCrabEnabled,animalSample,lifePlants,landV1,landEnabled,landCandidate,landSelecting,onLandPick,animalsV1,plots,townMinutes,fernStartedAt,journeyId,scene,start,paused,onNear,onPosition,locale,flags,dynamicAssets};const [animalTargets,setAnimalTargets]=useState<Entity[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
 const failed=useRef(false);
 // RPGJS can report a map failure outside its startup promise. End the wait
 // even if neither onReady nor onError fires, including after a scene change.
 useEffect(()=>{if(ready||error)return;const timer=setTimeout(()=>setError('SCENE_LOAD_TIMEOUT'),20000);return()=>clearTimeout(timer)},[ready,error,scene,journeyId]);
 useEffect(()=>{if(!error)return;failed.current=true;engine.current?.dispose?.();engine.current=null;space.current=null;handle.current=null;onRenderReady(false);onLoadError?.()},[error]);
 useEffect(()=>{const light=createDaylightTransition(host.current!);daylight.current=light;light.update(townMinutes,rooms[scene].outdoor,scene);return()=>light.dispose()},[]);
 useEffect(()=>{daylight.current?.update(townMinutes,rooms[scene].outdoor,scene)},[townMinutes,scene]);
 useEffect(()=>{
  const mount=host.current!.querySelector<HTMLElement>('#rpg')!;
  const layout=explorationLayout(host.current!);
  const nativeSheet=nativeCrabSheet();
  const renderSheets=[...mintSheets(),...sheets,...animalSheets,nativeSheet,nativeDogSheet,...lifeCropSheets,...(dynamicAssets?.sheets??[])];
  const baseWorld=()=>landWorld(dynamicWorld(latest.current.flags,!!latest.current.dynamicAssets),latest.current.landV1);
  const extraEntities=(id:string)=>[...fishingWaypoints(id),...mintEntities(id),...(latest.current.landEnabled?landEntities({scene:id,landV1:latest.current.landV1},latest.current.landCandidate).map(e=>plantLabel(e,latest.current.lifePlants)):[])];
  const extraSlots=slots;
  const propActors=new Map<string,RpgPlayer>();
  const weatherTransforms=new WeakMap<HTMLElement,string>(),weatherBatch=createWeatherAnchorBatch();
  const event=(id:string,x:number,y:number,graphic:string|string[]=id)=>({id,x,y,event:{onInit(this:RpgPlayer){this.setHitbox(1,1);this.through=true;this.animationFixed=true;if(id===fernGraphicId)syncFernDisplay(this,latest.current.flags);else{this.setGraphic(graphic);this.animationName.set('stand');this.syncChanges()}if(id.startsWith('prop-'))propActors.set(id,this)}}});
  const layerEvent=(id:string,layer:string)=>{const d=mapDimensions[(id+'-'+layer) as keyof typeof mapDimensions];return d.empty?[]:[event(layer+'-'+id,d.x,d.y+(layer==='front'?d.height:0))]};
  const actors=new Map<string,RpgPlayer>(),actorPositions=new Map<string,Point>(),patrols=new Map<string,{side:number;pause:number;distance:number}>();
  const active=(id:string,e:Entity)=>(e.id!=='visitor-note'||latest.current.flags.includes('news:checked'))&&presentEntity({...latest.current,neighborPartyEnabled:neighborPartyActive(latest.current),scene:id},e);
  const personEvent=(id:string,e:Entity)=>({id:'person-'+e.id,x:e.at.x,y:e.at.y,event:{onInit(this:RpgPlayer){this.setHitbox(1,1);this.through=true;this.animationFixed=true;this.setGraphic(active(id,e)?'npc-'+e.person:[]);this.animationName.set('stand');this.syncChanges();actors.set(id+'/'+e.id,this);actorPositions.set(id+'/'+e.id,{...e.at})}}});
  const animalActors=new Map<string,RpgPlayer>();let animalProjection=animalPresentation([],animalArts,scene),animalUiTick=0,animalScene=scene;
  let dogStates:ReturnType<ReturnType<typeof createNativeDogRuntime>['tick']>=[];
  let nativeFrame:CrabFrame|undefined,nativeEngine:ReturnType<typeof nativeCrabFrame>['engine']|undefined,lastNativeRoot:NativeCrabSave|undefined,lastNativeMinute=-1,lastNativeScene='',lastNativeJourney=journeyId;
  const animalCtx=(p:Point)=>gameAnimalContext(latest.current,p,{world:baseWorld(),positions:actorPositions,paused:latest.current.paused});
  const animalEvent=(id:string,e:Entity)=>({id:'animal-'+e.id,x:e.at.x,y:e.at.y,event:{onInit(this:RpgPlayer){this.setHitbox(1,1);this.through=true;this.animationFixed=true;this.setGraphic([]);this.syncChanges();animalActors.set(id+'/'+e.id,this)}}});
  const residentAnimalClear=(q:Point)=>![...dogStates.filter(s=>s.visible).map(s=>nativeDogBody(s.foot)),...animalProjection.collisions,...(nativeFrame?.visible?[nativeCrabBody(nativeFrame.foot,nativeFrame.direction)]:[])].some(b=>q.x-9<b.x+b.w&&q.x+9>b.x&&q.y-8<b.y+b.h&&q.y>b.y);
  const collisionWorld=(id:string)=>({...baseWorld(),scenes:{...baseWorld().scenes,[id]:{...baseWorld().scenes[id],obstacles:[...baseWorld().scenes[id].obstacles,...dogStates.filter(s=>s.visible&&s.scene===id).map(s=>nativeDogBody(s.foot)),...(id===animalScene?animalProjection.collisions:[]),...(nativeFrame?.visible&&nativeFrame.scene===id?[nativeCrabBody({x:Math.round(nativeFrame.foot.x),y:Math.round(nativeFrame.foot.y)},nativeFrame.direction)]:[]),...(id===latest.current.scene?nativeCrabCollision(latest.current):[]),...rooms[id].entities.filter(e=>e.person&&active(id,e)).map(e=>{const p=actorPositions.get(id+'/'+e.id)??e.at;return {x:p.x-9,y:p.y-8,w:18,h:8}})]}}});
  const events=(id:string)=>[...layerEvent(id,'base'),...mintEntities(id).map(e=>event('prop-wild-mint',e.at.x,e.at.y,'prop-wild-mint')),...landRegions.filter(r=>r.scene===id).flatMap(r=>landRenderSlots.flatMap(n=>[event('prop-land-bed-'+n,r.rect.x+40,r.rect.y+40,[]),event('prop-life-bed-'+n,r.rect.x+40,r.rect.y+28,[])])),...(id==='garden'?plotIds.flatMap(plot=>{const e=rooms.garden.entities.find(e=>e.id===plot)!;return [event('prop-garden-soil-'+plot,e.at.x,e.at.y-24,'prop-garden-crop-soil'),event('prop-garden-'+plot,e.at.x,e.at.y-10,cropGraphic({...latest.current,items:{},cash:0,energy:0},plot)||[])]}):[]),...layerEvent(id,'north'),...layerEvent(id,'side'),...rooms[id].props.filter(p=>!p.floorDecoration).map(p=>event(propId(id,p),p.at.x,p.at.y+(p.depthOffset??0),p.visibleWhen&&!latest.current.flags.includes(p.visibleWhen)?[]:propId(id,p))),...extraSlots.filter(s=>s.scene===id).map(s=>event(`prop-${id}-${s.slotId}`,s.eventAt.x,s.eventAt.y,latest.current.dynamicAssets?.scene===id?`prop-${id}-${s.slotId}`:[])),...rooms[id].entities.filter(e=>e.person&&npcSheets.some(s=>s.id==='npc-'+e.person)).map(e=>personEvent(id,e)),...[...rooms[id].entities.filter(e=>e.animalId),...nativeDogEntities(id)].map(e=>animalEvent(id,e)),...layerEvent(id,'front')];
  const backdropUrl=(id:string)=>{const material=outdoors[id]?.patches[0]?.material??'grass';return './art/floor-'+(material==='grass'?'grass-v3':material)+'.png'};
  const prepare=async(id:string)=>entrySpan('scene-assets',()=>{const crops=(async()=>{if(id==='home'||id==='garden'||landRegions.some(r=>r.scene===id)){const prepared=id==='home'?new Map([[fernImage,await prepareCropImage(fernImage)]]):await prepareCropWorld();await Promise.all(renderSheets.map(async sheet=>{const url=prepared.get(sheet.image);if(url){sheet.image=url;const texture=await Assets.load(url);texture.source.label=sheet.id==='prop-garden-crop-soil'?'soil-marker':sheet.id+'.png';texture.source.scaleMode='nearest'}}))}})();return prepareSceneAssets([
   ()=>Assets.load(backdropUrl(id)),
   ()=>crops,
   async()=>{if(landRegions.some(r=>r.scene===id))await Promise.all(lifeCropSheets.map(async sheet=>{const texture=await Assets.load(sheet.image);texture.source.label=sheet.id+'.png';texture.source.scaleMode='nearest'}))},
   async()=>{const texture=await Assets.load(nativeSheet.image);texture.source.scaleMode='nearest';texture.source.label=nativeSheet.id+'.png'},
   async()=>{if(id==='hill'&&mintArtAccepted(wildMintAssets)){const texture=await Assets.load(wildMintAssets.bush.image);texture.source.scaleMode='nearest'}},
   ()=>Assets.load(heroSheet.image),
   async()=>{await crops;return Promise.all([...sheets,...animalSheets,nativeSheet,nativeDogSheet,...(latest.current.dynamicAssets?.sheets??[])].filter(s=>s.id.endsWith('-'+id)||s.id.startsWith('prop-'+id+'-')||s.id.startsWith('npc-')||s.id.startsWith('animal-')).map(s=>Assets.load(s.image))) }
  ])});
  const footsteps=new FootstepCadence();let previousPoint={...start},landOverlayTimer:ReturnType<typeof setTimeout>|undefined;
  let live=true,created:Space|undefined;
  let lastNear='',motionTime=0,npcTick=0;void prepare(scene).then(()=>{
   if(!live)return;
   const rendererReady=entryTimer('renderer');
   created=createRpgSpace({world:baseWorld(),host:mount,scene,position:start,speed:112,stride:48,sheet:heroSheet,spritesheets:renderSheets,cameraBounds:id=>{const r=rooms[id].interior;return rooms[id].outdoor?{x:0,y:0,w:1440,h:1088}:{x:r.x-8,y:r.y-64,w:r.w+16,h:r.h+72}},cameraWalkBounds:id=>rooms[id].interior,cameraSafeArea:layout.insets,cameraBackdrop:id=>Assets.get(backdropUrl(id)),foregroundReveal:[...outdoorBuildingReveals(),{textureForScene:id=>id+'-front.png',size:{w:1440,h:1088},originForScene:id=>{const d=mapDimensions[(id+'-front') as keyof typeof mapDimensions];return {x:d.x,y:d.y,width:d.width,height:d.height}},center:{x:8,y:-20},radius:68,opacity:.2,active:(p,id)=>!rooms[id].outdoor&&p.y>rooms[id].interior.y+rooms[id].interior.h-78},{textureForScene:()=> 'door-front-v7.png',size:{w:1440,h:1088},originForScene:id=>{const p=rooms[id].props.find(p=>p.id==='exit-leaf')!;const d=artDimensions['door-front-v7'];const h=d.height*p.width/d.width;return {x:p.at.x-p.width/2,y:p.at.y-h,width:d.width,height:d.height,worldWidth:p.width,worldHeight:h}},center:{x:8,y:-20},radius:68,opacity:.2,active:(p,id)=>!rooms[id].outdoor&&p.y>rooms[id].interior.y+rooms[id].interior.h-78}],mapEvents:events,eventGraphics:(id,eventId)=>{const e=rooms[id].entities.find(e=>e.person&&eventId==='person-'+e.id);return e?(active(id,e)?['npc-'+e.person]:[]):undefined},prepareScene:prepare,collisionWorld:()=>{const b=baseWorld();return {...b,scenes:{...b.scenes,...Object.fromEntries(['market','bazaar','coast','beach','path'].map(id=>[id,collisionWorld(id).scenes[id]]))}}},walkable:(p,id)=>walkable(collisionWorld(id),id,p),findPath:(a,b,id)=>findPath(collisionWorld(id),id,a,b),controlsBlocked:()=>latest.current.paused,onDestination:()=>{},onError:e=>{rendererReady('failed');if(live){failed.current=true;setError(String(e))}},onReady:r=>{rendererReady();if(!live||failed.current){r.dispose?.();return}space.current=r;r.pause(latest.current.paused);handle.current={move:r.move,position:r.position,approach:e=>{const at=actorPositions.get(latest.current.scene+'/'+e.id);const animal=animalProjection.targets.find(t=>t.id===e.id);return r.walkTo(animal?.approach??(at?{x:at.x-8,y:at.y+42}:e.approach))},reactAnimal:(id,verb)=>{animalsRuntime.current.react(id,verb,animalCtx(r.position()))}};if(r.renderedScene()!==latest.current.scene){void r.restore(latest.current.scene,latest.current.start).then(()=>{if(!failed.current){setReady(true);onRenderReady(true)}}).catch(e=>setError(String(e)))}else if(!failed.current){setReady(true);onRenderReady(true)}},onPosition:p=>latest.current.onPosition(p),onFrame:(dt,p,id,blocked)=>{
    // Prediction may cross the existing seam before the old scene receipt.
    // Hide only the new dog during that interval; do not animate stale owners.
    if(candidateEnabled()&&isCluster(id)&&id!==latest.current.scene){dogStates=[];for(const zone of zonesFor(id)){const actor=animalActors.get(zone+'/'+nativeDogId);if(actor?.graphics().length){actor.setGraphic([]);actor.syncChanges()}}}
    if(!space.current||space.current.renderedScene()!==id||id!==latest.current.scene){const marker=host.current?.querySelector<HTMLElement>('[data-shore-preview]');if(marker)marker.style.visibility='hidden';return;}
    for(const n of landRenderSlots){const key='prop-land-bed-'+n,actor=propActors.get(key),plot=latest.current.landV1?.plots.find(p=>p.id==='land-bed-'+n&&landRegion(p.region)?.scene===id);if(actor){const graphic=plot?'prop-garden-crop-soil':'';if((actor.graphics()[0]??'')!==graphic){actor.setGraphic(graphic||[]);actor.syncChanges()}if(plot&&(actor.x()!==plot.at.x||actor.y()!==plot.at.y-24)){void actor.teleport({x:plot.at.x,y:plot.at.y-24});actor.syncChanges()}}}
    // Read the renderer's completed camera transform, after this frame's actor
    // synchronizations. The same transform then handles the ordinary click.
    if(host.current?.querySelector('[data-land-rect],[data-shore-preview]')&&!landOverlayTimer)landOverlayTimer=setTimeout(()=>{
     landOverlayTimer=undefined;
     if(id!==latest.current.scene)return;
     const marker=host.current?.querySelector<HTMLElement>('[data-shore-preview]');
     if(marker){const r=space.current,q=r&&r.renderedScene()===id?projectShorePreview(latest.current.shorePreview,id,r.position(),at=>r.project(at)):null;marker.style.visibility='hidden';
      const label=marker.querySelector<HTMLElement>('[data-shore-caption]'),mask=marker.querySelector<SVGMaskElement>('mask'),holes=marker.querySelector<SVGGElement>('[data-shore-exclusions]'),line=marker.querySelector<SVGLineElement>('line');
      if(q&&r&&label&&mask&&holes&&line&&host.current){const box=host.current.getBoundingClientRect(),p=r.position(),pose=heroSheet.textures.stand.animations({direction:Direction.Down})[0][0],fw=heroSheet.width/heroSheet.framesWidth,fh=heroSheet.height/heroSheet.framesHeight;
       // Use the existing hero frame/anchor/scale and current camera, including shared-map offsets.
       const a=r.project({x:p.x+pose.x+(heroCaptionBounds.alpha.x-fw*pose.anchor[0])*pose.scale[0],y:p.y+pose.y+(heroCaptionBounds.alpha.y-fh*pose.anchor[1])*pose.scale[1]}),b=r.project({x:p.x+pose.x+(heroCaptionBounds.alpha.x+heroCaptionBounds.alpha.w-fw*pose.anchor[0])*pose.scale[0],y:p.y+pose.y+(heroCaptionBounds.alpha.y+heroCaptionBounds.alpha.h-fh*pose.anchor[1])*pose.scale[1]});
       const player=padCaptionRect({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}),avoid=[player];
       for(const node of host.current.parentElement?.querySelectorAll<HTMLElement>('.harbor-next-step,.harbor-controls,.harbor-shore-action')??[]){const v=node.getBoundingClientRect();if(v.width&&v.height)avoid.push({x:v.x-box.x,y:v.y-box.y,w:v.width,h:v.height})}
       const caption=placeShoreCaption(q,{w:label.offsetWidth,h:label.offsetHeight},{w:box.width,h:box.height},avoid);
       if(caption){marker.style.transform=`translate(${q.x}px,${q.y}px) translate(-50%,-50%)`;label.style.left=(caption.x-q.x+10)+'px';label.style.top=(caption.y-q.y+10)+'px';marker.dataset.shorePlayerBox=JSON.stringify(player);marker.dataset.shoreCaptionBox=JSON.stringify(caption);
        const maskBounds={x:10-q.x,y:10-q.y,width:box.width,height:box.height};for(const [key,value]of Object.entries(maskBounds)){mask.setAttribute(key,String(value));mask.querySelector('rect')!.setAttribute(key,String(value))}
        while(holes.children.length<avoid.length)holes.appendChild(host.current.ownerDocument.createElementNS('http://www.w3.org/2000/svg','rect'));while(holes.children.length>avoid.length)holes.lastElementChild!.remove();
        avoid.forEach((v,i)=>{const rect=holes.children[i];for(const [key,value]of Object.entries({x:v.x-q.x+10,y:v.y-q.y+10,width:v.w,height:v.h}))rect.setAttribute(key,String(value))});
        const end=captionLeaderEnd(q,caption);line.setAttribute('x2',String(end.x-q.x+10));line.setAttribute('y2',String(end.y-q.y+10));marker.style.visibility='visible';
       }
      }
     }

     for(const node of host.current?.querySelectorAll<HTMLElement>('[data-land-rect]')??[]){const rect=JSON.parse(node.dataset.landRect!);const a=space.current?.project({x:rect.x,y:rect.y}),b=space.current?.project({x:rect.x+rect.w,y:rect.y+rect.h});if(a&&b){node.style.transform=`translate(${a.x}px,${a.y}px)`;node.style.width=(b.x-a.x)+'px';node.style.height=(b.y-a.y)+'px'}}
    },0);
    for(const n of landRenderSlots){const actor=propActors.get('prop-life-bed-'+n),bed=latest.current.lifePlants?.plots.find(p=>p.id==='life-bed-'+n&&p.scene===id),graphic=lifeCropGraphic(bed?.status??null);if(actor){if((actor.graphics()[0]??'')!==graphic){actor.setGraphic(graphic||[]);actor.animationName.set('stand');actor.syncChanges()}if(bed&&(actor.x()!==bed.at.x||actor.y()!==bed.at.y-12)){void actor.teleport({x:bed.at.x,y:bed.at.y-12});actor.syncChanges()}}}
    if(candidateEnabled()&&isCluster(id))for(const other of zonesFor(id).filter(s=>s!==id)){for(const e of rooms[other].entities.filter(e=>e.person)){const actor=actors.get(other+'/'+e.id);if(actor){const graphic=active(other,e)?'npc-'+e.person:'';if((actor.graphics()[0]??'')!==graphic){actor.setGraphic(graphic||[]);actor.syncChanges()}}}for(const e of [...rooms[other].entities.filter(e=>e.animalId),...nativeDogEntities(other)]){const actor=animalActors.get(other+'/'+e.id);if(actor&&actor.graphics().length){actor.setGraphic([]);actor.syncChanges()}}}
    if(id==='garden')for(const plot of plotIds){const actor=propActors.get('prop-garden-'+plot),graphic=cropGraphic({...latest.current,items:{},cash:0,energy:0},plot);if(actor&&(actor.graphics()[0]??'')!==graphic){actor.setGraphic(graphic||[]);actor.syncChanges()}}
    const fernActor=propActors.get('prop-garden-growing-fern');if(id==='garden'&&fernActor){const graphic='prop-garden-growing-fern-'+fernStage(latest.current);if(fernActor.graphics()[0]!==graphic){fernActor.setGraphic(graphic);fernActor.syncChanges()}}
    for(const prop of rooms[id].props.filter(prop=>prop.state||prop.visibleWhen)){const key=propId(id,prop),actor=propActors.get(key);if(key===fernGraphicId){if(actor)syncFernDisplay(actor,latest.current.flags);continue}const graphic=prop.visibleWhen&&!latest.current.flags.includes(prop.visibleWhen)?'':key+(prop.state&&latest.current.flags.includes(prop.state.flag)?'-active':'');if(actor&&(actor.graphics()[0]??'')!==graphic){actor.setGraphic(graphic||[]);actor.syncChanges()}}
    for(const slot of slots.filter(slot=>slot.scene===id)){const key=`prop-${id}-${slot.slotId}`,actor=propActors.get(key);const graphic=latest.current.dynamicAssets?.scene===id&&latest.current.dynamicAssets.sheets.some(sheet=>sheet.id===key)?key:'';if(actor&&(actor.graphics()[0]??'')!==graphic){actor.setGraphic(graphic||[]);actor.syncChanges()}}
    const glow=host.current?.querySelector<HTMLElement>('.harbor-lantern-glow');if(glow&&space.current){const q=space.current.project({x:365,y:350});glow.style.transform=`translate(${q.x}px,${q.y}px) translate(-50%,-50%)`}
    if(host.current)weatherBatch.update(host.current,weatherCandidates.current,p,point=>space.current!.project(point),[{x:p.x-22,y:p.y-58,w:60,h:76},...rooms[id].entities.filter(e=>e.person&&active(id,e)).map(e=>{const at=actorPositions.get(id+'/'+e.id)??e.at;return{x:at.x-28,y:at.y-68,w:56,h:76}}),...animalProjection.visuals.map(v=>({x:v.foot.x-22,y:v.foot.y-38,w:44,h:44})),...dogStates.filter(s=>s.visible&&s.scene===id).map(s=>({x:s.foot.x-24,y:s.foot.y-42,w:48,h:50})),...(nativeFrame?.visible&&nativeFrame.scene===id?[{x:nativeFrame.foot.x-24,y:nativeFrame.foot.y-30,w:48,h:38}]:[])]);
    for(const marker of host.current?.querySelectorAll<HTMLElement>('[data-world-x]')??[]){const q=space.current.project({x:Number(marker.dataset.worldX),y:Number(marker.dataset.worldY)});const transform=`translate(${q.x}px,${q.y}px) translate(-50%,${marker.dataset.lightWidth?'-50%':'-100%'})`,weatherAnchor=marker.classList.contains('harbor-weather__anchor');if(!weatherAnchor||weatherTransforms.get(marker)!==transform){marker.style.transform=transform;if(weatherAnchor)weatherTransforms.set(marker,transform)};if(marker.dataset.lightWidth){const edge=space.current.project({x:Number(marker.dataset.worldX)+Number(marker.dataset.lightWidth),y:Number(marker.dataset.worldY)});marker.style.width=`${Math.abs(edge.x-q.x)}px`;marker.style.height=marker.style.width}}
    const moved=Math.hypot(p.x-previousPoint.x,p.y-previousPoint.y);previousPoint={...p};
    if(blocked||moved<.01||moved>=12)summerAudio.stopSteps();
    if(footsteps.update(p,id,blocked))summerAudio.effect('step');
    motionTime+=blocked?0:dt;npcTick+=dt;
    if(npcTick>.06){npcTick=0;for(const e of rooms[id].entities.filter(e=>e.person)){
     const actor=actors.get(id+'/'+e.id);if(!actor)continue;if(!active(id,e)){if(actor.graphics().length){actor.setGraphic([]);actor.syncChanges()}continue}if(actor.graphics()[0]!=='npc-'+e.person)actor.setGraphic('npc-'+e.person);
     const previous=actorPositions.get(id+'/'+e.id)??e.at;
     const current=residentClearOfPlayer(e,previous,p,world.actor,q=>residentAnimalClear(q)&&walkable(baseWorld(),id,{x:q.x-8,y:q.y-6})&&!rooms[id].entities.some(other=>other.person&&other.id!==e.id&&active(id,other)&&Math.hypot(q.x-(actorPositions.get(id+'/'+other.id)??other.at).x,q.y-(actorPositions.get(id+'/'+other.id)??other.at).y)<28));
     if(current!==previous){void actor.teleport(current);actorPositions.set(id+'/'+e.id,current)}
     const nearPlayer=Math.hypot(p.x+8-current.x,p.y+6-current.y)<110;
     let next={...current},pose='stand',direction=actor.direction();
     if(!blocked&&!nearPlayer&&!residentRainPause(latest.current,e.person,!!rooms[id].outdoor)&&patrolRadius(e.person)>0){
      const patrol=patrols.get(id+'/'+e.id)??{side:1,pause:0,distance:0};patrols.set(id+'/'+e.id,patrol);
      if(patrol.pause>0)patrol.pause=Math.max(0,patrol.pause-.06);else{
       const goal=e.at.x+patrol.side*patrolRadius(e.person),delta=Math.sign(goal-current.x)*Math.min(Math.abs(goal-current.x),1.8);next={x:current.x+delta,y:e.at.y};if(!residentAnimalClear(next)||!walkable(baseWorld(),id,{x:next.x-8,y:next.y-6})||rooms[id].entities.some(other=>other.person&&other.id!==e.id&&active(id,other)&&Math.hypot(next.x-(actorPositions.get(id+'/'+other.id)??other.at).x,next.y-(actorPositions.get(id+'/'+other.id)??other.at).y)<28)){next={...current};patrol.side*=-1;patrol.pause=.8}patrol.distance+=Math.abs(next.x-current.x);direction=delta>0?Direction.Right:Direction.Left;pose=['stride-0','stride-1','stride-2','stride-1'][Math.floor(patrol.distance/12)%4];
       if(Math.abs(goal-next.x)<.1){patrol.side*=-1;patrol.pause=1.5;pose='stand'}
      }
     }else if(nearPlayer){const dx=p.x+8-current.x,dy=p.y+6-current.y;direction=Math.abs(dx)>Math.abs(dy)?(dx>0?Direction.Right:Direction.Left):(dy>0?Direction.Down:Direction.Up)}
     if(next.x!==current.x||next.y!==current.y){void actor.teleport(next);actorPositions.set(id+'/'+e.id,next)}
     if(actor.direction()!==direction)actor.direction.set(direction);if(actor.animationName()!==pose)actor.animationName.set(pose);actor.syncChanges();
    }}
    let animalStates=animalsRuntime.current.tick(blocked?0:dt,animalCtx(p));
    const observed=latest.current.animalSample;if(blocked&&observed?.scene===id&&observed.minute===latest.current.townMinutes&&observed.frame.species!=='crab'){const frame=observed.frame;animalStates=animalStates.map(a=>a.id===frame.id?structuredClone(frame):a)}
    if(latest.current.nativeCrabEnabled&&['coast','beach','dock'].includes(id)){
     const n=latest.current.nativeCrabV1;
     if(!nativeEngine||lastNativeJourney!==latest.current.journeyId||n!==lastNativeRoot||lastNativeMinute!==latest.current.townMinutes||lastNativeScene!==id){nativeEngine=nativeCrabFrame(latest.current,p,blocked).engine;lastNativeRoot=n;lastNativeMinute=latest.current.townMinutes;lastNativeScene=id;lastNativeJourney=latest.current.journeyId}
     nativeFrame=nativeEngine.runtime.tick(blocked?0:dt,animalCtx(p))[0];
     if(blocked&&observed?.frame.species==='crab'&&observed.scene===id&&observed.minute===latest.current.townMinutes)nativeFrame=structuredClone(observed.frame);
    }else{nativeFrame=undefined;nativeEngine=undefined;lastNativeRoot=undefined}
    const nativeTargets=nativeFrame?nativeCrabTargets(nativeFrame,id,baseWorld()):[];
    dogStates=dogRuntime.current.tick(blocked?0:dt,animalCtx(p),animalStates,latest.current.flags.includes('bag-returned'));
    for(const state of dogStates){const actor=animalActors.get(id+'/'+nativeDogId);if(!actor)continue;if(!state.visible){if(actor.graphics().length){actor.setGraphic([]);actor.syncChanges()}continue}if(actor.graphics()[0]!==nativeDogSheet.id)actor.setGraphic(nativeDogSheet.id);void actor.teleport({x:Math.round(state.foot.x),y:Math.round(state.foot.y)});const animation=animalAnimation(state);if(actor.animationName()!==animation)actor.animationName.set(animation);actor.syncChanges()}
    animalScene=id;animalProjection=animalPresentation(animalStates,animalArts,id);
    const memoryTargets:Entity[]=[...animalProjection.targets,...nativeTargets,...nativeDogTargets(dogStates,id)].map(target=>({...target,label:target.id.startsWith('harbor-cat-')&&(latest.current.animalsV1?.individuals[target.id]?.familiarity??0)>0?['熟悉的猫','Familiar cat']:target.label}));
    for(const e of rooms[id].entities.filter(e=>e.animalId)){
     const actor=animalActors.get(id+'/'+e.id);if(!actor)continue;
     if(e.id===nativeCrabId){if(!nativeFrame?.visible){if(actor.graphics().length){actor.setGraphic([]);actor.syncChanges()}continue}if(actor.graphics()[0]!==nativeSheet.id)actor.setGraphic(nativeSheet.id);void actor.teleport({x:Math.round(nativeFrame.foot.x),y:Math.round(nativeFrame.foot.y)});const animation=nativeCrabAnimation(nativeFrame);if(actor.animationName()!==animation)actor.animationName.set(animation);actor.syncChanges();continue}
     const visual=animalProjection.visuals.find(v=>v.id===e.id),state=animalStates.find(a=>a.id===e.id);
     if(!visual||!state){if(actor.graphics().length){actor.setGraphic([]);actor.syncChanges()}continue}
     const graphic='animal-'+state.visualVersion;if(actor.graphics()[0]!==graphic)actor.setGraphic(graphic);
     void actor.teleport(visual.foot);const animation=animalAnimation(state);if(actor.animationName()!==animation)actor.animationName.set(animation);actor.syncChanges();
    }
    animalUiTick+=dt;if(animalUiTick>.08){animalUiTick=0;setAnimalTargets(memoryTargets)}
    let near:Entity|null=null,best=113,nearPriority=2;
    for(const e of [...rooms[id].entities.filter(e=>!e.animalId&&!(candidateEnabled()&&internalPassage(id,e.destination))),...extraEntities(id),...memoryTargets]){if(!active(id,e))continue;if(e.destination?.startsWith('workshop-annex-')&&!latest.current.flags.includes(e.destination))continue;const at=actorPositions.get(id+'/'+e.id)??e.at,dist=Math.hypot(p.x+8-at.x,p.y+6-at.y);const priority=e.id.startsWith('land-candidate:')||e.person&&neighborPartyActive(latest.current)&&latest.current.neighborChapterV1?.party?.people.includes(e.person)?0:1;if(dist<(e.animalId===nativeCrabId||e.animalId?.startsWith('harbor-gull-')?113:65)&&(priority<nearPriority||priority===nearPriority&&dist<best)){best=dist;nearPriority=priority;near={...e,at:{...at},approach:e.person?{x:at.x-8,y:at.y+42}:e.approach}}const button=host.current?.querySelector<HTMLElement>(`[data-target="${e.id}"]`),q=space.current?.project(e.passage?{x:e.passage.sign.x,y:e.passage.sign.y-56}:{x:at.x,y:at.y-(e.landPlot&&latest.current.lifePlants?78:e.landRegion&&e.landAt?48:e.kind==='person'?70:e.kind==='portal'&&!rooms[id].outdoor?86:32)});if(button&&q){if(dist<190&&e.kind==='portal'){const safe=layout.insets(),w=host.current!.clientWidth,h=host.current!.clientHeight,halfW=button.offsetWidth/2,halfH=button.offsetHeight/2;q.x=Math.max(safe.left+halfW,Math.min(w-safe.right-halfW,q.x));q.y=Math.max(safe.top+halfH,Math.min(h-safe.bottom-halfH,q.y))}button.style.transform=`translate(${q.x}px,${q.y}px) translate(-50%,-50%)`;if(e.animalId){button.dataset.animalFootX=String(at.x);button.dataset.animalFootY=String(at.y)}button.dataset.near=String(dist<65);button.dataset.readable=String(dist<190)}}
    const nearKey=near?near.id+':'+near.label.join(':')+':'+near.at.x.toFixed(1)+':'+near.at.y.toFixed(1)+':'+near.actions?.join(',')+(near.dogRoutine?':dog:'+near.dogRoutine:''):'';if(lastNear!==nearKey){lastNear=nearKey;latest.current.onNear(near)}
   }});
   engine.current=created;
  }).catch(e=>{if(live)setError(String(e))});
  return()=>{live=false;created?.dispose?.();engine.current=null;space.current=null;handle.current=null;clearTimeout(landOverlayTimer);layout.dispose()};
 },[]);
 useEffect(()=>{space.current?.pause(paused);if(paused)summerAudio.stopSteps()},[paused]);
 useEffect(()=>{summerAudio.stopSteps();return()=>summerAudio.stopSteps()},[scene]);
 useEffect(()=>{const r=space.current;if(!r)return;let live=true;const previous= samePhysical.current;const continuous=!!samePhysical.current&&samePhysical.current!==scene&&internalPassage(samePhysical.current,scene);if(!continuous){setReady(false);onRenderReady(false)}onNear(null);setAnimalTargets([]);if(!samePhysical.current||!internalPassage(samePhysical.current,scene)){animalsRuntime.current.reset();dogRuntime.current.reset()}samePhysical.current=scene;if(dynamicAssets)r.installSpritesheets(dynamicAssets.sheets);restores.current=restores.current.catch(()=>{}).then(async()=>{if(!live)return;await r.restore(scene,start);const facing=arrivalFacing(previous??undefined,scene,start);if(live&&facing)r.face(facing);if(live&&!failed.current){setReady(true);onRenderReady(true)}}).catch(e=>{if(live)setError(String(e))});return()=>{live=false}},[scene,journeyId,dynamicAssets]);
 return <div ref={host} className="harbor-world" data-daylight="candidate" data-weather-kind={weather} data-land-selecting={!!landSelecting} data-period={rooms[scene].outdoor?townPeriod({townMinutes}):'indoor'} onClick={e=>{if(!space.current||!(e.target instanceof HTMLCanvasElement||e.target===e.currentTarget))return;const b=e.currentTarget.getBoundingClientRect();const at=space.current.toWorld({x:e.clientX-b.x,y:e.clientY-b.y});landClick(at,landSelecting,paused,onLandPick,p=>space.current!.walkTo(p))}}>{shorePreview&&shorePreview.scene===scene&&<div className="harbor-shore-preview" data-shore-preview data-shore-cast-x={shorePreview.target.x} data-shore-cast-y={shorePreview.target.y} aria-hidden="true"><svg width="20" height="20" aria-hidden="true"><defs><mask id={shoreMaskId} maskUnits="userSpaceOnUse"><rect fill="white"/><g data-shore-exclusions fill="black"/></mask></defs><g mask={`url(#${shoreMaskId})`}><line x1="10" y1="10"/><circle cx="10" cy="10" r="8"/></g></svg><span data-shore-caption>{tx(['抛竿落点','Cast landing'],locale)}</span></div>}<WeatherLayer kind={weather} quality={weatherQuality} outdoor={rooms[scene].outdoor} paused={paused} decorations={decorations} storm={storm} heavyRain={heavyRain} flashCue={weatherFlashCue} onFlash={onWeatherFlash} reduceFlashes={reduceFlashes} reduceMotion={weatherReducedMotion}/>{landSelecting&&landRegion(landSelecting)&&<div className="harbor-land-outline" data-land-rect={JSON.stringify(landRegion(landSelecting)!.rect)}/>} {landCandidate&&landRegion(landCandidate.region)?.scene===scene&&<div className="harbor-land-outline harbor-land-outline--candidate" data-land-rect={JSON.stringify(landFootprint(landCandidate.at))}/>}{authoredLights(scene).map(light=><div key={light.id} className="harbor-authored-light" data-light-id={light.id} data-world-x={light.x} data-world-y={light.y} data-light-width={light.width} aria-hidden="true"/>)}{scene==='garden'&&plotIds.map(id=>{const e=rooms.garden.entities.find(e=>e.id===id)!,p=plotStatus({plots,townMinutes,flags,items:{},cash:0,energy:0},id);return <div key={id} className="harbor-crop-bed" data-crop-art={cropArtStage({plots,townMinutes,flags,items:{},cash:0,energy:0},id)?.key} data-world-x={e.at.x} data-world-y={e.at.y} data-stage={!p?'empty':p.ready?'ready':p.needsWater?'dry':'growing'}><span>{id.slice(-1)}</span></div>})}{scene==='cafe'&&flags.includes('terrace-fixed')&&<div className="harbor-lantern-glow"/>}<div id="rpg" aria-label={tx(titles[scene]??rooms[scene].title,locale)}/>{[...rooms[scene].entities.filter(e=>!e.animalId),...fishingWaypoints(scene),...mintEntities(scene),...(landEnabled?landEntities({scene,landV1},landCandidate).map(e=>plantLabel(e,lifePlants)):[]),...animalTargets].filter(e=>!(candidateEnabled()&&internalPassage(scene,e.destination))&&(e.id!=='visitor-note'||flags.includes('news:checked'))&&presentEntity({townMinutes,flags,scene,neighborChapterV1},e)&&(!e.destination?.startsWith('workshop-annex-')||flags.includes(e.destination))).map(e=><button key={e.id} className={'harbor-target harbor-target--'+e.kind+(e.animalId?' harbor-target--animal':'')+(e.passage?' harbor-target--trail':'')+(e.landRegion?' harbor-target--land':'')+(e.id.startsWith('fishing-')?' harbor-target--fishing':'')+(lifePlants&&e.landRegion&&!e.landAt&&landV1?.permissions[e.landRegion]?' harbor-target--land-icon':'')} data-target={e.id} data-dog-routine={e.dogRoutine} onClick={()=>handle.current?.approach(e)} aria-label={tx(titles[e.destination??'']??entityLabel(e,flags),locale)}>{e.id.startsWith('fishing-')?<span>{tx(e.label,locale)}</span>:e.landRegion?(lifePlants&&!e.landAt&&landV1?.permissions[e.landRegion]?<Icon name="map"/>:<span>{tx(e.label,locale)}</span>):e.kind==='portal'?tx(titles[e.destination??'']??entityLabel(e,flags),locale):e.kind==='person'?<span className="harbor-target__dot"/>:<span className="harbor-target__dot"/>}</button>)}{(!ready||error)&&<div className="harbor-loading"><p>{error?tx(['场景未能载入','The scene could not load'],locale):tx(['正在抵达…','Arriving…'],locale)}</p>{error&&onRetry&&<button onClick={onRetry}>{tx(['重新连接','Reconnect'],locale)}</button>}</div>}</div>
}
