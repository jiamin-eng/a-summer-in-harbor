import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {fishingDockBudget,reelPointerInside} from '../src/ui/fishing-layout';
import {ShoreFishingAction,ShoreFishingAccess} from '../src/ui/ShoreFishingAccess';
import {initial} from '../src/story/state';
import {basicRod,basicLure} from '../src/challenges/shore-fishing';
import {checkShore} from '../src/world/shore-water';
import {worldWithFlags} from '../src/world/data';
import {explorationLayout} from '../src/world/exploration-layout';

test('reported320x500 with57px host and80px header keeps >=160px real scene, and waiting returns unused dock space',()=>{
 const app=500-57,header=80,{sceneMin,maxDock}=fishingDockBudget(app,header);
 assert.ok(sceneMin>=160);assert.ok(app-header-maxDock>=160);assert.ok(maxDock>=190);
 assert.ok(app-header-135>app-header-maxDock); // actual waiting dock, not a fixed 58vh reservation
 for(const [h,host,top]of [[500,57,80],[568,57,80],[844,57,80],[900,0,80]]){const budget=fishingDockBudget(h-host,top);assert.ok(budget.maxDock+budget.sceneMin<=h-host-top+1e-8);assert.ok(budget.sceneMin>=160)}
});
test('layout observes actual dock and applies the measured app/header budget rather than viewport fraction',()=>{
 let dockHeight=200;const vars=new Map<string,string>(),rect=(top:number,height:number)=>({top,bottom:top+height,left:0,right:320,width:320,height});
 const header={getBoundingClientRect:()=>rect(57,80)},dock={getBoundingClientRect:()=>rect(500-dockHeight,dockHeight)},app={getBoundingClientRect:()=>rect(57,443),style:{getPropertyValue:(n:string)=>vars.get(n),setProperty:(n:string,v:string)=>vars.set(n,v)},querySelector:(q:string)=>q==='.harbor-header'?header:q==='.harbor-backdrop--fishing .harbor-panel'?dock:null};
 const world={closest:()=>app,getBoundingClientRect:()=>rect(137,363-dockHeight)};
 const observers:any[]=[];class RO{seen:any[]=[];constructor(public f:()=>void){observers.push(this)}observe(e:any){this.seen.push(e)}disconnect(){this.seen=[]}};class MO{constructor(_f:any){}observe(){}disconnect(){}}
 const before=Object.fromEntries(['ResizeObserver','MutationObserver','window','document','getComputedStyle'].map(n=>[n,(globalThis as any)[n]]));
 Object.assign(globalThis,{ResizeObserver:RO,MutationObserver:MO,getComputedStyle:()=>({visibility:'visible'}),window:{innerHeight:500,addEventListener(){},removeEventListener(){}},document:{body:{},getElementById:()=>null,fonts:{ready:{then(){}}}}});
 try{const layout=explorationLayout(world as any);assert.equal(vars.get('--harbor-fishing-dock-height'),'200px');assert.ok(parseFloat(vars.get('--harbor-fishing-max-height')!)<201);assert.ok(observers[0].seen.includes(dock));dockHeight=135;layout.insets();assert.equal(vars.get('--harbor-fishing-dock-height'),'135px');layout.dispose()}finally{Object.assign(globalThis,before)}
});
test('cast/claim have one footer action, with original kit/paused/energy guards; details remain in scroll body',()=>{
 const save={...initial('en','synthetic'),scene:'dock',position:{x:340,y:500}},shore=checkShore(save.scene,save.position,worldWithFlags(save.flags));assert.ok(shore.ok);
 const props={save,shore,locale:'en'as const,busy:false,onClaim(){},onCast(){}};
 const plain=renderToStaticMarkup(<ShoreFishingAction {...props}/>);assert.match(plain,/data-shore-claim/);assert.doesNotMatch(plain,/data-shore-cast/);
 const body=renderToStaticMarkup(<ShoreFishingAccess {...props} docked/>);assert.doesNotMatch(body,/data-shore-cast|data-shore-claim/);assert.ok(body.includes('free basic rod'));
 save.items[basicRod]=save.items[basicLure]=1;const cast=renderToStaticMarkup(<ShoreFishingAction {...props}/>);assert.match(cast,/data-shore-cast/);assert.doesNotMatch(cast,/disabled/);
 save.energy=9;assert.match(renderToStaticMarkup(<ShoreFishingAction {...props}/>),/disabled/);
});
test('captured pointer stays released after sliding beyond any reel edge; invalid coordinates cannot hold',()=>{
 const box={left:100,right:220,top:400,bottom:452};for(const p of [[160,420],[100,400],[220,452]])assert.equal(reelPointerInside(box,...p as[number,number]),true);
 for(const p of [[160,350],[99,420],[221,420],[160,453],[NaN,420]])assert.equal(reelPointerInside(box,...p as[number,number]),false);
 let held=true;for(const p of [[160,420],[160,350],[160,420]])held=held&&reelPointerInside(box,...p as[number,number]);assert.equal(held,false);
});
