import {type TerrainPatch} from './outdoors';
import {coastalMaterialAt} from './coastal-material-field';
import {coastalContactRects} from './coastal-contact-plan';
import {terrainSeams,seamPair} from './terrain-seam-plan';
import {COASTAL} from '../candidate/continuity';
import type {Rect} from '../engine/world';

type Material=TerrainPatch['material'];
export type TerrainContact={scene?:string;field?:'coastal-2d';rect:Rect;axis:'x'|'y';negative:Material;positive:Material;native:'grass-dirt'|'dirt-water'|'grass-water'};
const cache=new Map<string,TerrainContact[]>();
// Natural shoreline and beach transitions take native cuts. Structural pairs
// are inventoried by terrainSeams but cannot enter this renderer without
// dedicated quay, pier and dry-join art plus three-material corner review.
const eligible=(id:string,a:Material,b:Material)=>{
 const p=seamPair(a,b);return p==='sand/stone'||p==='sand/water'||p==='grass/water'||p==='grass/sand'&&!['hill','camp'].includes(id);
};
const native=(a:Material,b:Material):TerrainContact['native']=>a==='water'||b==='water'?(a==='grass'||b==='grass'?'grass-water':'dirt-water'):'grass-dirt';

/** Every visible top-material contact omitted by the existing road atlas.
 * Only paint: do not extend patches, collision, portal or saved coordinates. */
export function terrainContacts(scene:string):TerrainContact[]{
 const prior=cache.get(scene);if(prior)return prior;
 const out:TerrainContact[]=terrainSeams(scene).filter(e=>eligible(e.zone,e.negative,e.positive)).map(e=>({rect:e.rect,axis:e.axis,negative:e.negative,positive:e.positive,native:native(e.negative,e.positive)}));
 if(scene===COASTAL){
  // Keep built sand/stone treatment. All natural contacts, including bitmap
  // ownership cuts, are found from the same world field rather than seam IDs.
  for(let i=out.length-1;i>=0;i--)if([out[i].negative,out[i].positive].every(m=>['grass','sand','water'].includes(m)))out.splice(i,1);
  for(const rect of coastalContactRects(coastalMaterialAt,{x:0,y:0,w:2600,h:1744}))out.push({scene,field:'coastal-2d',rect,axis:'y',negative:'water',positive:'sand',native:'dirt-water'});
 }
 for(const edge of out)edge.scene=scene;
 cache.set(scene,out);return out;
}
