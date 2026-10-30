import test from 'node:test';import assert from 'node:assert/strict';
import {attachFishingScene} from '../src/world/FishingScene';
import {fishingPresentationEvent,type FishingPresentation} from '../src/ui/fishing-experience';
class Node {style:Record<string,string>={};dataset:Record<string,string>={};attributes=new Map<string,string>();setAttribute(k:string,v:string){this.attributes.set(k,v)}removeAttribute(k:string){this.attributes.delete(k)}}
const names=['rod','line','float','ripple','fish'];
function fixture(){
 const previous={raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,media:globalThis.matchMedia};let id=0;const queue=new Map<number,FrameRequestCallback>();
 globalThis.requestAnimationFrame=(fn)=>{const next=++id;queue.set(next,fn);return next};globalThis.cancelAnimationFrame=(n)=>{queue.delete(n)};globalThis.matchMedia=(()=>({matches:false}))as any;
 const root=new Node(),nodes=Object.fromEntries(names.map(n=>[n,new Node()]));(root as any).querySelector=(selector:string)=>nodes[selector.match(/data-fishing-(.+)\]/)![1]];
 const app=new EventTarget(),latest={current:{scene:'harbor',project:(p:any)=>({...p}),legacyAnchor:undefined as any}},detach=attachFishingScene(root as any,app,latest);
 const emit=(overrides:Partial<FishingPresentation>={})=>{const e=new Event(fishingPresentationEvent);Object.assign(e,{detail:{challenge:'cast-1',phase:'result',anchor:{scene:'harbor',standing:{x:100,y:200},target:{x:160,y:210}},anchorSource:'encounter',waitTicks:45,paused:false,state:{tick:100,progress:1,tension:.3,result:'caught'},...overrides}});app.dispatchEvent(e)};
 const frame=()=>{const work=[...queue];queue.clear();for(const[,fn]of work)fn(performance.now()+16)};
 // CSS visibility is inherited but a child can explicitly override it. display:none
 // on an ancestor excludes the subtree regardless of the child's visibility.
 const fishRendered=()=>root.style.display!=='none'&&(nodes.fish.style.visibility||root.style.visibility||'visible')==='visible';
 const done=()=>{detach();if(previous.raf)globalThis.requestAnimationFrame=previous.raf;else delete(globalThis as any).requestAnimationFrame;if(previous.caf)globalThis.cancelAnimationFrame=previous.caf;else delete(globalThis as any).cancelAnimationFrame;if(previous.media)globalThis.matchMedia=previous.media;else delete(globalThis as any).matchMedia};
 return{root,nodes,app,latest,emit,frame,fishRendered,queue,detach,done};
}
test('negative control demonstrates the recorded root-hidden child-visible failure, while initial attachment is absent',()=>{
 const f=fixture();try{assert.equal(f.fishRendered(),false);f.root.style.display='';f.root.style.visibility='hidden';f.nodes.fish.style.visibility='visible';assert.equal(f.fishRendered(),true,'original EXP-06 CSS visibility combination still renders a child');}finally{f.done()}
});
test('confirmed closed event clears a caught overlay immediately and no child can override the hidden subtree',()=>{
 const f=fixture();try{f.emit();f.frame();assert.equal(f.fishRendered(),true);assert.equal(f.root.dataset.fishingScenePhase,'result');assert.ok(f.nodes.fish.attributes.has('transform'));f.emit({phase:'closed'});assert.equal(f.fishRendered(),false);assert.equal(f.nodes.fish.style.visibility,'hidden');assert.equal(f.nodes.fish.attributes.has('transform'),false);assert.deepEqual(f.root.dataset,{});assert.equal(f.queue.size,0);f.nodes.fish.style.visibility='visible';assert.equal(f.fishRendered(),false,'ancestor display must suppress stale explicit child visibility');}finally{f.done()}
});
test('ready/cancel teardown removes reeling graphics and cast metadata without requiring another animation frame',()=>{
 const f=fixture();try{f.emit({phase:'reeling'});f.frame();assert.equal(f.fishRendered(),true);f.emit({phase:'ready'});assert.equal(f.fishRendered(),false);assert.deepEqual(f.root.dataset,{});assert.equal(f.queue.size,0);f.emit({phase:'closed'});assert.equal(f.queue.size,0);}finally{f.done()}
});
test('travel to an interior drops the old snapshot, and returning does not resurrect a landed fish',()=>{
 const f=fixture();try{f.emit();f.frame();assert.equal(f.fishRendered(),true);f.latest.current.scene='grocery';f.frame();assert.equal(f.fishRendered(),false);assert.deepEqual(f.root.dataset,{});assert.equal(f.queue.size,0);f.latest.current.scene='harbor';f.frame();assert.equal(f.fishRendered(),false);assert.equal(f.queue.size,0);}finally{f.done()}
});
test('temporary projection loss hides the whole overlay, then redraws only the still-current presentation',()=>{
 const f=fixture();try{f.emit();f.frame();f.latest.current.project=()=>null as any;f.frame();assert.equal(f.fishRendered(),false);assert.ok(f.queue.size>0,'current scene may retry projection');f.latest.current.project=(p:any)=>({...p});f.frame();assert.equal(f.fishRendered(),true);f.emit({phase:'closed'});f.frame();assert.equal(f.fishRendered(),false);}finally{f.done()}
});
test('an old challenge close cannot hide the next current cast',()=>{
 const f=fixture();try{f.emit();f.frame();f.emit({challenge:'cast-2',phase:'waiting'});assert.equal(f.fishRendered(),false,'hide old caught fish while the next cast waits for its frame');f.frame();assert.equal(f.root.dataset.fishingScenePhase,'waiting');assert.equal(f.nodes.fish.style.visibility,'hidden');f.emit({challenge:'cast-1',phase:'closed'});f.frame();assert.equal(f.root.dataset.fishingScenePhase,'waiting');assert.equal(f.root.style.visibility,'visible');}finally{f.done()}
});
test('unmount removes listeners, cancels frames, and a recreated scene starts clean',()=>{
 const f=fixture();try{f.emit();f.frame();f.detach();assert.equal(f.fishRendered(),false);assert.equal(f.queue.size,0);f.emit();assert.equal(f.queue.size,0);assert.equal(f.fishRendered(),false);const cleanup=attachFishingScene(f.root as any,f.app,f.latest);try{assert.equal(f.fishRendered(),false);f.emit({phase:'waiting',challenge:'cast-after-reload'});f.frame();assert.equal(f.root.dataset.fishingScenePhase,'waiting');assert.equal(f.fishRendered(),false);}finally{cleanup()}}finally{f.done()}
});
test('legacy borrowed shore anchor is discarded on close rather than reused across visits',()=>{
 const f=fixture();try{let calls=0;f.latest.current.legacyAnchor=()=>{calls++;return{scene:'harbor',standing:{x:100,y:200},target:{x:160,y:210}}};f.emit({anchor:undefined,phase:'reeling'});f.frame();assert.equal(f.root.dataset.fishingAnchorSource,'legacy-shore-check');assert.equal(calls,1);f.emit({phase:'closed',anchor:undefined});f.latest.current.legacyAnchor=()=>undefined;f.emit({challenge:'later-visit',anchor:undefined,phase:'reeling'});f.frame();assert.equal(f.fishRendered(),false);assert.deepEqual(f.root.dataset,{});}finally{f.done()}
});
