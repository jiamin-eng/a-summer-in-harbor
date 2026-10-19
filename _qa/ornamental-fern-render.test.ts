import test from 'node:test';
import assert from 'node:assert/strict';
import {Assets,Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {createStaticMapSprites} from '../src/engine/static-map-sprites';
import type {SpaceOptions} from '../src/engine/rpg-space';
import {rooms,world} from '../src/world/data';
import {sheets,propId} from '../src/world/sheets';
import {fernGraphicId,syncFernDisplay} from '../src/world/ornamental-fern-render';
import {fernDisplayFlag} from '../src/life/ornamental-fern-config';
import {fernInBag,fernAtHome,fernStep} from './ornamental-fern-fixture';

const fernSheet=sheets.find(s=>s.id===fernGraphicId)!;

test('only the owned fern adds hidden/visible frames; both preserve the authored geometry',()=>{
 assert.equal(sheets.filter(s=>s.id===fernGraphicId).length,1);
 const visible=fernSheet.textures.stand.animations()[0][0],hidden=fernSheet.textures.hidden.animations()[0][0];
 assert.equal(visible.opacity,1);assert.equal(hidden.opacity,0);
 assert.deepEqual({...hidden,opacity:1},visible);
 const prop=rooms.home.props.find(p=>propId('home',p)===fernGraphicId)!;
 assert.equal(visible.scale[0]*fernSheet.width,prop.width);
 assert.equal(fernSheet.image,'./art/plant.png');
 for(const sheet of sheets.filter(s=>s.id!==fernGraphicId))assert.equal(sheet.textures.hidden,undefined,sheet.id);
});

/** Headless Pixi display-tree integration, not a browser/pixel acceptance test.
 * Only image loading is stubbed with an in-memory texture; the production
 * event handle, frame selection, sprite creation and alpha assignment run. */
async function renderer(t:any,flags:()=>string[],graphic=fernGraphicId){
 const sheet=sheets.find(s=>s.id===graphic)!,source=new TextureSource({width:sheet.width,height:sheet.height}),texture=new Texture({source});
 t.mock.method(Assets,'load',async()=>texture);t.mock.method(Assets,'get',()=>texture);
 const oldLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
 Object.defineProperty(globalThis,'location',{value:{search:''},configurable:true});
 let actor:any,syncs=0;
 const e={id:graphic,x:670,y:350,event:{onInit(this:any){actor=this;this.setHitbox(1,1);this.through=true;this.animationFixed=true;const sync=this.syncChanges;this.syncChanges=()=>{syncs++;sync()};if(graphic===fernGraphicId)syncFernDisplay(this,flags());else this.setGraphic(graphic)}}};
 const runtime=createStaticMapSprites({world,spritesheets:[sheet],mapEvents:()=>[e]} as unknown as SpaceOptions,true);
 assert.deepEqual(runtime.mapEvents('home'),[]);
 await runtime.prepare('home');
 const stage=new Container(),player=new Container();player.zIndex=world.actor.h;stage.addChild(player);
 runtime.mount({getCurrentPlayer:()=>({x:()=>0,y:()=>0}),canvasApp:{stage}});
 const root=stage.children.find(n=>n.label==='harbor-native-static:'+graphic)!;
 assert.ok(root);
 t.after(()=>{runtime.dispose();stage.destroy({children:true});texture.destroy(true);if(oldLocation)Object.defineProperty(globalThis,'location',oldLocation);else Reflect.deleteProperty(globalThis,'location')});
 return {actor,root,alpha:()=>{assert.equal(root.children.length,1);return (root.children[0] as Sprite).alpha},syncs:()=>syncs};
}

test('real gift/place/take commands update the mounted sprite immediately across three cycles',async t=>{
 let save=await fernAtHome(await fernInBag());
 const r=await renderer(t,()=>save.flags);
 assert.equal(r.alpha(),0);assert.equal(r.actor.animationName(),'hidden');
 for(let cycle=0;cycle<3;cycle++){
  save=await fernStep(save,'place');syncFernDisplay(r.actor,save.flags);
  assert.equal(r.alpha(),1);assert.equal(r.actor.animationName(),'stand');
  save=await fernStep(save,'take');syncFernDisplay(r.actor,save.flags);
  assert.equal(r.alpha(),0);assert.equal(r.actor.animationName(),'hidden');
  assert.deepEqual(r.actor.graphics(),[fernGraphicId]);
  const sprite=r.root.children[0],syncs=r.syncs();
  for(let tick=0;tick<120;tick++)syncFernDisplay(r.actor,save.flags);
  assert.equal(r.root.children[0],sprite,'stable state must not rebuild sprites each frame');
  assert.equal(r.syncs(),syncs,'stable state must not emit repeated synchronizations');
 }
});

test('scene entry projects hidden and displayed saves correctly without a prior visible frame',async t=>{
 for(const flags of [[],[fernDisplayFlag]])await t.test(flags.length?'displayed entry':'empty/bag entry',async child=>{
  const r=await renderer(child,()=>flags);
  assert.equal(r.alpha(),flags.length?1:0);
  assert.deepEqual(r.actor.graphics(),[fernGraphicId]);
 });
});

test('ordinary room decoration retains the default fully visible frame',async t=>{
 const prop=rooms.home.props.find(p=>!p.floorDecoration&&!p.visibleWhen&&!p.state&&p.art==='plant')!;
 assert.ok(prop,'the original room plant remains separate');
 const r=await renderer(t,()=>[],propId('home',prop));
 assert.equal(r.alpha(),1);
});
