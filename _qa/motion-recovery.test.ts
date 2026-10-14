import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initial,type Save} from '../src/story/state';
import {world} from '../src/world/data';
import {nativeCrabCollision} from '../src/animals/native-crab-game';
import {walkable} from '../src/engine/world';
import {globalPoint,clusterWalkable} from '../src/candidate/continuity';
import {recoverRejectedPath} from '../src/candidate/recover-rejected-path';
import {createMovingClock} from '../server/candidate-clock';
import {MotionRejection} from '../server/motion-failure';

test('confirmed beach crab blocks the reported path; a definite rejection restores the confirmed head without moving time',async()=>{
 let at=1000;
 let head:Save={...initial('zh',randomUUID()),scene:'beach',position:{x:460,y:540},townMinutes:2192,nativeCrabV1:{minute:2192,scene:'beach',frame:{visible:true,scene:'beach',foot:{x:468,y:586},direction:'left'}} as any};
 const crab=nativeCrabCollision(head);
 assert.deepEqual(crab,[{x:460,y:560,w:23,h:26}]);
 const target={x:460,y:552.2976};
 assert.equal(walkable(world,'beach',target),true);
 const w={...world,scenes:{...world.scenes,beach:{...world.scenes.beach,obstacles:[...world.scenes.beach.obstacles,...crab]}}};
 assert.equal(clusterWalkable(w,globalPoint('beach',target),'beach',globalPoint('beach',{x:460,y:548})),false);
 const clock=createMovingClock({now:()=>at,boot:'recovery-test',worldForSave:()=>w});
 const send=(action:string,position:Save['position'],payload:unknown)=>clock(head,{action_id:randomUUID(),expected_version:head.version,scene:head.scene,position,target:'',action,payload}).head;
 head=send('candidate-clock-enable',head.position,{millisecondsPerMinute:4000});
 head=send('candidate-motion-open',head.position,{});
 const before=structuredClone(head);
 at+=200;
 assert.throws(()=>send('candidate-motion-step',target,{lease:head.movingClock!.lease!.id,sequence:1,points:[globalPoint('beach',target)]}),e=>e instanceof MotionRejection&&e.message==='INVALID_MOTION_PATH');
 assert.deepEqual(head,before);
 const projection={points:[globalPoint('beach',target),globalPoint('beach',{x:462.1504,y:552.2976})],traceStart:globalPoint(head.scene,head.position),restoreConfirmed:async(scene:string,p:Save['position'])=>{assert.equal(scene,'beach');assert.deepEqual(p,before.position);restores++}};
 let restores=0,opens=0;
 const recovered=await recoverRejectedPath(Object.assign(Error('INVALID_MOTION_PATH'),{status:400,terminal:true}),head,projection,async()=>{opens++;return send('candidate-motion-open',head.position,{})},()=>true);
 assert.equal(restores,1);assert.equal(opens,1);assert.deepEqual(projection.points,[]);assert.deepEqual(projection.traceStart,globalPoint('beach',before.position));
 assert.deepEqual(recovered?.position,before.position);assert.equal(recovered?.townMinutes,before.townMinutes);assert.equal(recovered?.movingClock?.remainderMs,before.movingClock?.remainderMs);
 assert.equal(recovered?.movingClock?.lease?.sequence,0);assert.notEqual(recovered?.movingClock?.lease?.id,before.movingClock?.lease?.id);
});

test('ambiguous failures and another journey never discard a predicted path or open a lease',async()=>{
 const head={...initial('en',randomUUID()),scene:'beach',position:{x:460,y:540}};
 const point=globalPoint('beach',{x:460,y:552});
 const projection={points:[point],traceStart:globalPoint('beach',head.position),restoreConfirmed:async()=>{throw Error('unexpected restore')}};
 let opened=0;const open=async()=>{opened++;return head};
 for(const error of [Object.assign(Error('INVALID_MOTION_PATH'),{status:503,terminal:false}),Object.assign(Error('VERSION_CONFLICT'),{status:409,terminal:true})]){
  assert.equal(await recoverRejectedPath(error,head,projection,open,()=>true),null);assert.deepEqual(projection.points,[point]);
 }
 await assert.rejects(recoverRejectedPath(Object.assign(Error('INVALID_MOTION_PATH'),{status:400,terminal:true}),head,projection,open,()=>false),/MOTION_FLUSH_CANCELLED/);
 assert.deepEqual(projection.points,[point]);assert.equal(opened,0);
});
