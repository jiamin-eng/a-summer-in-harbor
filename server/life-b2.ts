import {ContentRegistry} from '../src/life/registry';
import {createLifeRuntime,type LifeHost} from './life-runtime';
import {createInventoryLifeHost,inventoryLifeActions} from './life-inventory-host';
import {lifeView} from './life-view';
import {landGeometry,landRegion,landEntity,landWorld,landPreview,landPoint} from '../src/life/land';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {walkable} from '../src/engine/world';
import {compileSpatialBinding} from '../src/engine/spatial-binding';
import {GAME_UUID} from '../src/game-id';
import {rooms} from '../src/world/data';
import type {createRuntime} from './runtime';
import type {ContentRef} from '../src/life/types';
import {landBedIds} from '../src/life/land-contract';

/** Explicit fixed assembly; no accept-all host or new auth. */
export function createLifeB2(base:ReturnType<typeof createRuntime>,registry=new ContentRegistry(),plants?:{ref:ContentRef;newStarts:boolean},plantHost?:LifeHost,options:{expansionStarts?:boolean}={expansionStarts:true}){
 const inventory=createInventoryLifeHost();
 const host:LifeHost={admit(s,a,c){
  if(inventoryLifeActions.includes(a.action as any))return inventory.admit(s,a,c);
  if(c.verb!=='permit-land'&&c.verb!=='cultivate'&&c.verb!=='expand-land'&&c.verb!=='clear-bed'){
   if(plants&&plantHost)return plantHost.admit(s,a,c);
   throw Error('LIFE_SPATIAL_NOT_ADMITTED');
  }
  const bed=c.verb==='clear-bed'?s.landV1?.plots.find(p=>p.id===c.plot):undefined;
  if(c.verb==='clear-bed'&&!bed)throw Error('LAND_BED_MISSING');
  const region=c.verb==='clear-bed'?bed!.region:c.region;
  const r=landRegion(region);if(!r||r.scene!==s.scene||!s.visited.includes(s.scene))throw Error('LAND_SCENE');
  if(plants&&c.verb==='cultivate'){
   const next=landBedIds(s.landV1).map(id=>id.slice(-1)).find(n=>!s.landV1?.plots.some(p=>p.id==='land-bed-'+n));
   if(next&&s.lifeV1?.plots['life-bed-'+next])throw Error('ARCHIVED_PLOT_NEEDS_BINDING');
  }
  if(c.verb==='cultivate'){const error=landGeometry(s,c.region,c.at,a.position);if(error)throw Error(error)}
  const e=c.verb==='clear-bed'?{...landEntity(r.id,bed!.at),id:bed!.id}:landEntity(r.id,c.verb==='cultivate'?c.at:undefined);if(a.target!==e.id)throw Error('LAND_TARGET');
  const w=landWorld(dynamicWorld(s.flags,true),s.landV1),rule=s.scene+'/'+e.id+'/'+a.action;
  const binding=compileSpatialBinding({id:GAME_UUID,initialMap:[{id:s.scene,current:true}],characters:[],domainRules:{rules:[{id:rule,effects:[]}]}},{version:1,cartridgeId:GAME_UUID,mapVersion:'harbor-land-v1',actionScope:'scene',interactionDistance:75,scenes:[{id:s.scene,spawn:rooms[s.scene].spawn}],entities:[{id:e.id,scene:s.scene,position:{x:e.at.x-8,y:e.at.y-6},approach:e.approach,states:['present'],actions:[rule]}],characters:[],portals:[]},(scene,p)=>walkable(w,scene,p));
  if(!binding.admits(rule,e.id,s.scene,a.position))throw Error('TOO_FAR');
  binding.assertTransition({cartridgeId:GAME_UUID,map:[{id:s.scene,current:true}],characters:[]},{cartridgeId:GAME_UUID,map:[{id:s.scene,current:true}],characters:[]},rule,s.scene);
  return {scene:s.scene,target:e.id,land:{region:r.id,geometryRevision:1,position:{...a.position},expansionAllowed:options.expansionStarts!==false}};
 }};
 const lifeRuntime=createLifeRuntime(base,registry,host);
 const assembledRuntime=plants?{...lifeRuntime,async prepare(...args:Parameters<typeof lifeRuntime.prepare>){
  const result=await lifeRuntime.prepare(...args);
  if(args[1].action==='life:cultivate'){
   result.text=['菜畦已经开好。带一包可用种子来播种，然后浇水。','Your bed is ready. Bring an available seed packet, plant it, then water it.'];
   result.head.history.at(-1)!.text=result.text;
  }
  return result;
 }}:lifeRuntime;
 return {runtime:assembledRuntime,lifeProject:(s:any)=>lifeView(s,registry,plants),landProject:(s:any,q:URLSearchParams)=>{
  const region=q.get('region')??'',x=q.get('x'),y=q.get('y');if([...q.keys()].some(k=>!['region','x','y'].includes(k))||((x===null)!==(y===null)))throw Error('INVALID_LAND_PREVIEW');
  const at=x===null?undefined:{x:Number(x),y:Number(y)};if(at&&!landPoint(at))throw Error('INVALID_LAND_PREVIEW');const preview=landPreview(s,region,at,options.expansionStarts!==false);
  const next=landBedIds(s.landV1).map(id=>id.slice(-1)).find(n=>!s.landV1?.plots.some((p:any)=>p.id==='land-bed-'+n));
  if(plants&&next&&s.lifeV1?.plots['life-bed-'+next])return {...preview,reason:'ARCHIVED_PLOT_NEEDS_BINDING',canConfirm:false};
  return preview;
 }};
}
