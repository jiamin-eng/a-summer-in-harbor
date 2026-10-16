import stoneWater from './terrain-contact-native/stone-water.tilemap.json';
import woodWater from './terrain-contact-native/wood-water.tilemap.json';
import stoneWood from './terrain-contact-native/stone-wood.tilemap.json';
import grassWood from './terrain-contact-native/grass-wood.tilemap.json';
import junctionMap from './terrain-contact-native/three-material-junctions.tilemap.json';
import {terrainSeams,terrainJunctions,seamPair,type TerrainSeam,type TerrainJunction} from './terrain-seam-plan';
import {coastalMaterialAt} from './coastal-material-field';
import {outdoors,type TerrainPatch} from './outdoors';
import {terrainAt} from './road-boundaries';
import {COASTAL,localPoint} from '../candidate/continuity';
import type {Rect} from '../engine/world';
import type {PixelTile} from './coastal-adjacency';

type Material=TerrainPatch['material'];
export type StructuralAtlas='stone-water'|'wood-water'|'stone-wood'|'grass-wood'|'three-material-junctions';
type PairMap={A:Material;B:Material;cells:{name:string;index:number;quadrantsClockwiseNW:Material[]|null}[]};
const pairs:Record<string,{atlas:StructuralAtlas;map:PairMap}>={
 'stone/water':{atlas:'stone-water',map:stoneWater as PairMap},
 'water/wood':{atlas:'wood-water',map:woodWater as PairMap},
 'stone/wood':{atlas:'stone-wood',map:stoneWood as PairMap},
 'grass/wood':{atlas:'grass-wood',map:grassWood as PairMap},
};
export type StructuralPiece={kind:'seam'|'junction';rect:Rect;atlas:StructuralAtlas;index:number;zone:string;seam?:TerrainSeam;junction?:TerrainJunction};
const planCache=new Map<string,StructuralPiece[]>();
const gapsCache=new Map<string,TerrainJunction[]>();
const mod=(n:number,d:number)=>((n%d)+d)%d;
const field=(scene:string,zone:string,x:number,y:number):Material|undefined=>scene===COASTAL?coastalMaterialAt(x,y):terrainAt(outdoors[zone],localPoint(zone,{x,y}));
const quadrants=(scene:string,j:TerrainJunction)=>[[ -.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([dx,dy])=>field(scene,j.zone,j.at.x+dx,j.at.y+dy));
const junctionCell=(j:TerrainJunction):{atlas:StructuralAtlas;index:number}|undefined=>{
 const q=j.quadrants.join(',');
 if(j.materials.length>=3){
  const built=j.materials.includes('wood')||j.materials.includes('stone')&&j.materials.includes('water');
  if(!built)return;
  const cell=(junctionMap.mapping as Record<string,{index:number}>)[q];
  if(!cell)return;
  return {atlas:'three-material-junctions',index:cell.index};
 }
 const pair=pairs[seamPair(j.materials[0],j.materials[1])];if(!pair)return;
 const cell=pair.map.cells.find(c=>c.quadrantsClockwiseNW?.join(',')===q);
 if(!cell)throw Error('STRUCTURAL_CORNER_ART_MISSING:'+pair.atlas+':'+q);
 return {atlas:pair.atlas,index:cell.index};
};

/** Honest hold list for visible three-material topology absent from the
 * delivered atlas; a caller must not substitute a natural two-pair mask. */
export function structuralArtGaps(scene:string):TerrainJunction[]{
 const cached=gapsCache.get(scene);if(cached)return cached;
 const gaps=terrainJunctions(scene).filter(j=>j.materials.length>=3&&(j.materials.includes('wood')||j.materials.includes('stone')&&j.materials.includes('water'))&&!(junctionMap.mapping as Record<string,unknown>)[j.quadrants.join(',')]);
 gapsCache.set(scene,gaps);return gaps;
}

/** Plan the exact delivered pair/corner art in final world coordinates.
 * Coast source-bitmap ownership is checked before admitting a junction and
 * again for each pixel during composition. No collision/save input changes. */
export function structuralContactPlan(scene:string):StructuralPiece[]{
 const cached=planCache.get(scene);if(cached)return cached;
 const joints:StructuralPiece[]=[],seen=new Set<string>();
 for(const j of terrainJunctions(scene)){
  const cell=junctionCell(j);if(!cell)continue;
  if(quadrants(scene,j).join(',')!==j.quadrants.join(','))continue;
  const key=j.at.x+':'+j.at.y+':'+j.quadrants.join(',');if(seen.has(key))continue;seen.add(key);
  joints.push({kind:'junction',rect:{x:j.at.x-20,y:j.at.y-20,w:40,h:40},atlas:cell.atlas,index:cell.index,zone:j.zone,junction:j});
 }
 const seams:StructuralPiece[]=[];
 for(const e of terrainSeams(scene)){
  const pair=pairs[seamPair(e.negative,e.positive)];if(!pair)continue;
  const towardsB=pair.map.A===e.negative&&pair.map.B===e.positive;
  const direction=e.axis==='x'?(towardsB?'E':'W'):(towardsB?'S':'N');
  const cell=pair.map.cells.find(c=>c.name===direction);
  if(!cell)throw Error('STRUCTURAL_STRAIGHT_ART_MISSING:'+pair.atlas+':'+direction);
  seams.push({kind:'seam',rect:e.rect,atlas:pair.atlas,index:cell.index,zone:e.zone,seam:e});
 }
 const result=[...seams,...joints];planCache.set(scene,result);return result;
}

/** Render small contact canvases. A junction replaces all straight pixels in
 * its 40px window; overlapping junctions give each pixel to the nearest
 * matching center. Both source material ownership and atlas alpha survive. */
export function composeStructuralPiece(scene:string,piece:StructuralPiece,all:StructuralPiece[],atlases:Record<StructuralAtlas,PixelTile>):Uint8ClampedArray{
 const {rect,atlas,index}=piece,source=atlases[atlas],out=new Uint8ClampedArray(rect.w*rect.h*4);
 if(source.width!==200||source.height!==200)throw Error('STRUCTURAL_ATLAS_SIZE:'+atlas);
 const joints=all.filter(p=>p.kind==='junction');
 const pending=structuralArtGaps(scene).map(j=>({x:j.at.x-20,y:j.at.y-20,w:40,h:40}));
 const edge=piece.seam?(piece.seam.axis==='x'?rect.x+16:rect.y+16):0;
 for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){
  const gx=rect.x+x,gy=rect.y+y,p={x:gx+.5,y:gy+.5};let sx:number,sy:number;
  if(piece.kind==='seam'){
   const e=piece.seam!;
   if(joints.some(j=>p.x>=j.rect.x&&p.x<j.rect.x+40&&p.y>=j.rect.y&&p.y<j.rect.y+40)||pending.some(r=>p.x>=r.x&&p.x<r.x+40&&p.y>=r.y&&p.y<r.y+40))continue;
   const a=e.axis==='x'?field(scene,e.zone,edge-.5,p.y):field(scene,e.zone,p.x,edge-.5);
   const b=e.axis==='x'?field(scene,e.zone,edge+.5,p.y):field(scene,e.zone,p.x,edge+.5);
   if(a!==e.negative||b!==e.positive)continue;
   sx=e.axis==='x'?gx-edge+20:mod(gx,40);
   sy=e.axis==='y'?gy-edge+20:mod(gy,40);
  }else{
   const j=piece.junction!;
   const q=j.quadrants[gy<j.at.y?(gx<j.at.x?0:1):(gx<j.at.x?3:2)];
   if(field(scene,j.zone,p.x,p.y)!==q)continue;
   const distance=(other:StructuralPiece)=>(p.x-(other.junction!.at.x))**2+(p.y-(other.junction!.at.y))**2;
   if(joints.some(other=>other!==piece&&p.x>=other.rect.x&&p.x<other.rect.x+40&&p.y>=other.rect.y&&p.y<other.rect.y+40&&distance(other)<distance(piece)))continue;
   sx=x;sy=y;
  }
  const si=((Math.floor(index/5)*40+sy)*200+index%5*40+sx)*4,di=(y*rect.w+x)*4;
  if(source.data[si+3])out.set(source.data.slice(si,si+4),di);
 }
 return out;
}
