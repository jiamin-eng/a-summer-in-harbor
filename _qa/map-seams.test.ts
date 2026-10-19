import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {initial,applyAction} from '../src/story/state';
import {rooms,world} from '../src/world/data';
import {passages,outdoors} from '../src/world/outdoors';
import {roadEndPlan,roadEndVisible} from '../src/world/road-end-plan';
import {arrivalFacing} from '../src/world/arrival-facing';
import {internalPassage,globalPoint,localPoint,zonesFor,renderScene} from '../src/candidate/continuity';
import {walkable,findPath} from '../src/engine/world';

const emitReport=(name:string,value:unknown)=>{const out=process.env.MAP_SEAMS_QA_OUT;if(out){mkdirSync(out,{recursive:true});writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n')}};

test('every reciprocal authored portal retains original admission, arrival, return and inward-facing target',()=>{
 const report=[];for(const [scene,r] of Object.entries(rooms))for(const e of r.entities.filter(e=>e.kind==='portal')){
  const to=e.destination!,back=rooms[to]?.entities.find(b=>b.destination===scene);if(!back)continue;
  const s={...initial('en',randomUUID()),scene,position:{...e.approach},flags:['key','unpacked','bridge-fixed','garden-agreed','alternative-route'],known:[],visited:Object.keys(rooms)};
  if(to.startsWith('workshop-annex-')||scene.startsWith('workshop-annex-'))continue;
  assert.ok(walkable(world,scene,e.approach),scene+'/'+e.id);const action={action_id:randomUUID(),expected_version:s.version,scene,position:e.approach,target:e.id,action:'travel'};
  const arrived=applyAction(s,action).head;assert.equal(arrived.scene,to);assert.deepEqual(arrived.position,back.approach);assert.ok(walkable(world,to,arrived.position));
  const facing=arrivalFacing(scene,to,arrived.position),v={x:back.approach.x+8-back.at.x,y:back.approach.y+6-back.at.y};if(internalPassage(scene,to))assert.equal(facing,undefined);else if(Math.hypot(v.x,v.y)>=1)assert.deepEqual(facing,{x:arrived.position.x+v.x,y:arrived.position.y+v.y});
  // No automatic return action exists: a further explicit authority command is needed.
  assert.equal(arrived.version,s.version+1);const returned=applyAction(arrived,{...action,action_id:randomUUID(),expected_version:arrived.version,scene:to,position:back.approach,target:back.id}).head;assert.equal(returned.scene,scene);
  report.push({scene,target:e.id,destination:to,departure:e.approach,arrival:back.approach,continuous:internalPassage(scene,to),facing:facing??null,return:'explicit command retained',outdoor:r.outdoor});
 }
 emitReport('portal-audit.json',report);assert.ok(report.length>40);
});
test('road repairs are paint only, close real peripheral tails and protect shared admission',()=>{
 const frozen=JSON.stringify({rooms,world,outdoors}),summary=[];
 for(const scene of ['station','harbor','hill','garden','camp','courtyard','dock','market-bazaar','coast-beach-path']){const pieces=roadEndPlan(scene);assert.ok(pieces.length);assert.ok(pieces.some(p=>p.kind==='cap'));for(const p of pieces){assert.ok(p.rect.w>0&&p.rect.h>0);for(let y=p.rect.y+.5;y<p.rect.y+p.rect.h;y+=8)for(let x=p.rect.x+.5;x<p.rect.x+p.rect.w;x+=8){if(!roadEndVisible(scene,p.zone,{x,y}))continue;if(p.kind==='tail'){const q=localPoint(p.zone,{x,y}),b=outdoors[p.zone].bounds;assert.ok(q.x<b.x||q.y<b.y||q.x>=b.x+b.w||q.y>=b.y+b.h,'tail must stay outside its world')}for(const other of zonesFor(scene).filter(z=>z!==p.zone)){const q=localPoint(other,{x,y}),b=outdoors[other].bounds;assert.ok(q.x<b.x||q.y<b.y||q.x>=b.x+b.w||q.y>=b.y+b.h,'other member ground must be protected')}}}summary.push({scene,pieces:pieces.length,caps:pieces.filter(p=>p.kind==='cap').length,pixels:pieces.reduce((n,p)=>n+p.rect.w*p.rect.h,0)})}
 assert.equal(JSON.stringify({rooms,world,outdoors}),frozen);
 for(const [scene,links] of Object.entries(passages))for(const p of Object.values(links)){assert.ok(walkable(world,scene,p.approach));assert.ok(findPath(world,scene,rooms[scene].spawn,p.approach).length)}
 assert.equal(roadEndVisible('coast-beach-path','coast',globalPoint('path',{x:100,y:335})),false);assert.equal(roadEndVisible('market-bazaar','market',globalPoint('bazaar',{x:480,y:600})),false);
 emitReport('road-repair-inventory.json',summary);
});
test('arrival pose never changes an idle restore, continuous seam or unrelated quick-travel spawn',()=>{
 assert.equal(arrivalFacing(undefined,'home',rooms.home.spawn),undefined);assert.equal(arrivalFacing('home','home',rooms.home.spawn),undefined);assert.equal(arrivalFacing('coast','beach',rooms.beach.spawn),undefined);assert.equal(arrivalFacing('market','hill',{x:650,y:900}),undefined);assert.equal(renderScene('coast'),renderScene('path'));
});
