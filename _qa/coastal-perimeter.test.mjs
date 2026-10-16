import test from 'node:test';
import assert from 'node:assert/strict';
import {coastalMaterialAt} from '../src/world/coastal-material-field.ts';
import {structuralContactPlan} from '../src/world/structural-contact-plan.ts';
import {COASTAL} from '../src/candidate/continuity.ts';

// These are the visible source ownership crops in render-adapter. A structural
// material change across their perimeter has water/ground visible on both
// sides, so it needs an authored contact; standalone maps fill their camera.
const crops=[
 {x:0,y:0,w:1280,h:805},
 {x:70,y:805,w:1210,h:933},
 {x:1235,y:140,w:1365,h:1088},
 {x:0,y:0,w:2600,h:1744},
];
const structural=new Set(['stone/water','water/wood','stone/wood','grass/wood']);
const pair=(a,b)=>[a,b].sort().join('/');

test('every visible coastal source-crop structural perimeter has a seam',()=>{
 const plan=structuralContactPlan(COASTAL).filter(p=>p.kind==='seam');
 const contacts=new Map();
 for(const crop of crops){
  const {x,y,w,h}=crop;
  for(const [axis,edge,start,end] of [
   ['x',x,y,y+h],['x',x+w,y,y+h],['y',y,x,x+w],['y',y+h,x,x+w]
  ])for(let along=start;along<end;along++){
   const a=axis==='x'?coastalMaterialAt(edge-.5,along+.5):coastalMaterialAt(along+.5,edge-.5);
   const b=axis==='x'?coastalMaterialAt(edge+.5,along+.5):coastalMaterialAt(along+.5,edge+.5);
   if(!structural.has(pair(a,b)))continue;
   const spot=axis==='x'?{x:edge,y:along+.5}:{x:along+.5,y:edge};
   contacts.set(`${axis}:${edge}:${along}`,{axis,edge,along,a,b});
   assert.ok(plan.some(p=>p.seam.axis===axis&&(axis==='x'?p.rect.x+16===edge&&spot.y>=p.rect.y&&spot.y<p.rect.y+p.rect.h:p.rect.y+16===edge&&spot.x>=p.rect.x&&spot.x<p.rect.x+p.rect.w)),`missing structural perimeter ${axis}=${edge}, along=${along}, ${a}/${b}`);
  }
 }
 assert.equal(contacts.size,230); // north 110px + west 120px; no other source-crop structural exits
});
