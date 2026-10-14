// @ts-nocheck -- isolated visual QA against the real RPGJS/Pixi renderer.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='../evidence/visual-v4/renderer';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
const report={base:'9585df4',renderer:'real RPGJS/Pixi isolated harness',views:[],errors:[],externalRequestsBlocked:0,passed:false};
try{
 for(const [width,height] of [[320,568],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.addInitScript(()=>{window.__name=f=>f});
  await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){report.externalRequestsBlocked++;return route.abort()}return route.continue()});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5397/qa-renderer.html?debug=1');
  await page.waitForFunction(()=>!!window.harborRendererHarness,{timeout:30000});
  for(const [scene,position,label] of [
   ['market',{x:1092,y:335.192},'bakery-front'],
   ['market',{x:1092,y:395},'bakery-away'],
   ['hill',{x:1260,y:550},'east-road-end'],
   ['hill',{x:70,y:540},'west-road-end'],
   ['hill',{x:355,y:110},'garden-road-end'],
   ['hill',{x:1005,y:110},'camp-road-end'],
   ['station',{x:240,y:90},'rental-rear'],
   ['station',{x:112,y:200},'rental-left'],
   ['station',{x:240,y:340},'rental-front'],
   ['station',{x:912,y:95},'cafe-rear'],
   ['station',{x:912,y:305.194},'cafe-front'],
   ['station',{x:1072,y:660},'grocer-rear'],
   ['market',{x:224,y:90},'old-shop-rear'],
   ['market',{x:224,y:330.457},'old-shop-front'],
   ['harbor',{x:292,y:80},'workshop-rear'],
   ['harbor',{x:292,y:275.306},'workshop-front'],
   ['harbor',{x:794,y:95},'gym-rear'],
   ['harbor',{x:794,y:290.511},'gym-front'],
   ['coast',{x:1072,y:90},'tower-rear'],
   ['hill',{x:737,y:95},'weather-rear'],
  ]){
   await page.evaluate(async({scene,position})=>window.harborRendererHarness.restore(scene,position),{scene,position});
   await page.waitForTimeout(850);
   const status=await page.locator('#status').innerText();
   const visibleMasks=await page.evaluate(()=>{const stage=document.querySelector('#rpg').__rpgClient.canvasApp.stage;let count=0;const visit=n=>{if(n.label==='local-reveal-mask'&&n.visible)count++;for(const child of n.children??[])visit(child)};visit(stage);return count});
   const expectReveal=/rental-(rear|left)|(?:cafe|grocer|old-shop|workshop|gym|tower|weather)-rear/.test(label);
   assert.equal(visibleMasks>0,expectReveal,`${label}: local building reveal`);
   const file=`${width}-${label}.png`;
   await page.screenshot({path:`${out}/${file}`});
   report.views.push({width,height,scene,position,status,visibleMasks,file});
  }
  await context.close();
 }
 report.passed=report.errors.length===0;
}catch(e){report.errors.push(String(e));process.exitCode=1}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(JSON.stringify({passed:report.passed,views:report.views.map(v=>v.file),errors:report.errors,externalRequestsBlocked:report.externalRequestsBlocked}));
