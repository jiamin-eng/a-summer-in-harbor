// @ts-nocheck -- isolated original RPGJS/Pixi scene consumer; no save or API calls.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {terrainContacts} from '../src/world/terrain-contacts';

const out='../evidence/visual-v4/terrain-contacts';
await mkdir(out,{recursive:true});
const cases=[
 ['coast',{x:300,y:550},'stone-sand'],
 ['coast',{x:930,y:650},'sand-water'],
 ['beach',{x:500,y:600},'beach-shore'],
 ['coast',{x:1280,y:300},'grass-water'],
 ['coast',{x:1220,y:475},'coast-path-seam'],
 ['harbor',{x:1080,y:450},'stone-water'],
 ['harbor',{x:400,y:585},'stone-wood'],
 ['dock',{x:350,y:350},'wood-water'],
 ['path',{x:390,y:250},'path-water'],
];
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
const report={base:'9585df4',renderer:'real RPGJS/Pixi isolated harness',views:[],contactCounts:{},errors:[],externalRequestsBlocked:0,passed:false};
try{
 for(const id of ['station','harbor','market-bazaar','coast-beach-path','hill','dock','garden','camp','courtyard']){
  const contacts=terrainContacts(id),types={};for(const e of contacts){const key=[e.negative,e.positive].sort().join('/');types[key]=(types[key]??0)+(e.axis==='x'?e.rect.h:e.rect.w)}
  report.contactCounts[id]={count:contacts.length,lengths:types};
 }
 for(const [width,height] of [[320,568],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.addInitScript(()=>{window.__name=f=>f});
  await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){report.externalRequestsBlocked++;return route.abort()}return route.continue()});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5397/qa-renderer.html?debug=1');
  await page.waitForFunction(()=>!!window.harborRendererHarness,{timeout:30000});
  for(const [scene,position,label] of cases){
   await page.evaluate(async({scene,position})=>window.harborRendererHarness.restore(scene,position),{scene,position});
   await page.waitForTimeout(450);
   const file=`${width}-${label}.png`,status=await page.locator('#status').innerText();
   await page.screenshot({path:`${out}/${file}`});report.views.push({width,height,scene,position,status,file});
  }
  await context.close();
 }
 assert.equal(report.errors.length,0);assert.equal(report.externalRequestsBlocked,0);
 assert.ok(report.contactCounts['coast-beach-path'].lengths['sand/stone']>0);
 assert.ok(report.contactCounts['coast-beach-path'].lengths['sand/water']>0);
 assert.equal(report.contactCounts.harbor.count,0,'built harbor quay keeps authored edges');
 assert.equal(report.contactCounts.dock.count,0,'built dock keeps authored edges');
 report.passed=true;
}catch(e){report.errors.push(String(e));process.exitCode=1}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(JSON.stringify({passed:report.passed,views:report.views.length,errors:report.errors,contactCounts:report.contactCounts}));
