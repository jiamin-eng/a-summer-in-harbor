import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {placeShoreCaption,captionLeaderEnd,padCaptionRect} from '../src/world/shore-caption';
import bounds from '../src/world/hero-caption-bounds.json';
import type {Rect} from '../src/engine/world';
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('caption occlusion metadata remains pinned to the unchanged hero alpha frames',()=>{
 const png=readFileSync(new URL('../public/art/hero.png',import.meta.url));assert.equal(createHash('sha256').update(png).digest('hex'),bounds.sha256);assert.equal(png.readUInt32BE(16)/3,bounds.frame.w);assert.equal(png.readUInt32BE(20)/4,bounds.frame.h);assert.ok(bounds.alpha.x>=0&&bounds.alpha.x+bounds.alpha.w<=bounds.frame.w);assert.ok(bounds.alpha.y>=0&&bounds.alpha.y+bounds.alpha.h<=bounds.frame.h);
});

test('two reported 320px near-bank arrangements avoid the player and controls for Chinese/English at 320/390/desktop',()=>{
 // Geometric replay of the reported authority coordinates; this is not a browser/visual pass.
 const cases=[{standing:{x:411.8628300814926,y:168.85436774636446},cast:{x:435.25,y:174.85436774636446},screen:{x:180.00332641601562,y:367.70001220703125}},{standing:{x:101.75713492296242,y:99.38310588290275},cast:{x:109.75,y:79.75},screen:{x:159.99072265625,y:334.376953125}}];
 for(const w of [320,390,1440])for(const label of [{w:62,h:25},{w:90,h:25},{w:160,h:42}])for(const c of cases){
  const point={x:c.screen.x+(w-320)/2,y:c.screen.y},unchanged=structuredClone(point),scale=1.3,project=(p:{x:number;y:number})=>({x:point.x+(p.x-c.cast.x)*scale,y:point.y+(p.y-c.cast.y)*scale});
  const a=project({x:c.standing.x+8+(36-64)*56/108,y:c.standing.y+12+(14-122)*56/108}),b=project({x:c.standing.x+8+(91-64)*56/108,y:c.standing.y+12});
  const player={x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},controls=[{x:8,y:16,w:w-16,h:60},{x:0,y:580,w,h:130},{x:w-150,y:530,w:140,h:44}],avoid=[player,...controls];
  const r=placeShoreCaption(point,label,{w,h:710},avoid);assert.ok(r);assert.ok(r.x>=8&&r.x+r.w<=w-8&&r.y>=8&&r.y+r.h<=702);assert.ok(avoid.every(a=>!overlaps(r,padCaptionRect(a))));assert.deepEqual(point,unchanged,'caption placement cannot shift cast point');const end=captionLeaderEnd(point,r);assert.ok(end.x>=r.x&&end.x<=r.x+r.w&&end.y>=r.y&&end.y<=r.y+r.h);
 }
});

test('edge cases stay inside the world; no safe caption area hides the annotation instead of covering controls',()=>{
 for(const point of [{x:0,y:0},{x:319,y:709},{x:0,y:400},{x:319,y:0}]){const r=placeShoreCaption(point,{w:90,h:25},{w:320,h:710},[]);assert.ok(r);assert.ok(r.x>=8&&r.x+r.w<=312&&r.y>=8&&r.y+r.h<=702)}
 assert.equal(placeShoreCaption({x:160,y:350},{w:90,h:25},{w:320,h:710},[{x:0,y:0,w:320,h:710}]),null);assert.equal(placeShoreCaption({x:0,y:0},{w:400,h:25},{w:320,h:710},[]),null);
});
