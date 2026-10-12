import test from 'node:test';
import assert from 'node:assert/strict';
import {continuousPath,globalPoint,traceZone,clusterWalkable} from '../src/candidate/continuity';
import {world} from '../src/world/data';
import {advanceRoute} from '../src/engine/distance-motion';
import {predictionHorizon} from '../src/candidate/motion-outbox';

test('coast testbench entrance route is physically walkable and exceeds an unacknowledged prediction lease',()=>{
 const start=globalPoint('coast',{x:1100,y:560}),target=globalPoint('path',{x:460,y:540}),route=continuousPath(world,'coast',start,'path',target);
 assert.ok(route.length>0);
 let distance=0,previous=start;for(const point of route){distance+=Math.hypot(point.x-previous.x,point.y-previous.y);previous=point}
 assert.ok(distance>predictionHorizon,'isolated renderer must locally acknowledge actual movement for this route');
 let position=start,zone='coast',remaining=[...route],frames=0;
 while(remaining.length&&frames<350){
  const before=position,result=advanceRoute(position,remaining,112*.04,p=>clusterWalkable(world,p,zone,before));
  assert.equal(result.blocked,false,`blocked at ${JSON.stringify(position)}`);
  remaining.splice(0,result.consumed);position=result.position;zone=traceZone(zone,before,[position]);frames++;
 }
 assert.deepEqual(position,target);assert.equal(zone,'path');assert.deepEqual(remaining,[]);
 assert.ok(frames*.04<15,'actual walked route fits the original 15-second test timeout');
});
