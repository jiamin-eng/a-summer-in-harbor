import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomInt} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

const out=new URL('../../evidence/combined-entry-map-20261013/',import.meta.url);
await mkdir(out,{recursive:true});
const report={scope:'Combined f6c + 9a + 8521 + d735 local Main/View/RPGJS, synthetic in-memory SQLite, no production or player account',cases:[],errors:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
let activePage;

const snapshot=()=>{
 const c=document.querySelector('#rpg')?.__rpgClient,stage=c?.canvasApp?.stage;
 const rendered=[];const visit=node=>{if(!node||node.destroyed)return;rendered.push(node);for(const child of node.children??[])visit(child)};visit(stage);
 const floor=rendered.filter(node=>node.label==='harbor-continuous-floors');
 const hero=rendered.filter(node=>node.texture?.source?.label?.includes('hero')&&node.visible!==false);
 const previous=(window.__qaRetired??[]).filter(p=>p!==c?.getCurrentPlayer()).map(p=>({disposed:p._harborSceneDisposed===true,tickClosed:p._harborTickSubscription?.closed===true}));
 return {scene:c?.activeRoom?.()?.name,players:Object.keys(c?.sceneMap?.players?.()??{}),playerId:c?.playerIdSignal?.(),heroSprites:hero.length,canvases:document.querySelectorAll('canvas').length,floorContainers:floor.length,floorChildren:floor[0]?.children?.length??0,previous,resourceQA:window.harborSpriteLifecycleQA?.()};
};

try{
 const ownerBase=randomInt(1000,9000);
 for(const [index,[width,height]] of [[320,568],[390,844]].entries()){
  const owner='99'+String(ownerBase+index);
  const context=await browser.newContext({viewport:{width,height},locale:'en-US'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const seed=await(await context.request.get(`http://127.0.0.1:5487/qa/prepare?owner=${owner}&scene=station`)).json();
  assert.ok(seed.id);
  await context.addInitScript(({id,owner})=>{window.Aigram={isInAigram:true,telegramId:owner,callAigramAPI:async()=>({})};window.__qaRetired=[];addEventListener('DOMContentLoaded',()=>{window.alteruLocalStorage.setItem('harbor-opening:'+id,'3');window.alteruLocalStorage.setItem('harbor-locale','en');window.alteruLocalStorage.setItem('harbor-muted','1')})},{id:seed.id,owner});
  const page=await context.newPage();activePage=page;page.on('pageerror',error=>report.errors.push(String(error)));
  page.setDefaultTimeout(20000);await page.goto('http://127.0.0.1:5486/?debug=1&terrain-native=1');
  await page.getByRole('button',{name:/Continue/}).first().click();
  await page.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),{},{timeout:30000});
  await page.waitForTimeout(250);
  const frames=[await page.evaluate(snapshot)];
  for(const dest of ['hill','harbor','station','hill','station']){
   await page.evaluate(()=>{const c=document.querySelector('#rpg').__rpgClient;window.__qaRetired.push(c.getCurrentPlayer())});
   await page.locator('.harbor-header').getByRole('button',{name:'Map',exact:true}).click();
   await page.getByLabel('Map area',{exact:true}).selectOption('all');
   await writeFile(new URL(`./${width}-${dest}-options.json`,out),JSON.stringify(await page.getByLabel('Choose destination',{exact:true}).locator('option').evaluateAll(options=>options.map(option=>({value:option.value,text:option.textContent}))),null,2));
   await page.getByLabel('Choose destination',{exact:true}).selectOption(dest);
   await page.getByRole('button',{name:/Quick return/}).click();
   await page.waitForFunction(dest=>document.querySelector('#rpg')?.__rpgClient?.activeRoom?.()?.name===dest&&!!document.querySelector('#rpg').__rpgClient.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),dest,{timeout:30000});
   await page.waitForTimeout(220);
   frames.push(await page.evaluate(snapshot));
  }
  for(const frame of frames){
   assert.equal(frame.players.length,1,JSON.stringify(frame));
   assert.equal(frame.heroSprites,1,JSON.stringify(frame));
   assert.equal(frame.canvases,1,JSON.stringify(frame));
   assert.equal(frame.floorContainers,1,JSON.stringify(frame));
   assert.ok(frame.floorChildren>0,JSON.stringify(frame));
   for(const prior of frame.previous){assert.equal(prior.disposed,true,JSON.stringify(frame));assert.equal(prior.tickClosed,true,JSON.stringify(frame))}
  }
  assert.ok(frames.at(-1).resourceQA.tickSubscriptionsDisposed>0);
  assert.equal(frames.at(-1).resourceQA.liveOwners,frames[0].resourceQA.liveOwners);
  assert.equal(frames.at(-1).resourceQA.liveTickSubscriptions,frames[0].resourceQA.liveTickSubscriptions);
  await page.screenshot({path:new URL(`./${width}-final.png`,out).pathname});
  report.cases.push({width,height,seedId:seed.id,frames});
  await writeFile(new URL('./report.json',out),JSON.stringify(report,null,2));
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
 report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error);if(activePage&&!activePage.isClosed()){report.failureBody=await activePage.locator('body').innerText().catch(()=>null);report.failureSnapshot=await activePage.evaluate(snapshot).catch(()=>null);await activePage.screenshot({path:new URL('./failure.png',out).pathname}).catch(()=>{})}throw error}
finally{await writeFile(new URL('./report.json',out),JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify({result:report.result,cases:report.cases.map(c=>({width:c.width,scenes:c.frames.map(f=>f.scene),players:c.frames.map(f=>f.players.length),heroes:c.frames.map(f=>f.heroSprites),floors:c.frames.map(f=>f.floorContainers)})),errors:report.errors}));
