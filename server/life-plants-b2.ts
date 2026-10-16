import {ContentRegistry,snapPeaDefinition,definitionHash} from '../src/life/registry';
import definition from '../src/life/snap-pea-v2.json';
import art from '../src/world/snap-pea-art.json';
import {sameRef} from '../src/life/save';
import {isLifeBed} from '../src/life/land-contract';
import type {CropDefinition,ContentRef} from '../src/life/types';
import {landEntities,landRegion,landWorld} from '../src/life/land';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {walkable} from '../src/engine/world';
import {compileSpatialBinding} from '../src/engine/spatial-binding';
import {rooms} from '../src/world/data';
import {GAME_UUID} from '../src/game-id';
import {createLifeB2} from './life-b2';
import type {createRuntime} from './runtime';

export const snapPeaV2=definition as unknown as CropDefinition;
export const snapPeaV2Ref=art.ref as ContentRef;
if(definitionHash(snapPeaV2)!==snapPeaV2Ref.hash)throw Error('PLANT_ADMISSION_HASH');
/** Explicit fixed @2 assembly; candidate public.ts uses the same authority. No AI adoption API.
 * Disabling starts retains both definitions and all old settlement paths. */
export function createPlantsRegistry(newStarts=true){
 class PlantsRegistry extends ContentRegistry{
  override canStart(ref:ContentRef){this.get(ref);return this.isLegacy(ref)||(newStarts&&sameRef(ref,snapPeaV2Ref))}
 }
 return new PlantsRegistry([snapPeaDefinition,snapPeaV2]);
}
export function createLifePlantsB2(base:ReturnType<typeof createRuntime>,newStarts=true,landOptions?:{expansionStarts?:boolean}){
 const registry=createPlantsRegistry(newStarts);
 return createLifeB2(base,registry,{ref:snapPeaV2Ref,newStarts}, {admit(s,a,c){
  let entity;
  let plot:string|undefined;
  if(c.verb==='buy-seed'||c.verb==='sell'){
   registry.get(c.ref);
   // Legacy definitions keep their existing authored action route.
   if(c.ref.id!=='crop:snap-pea')throw Error('USE_AUTHORED_COUNTER');
   entity=rooms[s.scene].entities.find(e=>e.id==='crop-counter');
   if(!entity)throw Error('SHOP_ADMISSION_REQUIRED');
  }else if(c.verb==='plant'||c.verb==='water'||c.verb==='harvest'){
   plot=c.plot;
   if(!isLifeBed(plot,s.landV1))throw Error('PLOT_ADMISSION_REQUIRED');
   const id=plot.replace('life-','land-');
   const bed=s.landV1?.plots.find(p=>p.id===id);
   if(!bed||landRegion(bed.region)?.scene!==s.scene)throw Error('PLOT_ADMISSION_REQUIRED');
   entity=landEntities(s).find(e=>e.id===id);
  }else throw Error('LIFE_SPATIAL_NOT_ADMITTED');
  if(!entity||a.target!==entity.id||!s.visited.includes(s.scene))throw Error('LIFE_TARGET');
  const rule=s.scene+'/'+entity.id+'/'+a.action,w=landWorld(dynamicWorld(s.flags,true),s.landV1);
  const binding=compileSpatialBinding({id:GAME_UUID,initialMap:[{id:s.scene,current:true}],characters:[],domainRules:{rules:[{id:rule,effects:[]}]}},{version:1,cartridgeId:GAME_UUID,mapVersion:'harbor-plants-b2-v1',actionScope:'scene',interactionDistance:75,scenes:[{id:s.scene,spawn:rooms[s.scene].spawn}],entities:[{id:entity.id,scene:s.scene,position:{x:entity.at.x-8,y:entity.at.y-6},approach:entity.approach,states:['present'],actions:[rule]}],characters:[],portals:[]},(scene,p)=>walkable(w,scene,p));
  if(!binding.admits(rule,entity.id,s.scene,a.position))throw Error('TOO_FAR');
  binding.assertTransition({cartridgeId:GAME_UUID,map:[{id:s.scene,current:true}],characters:[]},{cartridgeId:GAME_UUID,map:[{id:s.scene,current:true}],characters:[]},rule,s.scene);
  return {scene:s.scene,target:entity.id,...(plot?{plot,cultivated:true}:{})};
 }},landOptions);
}
