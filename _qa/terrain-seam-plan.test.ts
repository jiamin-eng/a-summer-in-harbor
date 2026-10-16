import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terrainContacts} from '../src/world/terrain-contacts';
import {terrainSeams,terrainJunctions,seamPair} from '../src/world/terrain-seam-plan';

const lengths=(scene:string)=>{
 const result:Record<string,number>={};
 for(const e of terrainSeams(scene)){
  const key=seamPair(e.negative,e.positive);
  result[key]=(result[key]??0)+(e.axis==='x'?e.rect.h:e.rect.w);
 }
 return result;
};

test('harbor and dock expose every structural pair for art admission',()=>{
 assert.deepEqual(lengths('harbor'),{'stone/wood':840,'water/wood':1440,'stone/water':1210});
 assert.deepEqual(lengths('dock'),{'stone/water':630,'water/wood':840,'stone/wood':330});
 assert.ok(terrainJunctions('harbor').some(e=>e.at.x===80&&e.at.y===600&&e.materials.length===3));
 assert.ok(terrainJunctions('dock').some(e=>e.at.x===325&&e.at.y===540&&e.materials.length===3));
});

test('continuous coast path includes bridge joins and both source zones',()=>{
 const seams=terrainSeams('coast-beach-path'),pairs=lengths('coast-beach-path');
 assert.ok(seams.some(e=>e.zone==='path'&&seamPair(e.negative,e.positive)==='grass/wood'));
 assert.ok(pairs['water/wood']>0&&pairs['stone/water']>0&&pairs['stone/wood']>0);
 assert.ok(terrainJunctions('coast-beach-path').some(e=>e.zone==='path'&&e.materials.length===3));
});

test('inventory refactor preserves the released renderer admission',()=>{
 assert.equal(terrainContacts('harbor').length,0);
 assert.equal(terrainContacts('dock').length,0);
 assert.equal(terrainContacts('coast-beach-path').length,35);
 for(const scene of ['station','harbor','market-bazaar','coast-beach-path','hill','dock','garden','camp','courtyard'])
  for(const e of terrainSeams(scene))assert.ok(e.rect.w>0&&e.rect.h>0&&e.negative!==e.positive);
});
