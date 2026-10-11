import artFile from './native-dog-art.json';
import geometryFile from './display-space-geometry.json';
import {profiles} from './config';
import {createAnimalRuntime} from './behavior';
import {previewClear,type Geometry,type PreviewContext} from './display-space';
import {bodyAt} from './spatial';
import {prepareDogFamily} from './dog-admission';
import {nativeDogRoutine} from './native-dog-observation';
import type {AnimalArt} from './render-contract';
import type {AnimalDef,AnimalState,Context,Slot} from './types';
import type {Point} from '../engine/world';
// New authored caretaker fiction. Mara is an existing resident; the dog is not
// player-owned. Night stays absent until separate rest/sleep art is admitted.
export const nativeDogId='harbor-dog-1';
const slot=(scene:string,point:Point,region:Slot['region']):Slot=>({scene,region,points:[point],activity:'follow'});
export const nativeDogDef:AnimalDef={id:nativeDogId,species:'dog',visualVersion:'street-dog-native-walk-v1',ownerId:'mara',schedule:{
 morning:slot('station',{x:635,y:710},{x:480,y:600,w:250,h:240}),
 afternoon:slot('courtyard',{x:435,y:535},{x:260,y:400,w:260,h:200}),
 evening:slot('market',{x:635,y:695},{x:465,y:590,w:265,h:160}),
}};
export const nativeDogProfile={...profiles.dog,collision:{w:52,h:34}};
export const nativeDogEnvelope={x:-25,y:-46,w:51,h:46};
const prepared=prepareDogFamily(artFile as AnimalArt,nativeDogDef);
if(!prepared)throw Error('NATIVE_DOG_NOT_ADMITTED');
export const nativeDogSheet=prepared.sheet;
export const nativeDogBody=(p:Point)=>bodyAt(p,nativeDogProfile);
export const nativeDogEntities=(scene:string)=>Object.values(nativeDogDef.schedule).filter(s=>s.scene===scene).map(s=>({id:nativeDogId,animalId:nativeDogId,kind:'object' as const,label:['狗','Dog'] as [string,string],at:{...s.points[0]},approach:{x:s.points[0].x-8,y:s.points[0].y+50},actions:[]}));
/** Live visual and interaction coordinates share one admitted foot. Read-only:
 * no dog relationship/feeding/commission command is introduced by this target. */
export function nativeDogTargets(states:readonly AnimalState[],scene:string){
 return states.filter(s=>s.id===nativeDogId&&s.visible&&s.scene===scene).map(s=>({id:nativeDogId,animalId:nativeDogId,kind:'object' as const,label:['狗','Dog'] as [string,string],at:{...s.foot},approach:{x:s.foot.x-8,y:s.foot.y+50},actions:[],dogRoutine:nativeDogRoutine(s)}));
}
export const nativeDogObservationText=['这只狗待在照看它的人附近。给它留出一些空间，静静看看。','The dog stays near its caretaker. Leave it some room and take a quiet look.'] as [string,string];
/** Native measured ground plus full visual protection, independent of the frozen
 * seven-animal roster/geometry consumed by the already published crab. */
export function createNativeDogRuntime(){
 let old:readonly AnimalState[]=[],cache=new WeakMap<Context,PreviewContext>();
 const runtime=createAnimalRuntime([nativeDogDef],{profiles:{dog:nativeDogProfile},holdOccupied:true,preserveVisibleSlot:true,displayClear:(p,slot,ctx)=>{
  let input=cache.get(ctx);if(!input){input={context:ctx,states:old,geometry:geometryFile as unknown as Geometry};cache.set(ctx,input)}
  return previewClear(p,slot.scene,slot.region,nativeDogEnvelope,input);
 }});
 return {reset(){runtime.reset()},tick(dt:number,context:Context,oldStates:readonly AnimalState[],introduced:boolean){
  old=oldStates;cache=new WeakMap();const states=runtime.tick(dt,context);
  return states.map(s=>({...s,visible:s.visible&&introduced&&!!context.people.mara&&context.people.mara.scene===s.scene}));
 }};
}
