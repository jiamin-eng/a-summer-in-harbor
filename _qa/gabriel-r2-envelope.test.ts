import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import geometry from '../src/animals/display-space-geometry.json';
import lock from '../doc/qa/gabriel-r2-integration-20261015/CONSUMER-LOCK.json';
import {chapelPriest} from '../src/world/chapel-priest';
import {envelope} from '../src/animals/display-space';

test('only Gabriel visual reservation changes; original dog/crab and other actor geometry remain exact',()=>{
 const before=JSON.parse(execFileSync('git',['show','4451b92cf901fe877988e4a37363dfd3266cb942:src/animals/display-space-geometry.json'],{encoding:'utf8'}));
 const after=structuredClone(geometry) as any;
 delete before.people['npc-gabriel'];delete after.people['npc-gabriel'];
 assert.deepEqual(after,before);
 const gabriel=geometry.people['npc-gabriel'];
 assert.equal(gabriel.source,'public/art/npc-gabriel.png');
 assert.equal(gabriel.sha256,createHash('sha256').update(readFileSync(gabriel.source)).digest('hex'));
 assert.deepEqual(gabriel.size,[384,512]);assert.equal(Object.keys(gabriel.frames).length,12);
 for(const f of Object.values(gabriel.frames)){
  const [l,t,r,b]=f.alphaBounds;
  assert.ok(l>=0&&t>=0&&r<=128&&b<=128&&r>l&&b>t);
  const expected={x:(l-64)*56/108,y:(t-122)*56/108,w:(r-l)*56/108,h:(b-t)*56/108};
  for(const key of ['x','y','w','h'] as const)assert.ok(Math.abs(f.relative[key]-expected[key])<1e-12);
 }
 const box=envelope(gabriel);assert.equal(box.y,-56);assert.equal(box.h,56);assert.ok(box.w>0&&box.w<56);
});

test('candidate pins actual R2 bytes and corrects six auxiliary SHA values without claiming a new library revision',()=>{
 assert.deepEqual(chapelPriest.libraryAsset,{assetId:'character-family__gabriel',revision:2,recordId:'44125733-66b7-4952-9f6a-a508a926ae30'});
 assert.equal(lock.library.canonicalRecordModified,false);
 for(const f of lock.files)assert.equal(createHash('sha256').update(readFileSync(f.path)).digest('hex'),f.sha256);
 assert.equal(lock.mirrorHashCorrection.mirrors.length,3);
 for(const m of lock.mirrorHashCorrection.mirrors){
  assert.equal(m.actualWholeCellMirrorPASS,true);
  assert.notEqual(m.actualLeftFileSHA256,m.publishedR2DeclaredLeftFileSHA256);
  assert.notEqual(m.actualRightFileSHA256,m.publishedR2DeclaredRightFileSHA256);
 }
 assert.equal(lock.scope.newImageRequests,0);assert.equal(lock.scope.formalReleaseApprovedByThisRecord,false);
});
