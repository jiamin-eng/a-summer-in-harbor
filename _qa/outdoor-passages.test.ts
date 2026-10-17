import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rooms,world} from '../src/world/data';
import {outdoors,passages} from '../src/world/outdoors';
import {findPath,walkable} from '../src/engine/world';
import {initial,applyAction} from '../src/story/state';

test('outdoor trail portals have real signs, dry approaches, and reciprocal arrival points',()=>{
 for(const [scene,links] of Object.entries(passages))for(const [destination,p] of Object.entries(links)){
  const e=rooms[scene].entities.find(e=>e.destination===destination)!;
  assert.ok(e?.passage,`${scene}/${destination} has a physical passage`);
  assert.ok(rooms[scene].props.some(prop=>prop.id==='route-sign-'+e.id),`${scene} sign`);
  assert.deepEqual(e.at,p.at);assert.deepEqual(e.approach,p.approach);
  assert.ok(Math.hypot(e.approach.x+8-e.at.x,e.approach.y+6-e.at.y)<65,'same interaction radius');
  assert.ok(walkable(world,scene,p.approach));assert.ok(findPath(world,scene,rooms[scene].spawn,p.approach).length);
  const ground=outdoors[scene].patches.slice().reverse().find(t=>p.at.x>=t.x&&p.at.x<=t.x+t.w&&p.at.y>=t.y&&p.at.y<=t.y+t.h);
  assert.ok(ground&&!['water','grass'].includes(ground.material),`${scene}/${destination} uses an actual path`);
  const signGround=outdoors[scene].patches.slice().reverse().find(t=>p.sign.x>=t.x&&p.sign.x<t.x+t.w&&p.sign.y>=t.y&&p.sign.y<t.y+t.h);
  assert.ok(signGround&&signGround.material!=='water',`${scene}/${destination} sign stands on dry terrain`);
  assert.ok(!outdoors[scene].barriers.some(b=>p.sign.x>=b.x&&p.sign.x<b.x+b.w&&p.sign.y>=b.y&&p.sign.y<b.y+b.h),`${scene}/${destination} sign is not inside an invisible barrier`);
  const back=rooms[destination].entities.find(e=>e.destination===scene)!;
  assert.ok(back&&walkable(world,destination,back.approach),'arrival is a safe reciprocal portal');
 }
});
test('harbor-to-coast road ends at the playable shore while both approaches and the sign stay usable',()=>{
 const harbor=outdoors.harbor,p=passages.harbor.coast,back=passages.coast.harbor;
 assert.deepEqual(p.at,{x:1280,y:450});assert.deepEqual(p.approach,{x:1244,y:444});
 assert.deepEqual(back.at,{x:70,y:475});assert.deepEqual(back.approach,{x:90,y:469});
 const east=harbor.bounds.x+harbor.bounds.w;
 assert.equal(Math.max(...harbor.patches.filter(t=>t.material==='stone'&&t.y===395&&t.h===110).map(t=>t.x+t.w)),east);
 assert.ok(findPath(world,'harbor',rooms.harbor.spawn,p.approach).length);
 assert.ok(findPath(world,'coast',rooms.coast.spawn,back.approach).length);
 assert.ok(walkable(world,'harbor',{x:p.sign.x-28,y:p.sign.y-6}),'sign has a dry nearby standing point');
});
test('coast path and beach can be entered and returned through new approaches without changing story IDs',()=>{
 let s=initial('en',randomUUID());
 const step=(target:string,action:string)=>{const e=rooms[s.scene].entities.find(e=>e.id===target)!;s=applyAction(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:e.approach,target,action}).head};
 step('mara','introduce');step('mara','talk:key');step('to-home','travel');step('bed','unpack');step('exit','travel');step('road-harbor','travel');step('road-coast','travel');
 for(const destination of ['path','beach']){
  const e=rooms.coast.entities.find(e=>e.destination===destination)!;
  s=applyAction(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:e.approach,target:e.id,action:'travel'}).head;
  const back=rooms[destination].entities.find(e=>e.destination==='coast')!;
  assert.deepEqual(s.position,back.approach);
  s=applyAction(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:back.approach,target:back.id,action:'travel'}).head;
  assert.equal(s.scene,'coast');assert.deepEqual(s.position,e.approach);
 }
});
test('new side bench uses a narrow deep footprint; tree crowns do not become rectangular obstacles',()=>{
 for(const r of Object.values(rooms))for(const p of r.props){
  if(p.art==='bench-side-v3'){assert.ok(p.footprint&&p.footprint.w<=26&&p.footprint.h>=40,r.id+'/'+p.id)}
  if(p.art.startsWith('tree-'))assert.ok(p.footprint&&p.footprint.w<p.width/3&&p.footprint.h<24,r.id+'/'+p.id);
 }
});
