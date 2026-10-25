import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {legacyFishingAnchor} from '../src/world/fishing-legacy-anchor';
import {checkShore,waterAt,clearCast,shoreWaterCells,castReach} from '../src/world/shore-water';
import {globalPoint,localPoint} from '../src/candidate/continuity';
import {dynamicWorld} from '../src/dynamic-assets/layout';import {landWorld} from '../src/life/land';
import {attachFishingScene} from '../src/world/FishingScene';import {fishingPresentationEvent} from '../src/ui/fishing-experience';
import {legacyFishingAnchor as priorAnchor} from '../../../fishing-scene-lifecycle-20261024/source/src/world/fishing-legacy-anchor';
const world=landWorld(dynamicWorld(['bag-returned','key','unpacked'],false),undefined),standing={x:414,y:279.7692307692308};
const foot={x:standing.x+world.actor.w/2,y:standing.y+world.actor.h/2};
test('recorded normal Ruth stand: old visual anchor is absent, new visual-only line reaches actual clear water without moving the player',()=>{
 const before=JSON.stringify(world),point={...standing},old=checkShore('dock',point,world),anchor=legacyFishingAnchor('dock',point,world,'dock');
 assert.equal(old.ok,false);assert.equal(priorAnchor('dock',point,world,'dock'),undefined);
 assert.ok(anchor);assert.deepEqual(anchor.standing,standing);assert.ok(waterAt('dock',anchor.target));assert.ok(clearCast('dock',foot,anchor.target,world));
 const distance=Math.hypot(anchor.target.x-foot.x,anchor.target.y-foot.y);assert.ok(distance>castReach&&distance<=castReach*2);
 assert.deepEqual(point,standing);assert.equal(JSON.stringify(world),before);
 fs.writeFileSync('reports/RECORDED-STAND.json',JSON.stringify({standing,actor:world.actor,oldCheck:old,newVisualAnchor:anchor,distance,ordinaryCastStillAllowed:checkShore('dock',point,world).ok,authorityTargetChanged:false},null,2));
});
test('a formerly legal shore anchor keeps the exact old target',()=>{
 const point={x:340,y:500};assert.deepEqual(legacyFishingAnchor('dock',point,world,'dock'),priorAnchor('dock',point,world,'dock'));
});
test('wrong render scene, interior, invalid standing or excessively distant stand never borrow a target',()=>{
 assert.equal(legacyFishingAnchor('dock',standing,world,'harbor'),undefined);
 assert.equal(legacyFishingAnchor('grocery',world.scenes.grocery.spawn,world,'grocery'),undefined);
 assert.equal(legacyFishingAnchor('dock',{x:-9999,y:-9999},world,'dock'),undefined);
 assert.equal(legacyFishingAnchor('station',world.scenes.station.spawn,world,'station'),undefined);
});
test('borrowed visual respects non-water obstruction at every candidate landing',()=>{
 const gf=globalPoint('dock',foot),blockers=shoreWaterCells('dock').map(r=>localPoint('dock',{x:Math.max(r.x+.25,Math.min(r.x+r.w-.25,gf.x)),y:Math.max(r.y+.25,Math.min(r.y+r.h-.25,gf.y))})).map(p=>({x:p.x-.1,y:p.y-.1,w:.2,h:.2}));
 const blocked={...world,scenes:{...world.scenes,dock:{...world.scenes.dock,obstacles:[...world.scenes.dock.obstacles,...blockers]}}};
 assert.equal(legacyFishingAnchor('dock',standing,blocked,'dock'),undefined);
});
test('ordinary authoritative shore implementation is byte-identical except exporting its existing geometry helper',()=>{
 const before=fs.readFileSync('../fishing-scene-lifecycle-20261024/source/src/world/shore-water.ts','utf8'),after=fs.readFileSync('source/src/world/shore-water.ts','utf8');
 assert.equal(after.replace('export function clearCast(', 'function clearCast('),before);
});
test('real bridge paints the recorded borrowed anchor, then clears it on cancel and scene travel',()=>{
 const prior={raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,media:globalThis.matchMedia};let id=0;const q=new Map<number,FrameRequestCallback>();
 globalThis.requestAnimationFrame=fn=>{q.set(++id,fn);return id};globalThis.cancelAnimationFrame=id=>{q.delete(id)};globalThis.matchMedia=(()=>({matches:false}))as any;
 class Node{style:Record<string,string>={};dataset:Record<string,string>={};attrs=new Map<string,string>();setAttribute(k:string,v:string){this.attrs.set(k,v)}removeAttribute(k:string){this.attrs.delete(k)}}
 const nodes=Object.fromEntries(['rod','line','float','ripple','fish'].map(k=>[k,new Node()])),root=new Node();(root as any).querySelector=(s:string)=>nodes[s.match(/data-fishing-(.+)\]/)![1]];
 const app=new EventTarget(),latest={current:{scene:'dock',project:(p:any)=>({...p}),legacyAnchor:()=>legacyFishingAnchor('dock',standing,world,'dock')}};const detach=attachFishingScene(root as any,app,latest);
 const emit=(phase:string,challenge='borrow-1')=>{const e=new Event(fishingPresentationEvent);Object.assign(e,{detail:{challenge,phase,paused:false,held:true,state:{tick:3,tension:.3,progress:.1,result:'playing'},waitTicks:45}});app.dispatchEvent(e)};
 const frame=()=>{const work=[...q];q.clear();for(const[,fn]of work)fn(performance.now()+16)};
 try{
  emit('reeling');frame();assert.equal(root.style.display,'');assert.equal(root.dataset.fishingScenePhase,'reeling');assert.equal(root.dataset.fishingAnchorSource,'legacy-shore-check');assert.ok(nodes.rod.attrs.get('d'));assert.ok(nodes.line.attrs.get('d'));
  emit('closed');assert.equal(root.style.display,'none');assert.equal(nodes.fish.style.visibility,'hidden');assert.equal(q.size,0);
  emit('reeling','borrow-2');frame();latest.current.scene='grocery';frame();assert.equal(root.style.display,'none');assert.deepEqual(root.dataset,{});assert.equal(q.size,0);
 }finally{detach();globalThis.requestAnimationFrame=prior.raf;globalThis.cancelAnimationFrame=prior.caf;globalThis.matchMedia=prior.media}
});
