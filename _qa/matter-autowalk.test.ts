import test from 'node:test';
import assert from 'node:assert/strict';
import {initial} from '../src/story/state';
import {rooms,worldWithFlags} from '../src/world/data';
import {matterOptions} from '../src/ui/Matters';
import {matterWalkingTarget} from '../src/story/matter-navigation';
import {continuousPath,globalPoint,traceZone} from '../src/candidate/continuity';
import {findPath} from '../src/engine/world';

test('the selected matter, not the first card, chooses a walkable target',()=>{
 const s={...initial('en','synthetic'),scene:'garden',position:rooms.garden.spawn,flags:['key','unpacked','bag-returned']};
 const matters=matterOptions(s,null);
 const journey=matters.find(m=>m.id==='journey')!,garden=matters.find(m=>m.id==='garden-crops')!;
 assert.notEqual(journey.id,garden.id);
 assert.equal(matterWalkingTarget(s,garden)?.id,'crop-bed-1');
 assert.equal(matterWalkingTarget(s,journey)?.destination,'hill');
 assert.equal(s.scene,'garden');assert.deepEqual(s.position,rooms.garden.spawn);
});

test('same scene target uses the existing obstacle path and stops near interaction',()=>{
 const s={...initial('en','synthetic'),scene:'garden',position:rooms.garden.spawn,flags:['key','unpacked','bag-returned']};
 const e=matterWalkingTarget(s,{id:'garden-crops',place:'garden'})!;
 const path=findPath(worldWithFlags(s.flags),s.scene,s.position,e.approach);
 assert.ok(path.length>2);
 assert.ok(path.some(p=>Math.abs(p.x-s.position.x)>20&&Math.abs(p.y-s.position.y)>20));
 assert.deepEqual(path.at(-1),e.approach);
 assert.ok(Math.hypot(e.approach.x-e.at.x,e.approach.y-e.at.y)<70);
});

test('a same-cluster matter crosses only its admitted seam',()=>{
 const s={...initial('en','synthetic'),scene:'market',position:{x:597,y:145},flags:['key','unpacked','bag-returned']};
 const e=matterWalkingTarget(s,{id:'journey',place:'bazaar'})!;
 const path=continuousPath(worldWithFlags(s.flags),'market',globalPoint('market',s.position),'bazaar',globalPoint('market',e.approach));
 assert.ok(path.length>2);
 assert.equal(traceZone('market',globalPoint('market',s.position),path),'bazaar');
 assert.deepEqual(globalPoint('market',e.approach),globalPoint('bazaar',rooms.bazaar.entities.find(x=>x.id==='notice')!.approach));
});

test('cross-room walking stops at the next real entrance without completing a task',()=>{
 const s={...initial('en','synthetic'),scene:'hill',position:rooms.hill.spawn,flags:['key','unpacked','bag-returned']};
 const before=JSON.stringify(s);
 const e=matterWalkingTarget(s,{id:'garden-crops',place:'garden'})!;
 assert.equal(e.kind,'portal');assert.equal(e.destination,'garden');
 assert.ok(findPath(worldWithFlags(s.flags),s.scene,s.position,e.approach).length>0);
 assert.equal(JSON.stringify(s),before);
});

test('a person is routed by their actual schedule, and a locked destination is rejected',()=>{
 const s={...initial('en','synthetic'),scene:'station',position:rooms.station.spawn,flags:['key','unpacked','bag-returned']};
 const mara=matterWalkingTarget(s,{id:'animal:synthetic',person:'mara'});
 assert.equal(mara?.person,'mara');
 const locked={...s,flags:[]};
 assert.equal(matterWalkingTarget(locked,{id:'garden-crops',place:'garden'}),undefined);
});
