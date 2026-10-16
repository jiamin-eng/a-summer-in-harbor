import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readPNG} from './coastal/png.mjs';
import {structuralContactPlan,structuralArtGaps,composeStructuralPiece} from '../src/world/structural-contact-plan.ts';
import {outdoors,waterBarriers} from '../src/world/outdoors.ts';
import {world,rooms} from '../src/world/data.ts';

const source='src/world/terrain-contact-native/';
const expected={
 'stone-water':'ddbf907683e11a8d9f99c0934a65ac06f3b5a26b007b83e2730d050cd7a3a9fa',
 'wood-water':'72599acb482e2738c8365c0490c36702baad0dc4cf6e574c6ae8f9ab666d2713',
 'stone-wood':'11a5f53c57f06f4767f8c03cfdacd139646cf95b902713a459a1d639efb913c6',
 'grass-wood':'78b233560ebbffc833ac50f121ff09ddef386006266095f4753e65623a070077',
 'three-material-junctions':'246041ae4fa9e5f7d84a7efc99cc8ce3aebbbd2065da60f8f6bb40f0a8b22cb5',
};
const hash=b=>createHash('sha256').update(b).digest('hex');
const atlases=Object.fromEntries(Object.entries(expected).map(([name,sha])=>{
 const bytes=readFileSync(source+name+'.png');assert.equal(hash(bytes),sha,name+' consumer hash');
 const pixels=readPNG(source+name+'.png');assert.deepEqual([pixels.width,pixels.height],[200,200]);
 return[name,pixels];
}));

test('each built scene has authored, nonempty contact and junction pixels',()=>{
 for(const [scene,minPieces] of [['harbor',38],['dock',15],['coast-beach-path',19]]){
  const plan=structuralContactPlan(scene),live=plan.map(p=>({p,pixels:composeStructuralPiece(scene,p,plan,atlases)})).filter(({pixels})=>pixels.some((v,i)=>i%4===3&&v));
  assert.ok(live.length>=minPieces,scene+' visible pieces');
  assert.ok(live.some(({p})=>p.atlas==='three-material-junctions'),scene+' has an authored three-way');
  for(const {p,pixels} of live.filter(({p})=>p.kind==='seam')){
   for(let y=0;y<p.rect.h;y++)for(let x=0;x<p.rect.w;x++){
    const gx=p.rect.x+x+.5,gy=p.rect.y+y+.5;
    if(plan.some(j=>j.kind==='junction'&&gx>=j.rect.x&&gx<j.rect.x+40&&gy>=j.rect.y&&gy<j.rect.y+40))
     assert.equal(pixels[(y*p.rect.w+x)*4+3],0,scene+' straight shadow under junction');
   }
  }
 }
});

test('existing road and natural-only scenes have no added structural layer',()=>{
 for(const scene of ['station','market-bazaar','hill','garden','camp','courtyard'])assert.equal(structuralContactPlan(scene).length,0,scene);
});

test('coast source-crop exits are inventoried and four missing corner signatures remain explicit HOLD',()=>{
 const plan=structuralContactPlan('coast-beach-path'),gaps=structuralArtGaps('coast-beach-path');
 assert.deepEqual(gaps.map(j=>j.at),[{x:40,y:415},{x:40,y:535},{x:495,y:80},{x:605,y:80}]);
 assert.ok(plan.some(p=>p.kind==='seam'&&p.rect.x===479&&p.rect.y===0));
 assert.ok(plan.some(p=>p.kind==='seam'&&p.rect.y===399&&p.rect.x===0));
 for(const piece of plan.filter(p=>p.kind==='seam')){
  const pixels=composeStructuralPiece('coast-beach-path',piece,plan,atlases);
  for(const gap of gaps)for(let y=0;y<piece.rect.h;y++)for(let x=0;x<piece.rect.w;x++){
   const gx=piece.rect.x+x+.5,gy=piece.rect.y+y+.5;
   if(Math.abs(gx-gap.at.x)<20&&Math.abs(gy-gap.at.y)<20)assert.equal(pixels[(y*piece.rect.w+x)*4+3],0,'no guessed art under missing junction');
  }
 }
});

test('visual integration preserves released layout, water collision and room/save anchors byte-for-byte',()=>{
 const inputs={outdoors,waterBarriers:Object.fromEntries(Object.entries(outdoors).map(([id,l])=>[id,waterBarriers(l)])),worldScenes:world.scenes,rooms};
 const pins={
  outdoors:'797a9a07adf04ada2f37de0a9dfdd5689d0c0f803b814d57d899e8ef61dee8d5',
  waterBarriers:'c24dd6081bb6a1c1a73d4806089d24ce392e0ddc78671c508610d8c324dd4e1a',
  worldScenes:'b3de7a1e458427d2d53fb4d6f70f0f644641eddb3b0bf7ee5059abcdbe1f5523',
  rooms:'17f22ba4b2ae0ab1465e6c48775d8295814b364860cb192676250deccb6f6a12',
 };
 for(const [name,value] of Object.entries(inputs))assert.equal(hash(JSON.stringify(value)),pins[name],name+' vs 55c8 baseline');
});
