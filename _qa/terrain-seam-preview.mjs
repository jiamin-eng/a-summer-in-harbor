// Isolated original RPGJS/Pixi consumer. No API, account, save or media calls.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out=process.env.TERRAIN_QA_OUT??'../evidence/renderer',port=process.env.TERRAIN_QA_PORT??'5596';
const url=`http://127.0.0.1:${port}/qa-renderer.html?debug=1`;
const cases=[
 ['harbor',{x:1100,y:450},'stone-water'],
 ['harbor',{x:400,y:585},'stone-wood'],
 ['harbor',{x:600,y:740},'wood-water'],
 ['dock',{x:350,y:350},'dock-wood-water'],
 ['harbor',{x:105,y:600},'harbor-three-way'],
 ['dock',{x:345,y:530},'dock-three-way'],
 ['path',{x:460,y:370},'path-bridge'],
 ['coast',{x:930,y:650},'natural-shore-control'],
 ['coast',{x:550,y:115},'coast-north-exit'],
 ['coast',{x:70,y:475},'coast-west-exit'],
 ['beach',{x:500,y:570},'beach-control'],
 ['station',{x:400,y:395},'grass-stone-control'],
];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1']});
const report={base:'55c8eabc46fdd11d5f19195c135ef1b5ab2b6f0f',variant:process.env.TERRAIN_QA_VARIANT??'candidate',scope:'isolated real RPGJS/Pixi; browser screenshots for visual comparison',views:[],pageErrors:[],externalRequests:[],passed:false};
try{
 for(const [width,height] of [[320,568],[390,844],[1280,800]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',route=>{const target=new URL(route.request().url());if(target.hostname!=='127.0.0.1'){report.externalRequests.push(target.hostname);return route.abort()}return route.continue()});
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(String(error)));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.harborRendererHarness,{timeout:30000});
  for(const [scene,point,label] of cases.filter(([, ,label])=>!process.env.TERRAIN_QA_ONLY||process.env.TERRAIN_QA_ONLY.split(',').includes(label))){
   await page.evaluate(async({scene,point})=>window.harborRendererHarness.restore(scene,point),{scene,point});
   await page.waitForTimeout(350);
   const status=await page.locator('#status').innerText(),file=`${width}-${label}.png`;
   assert.match(status,new RegExp('^'+scene+' '));
   await page.screenshot({path:`${out}/${file}`});
   report.views.push({width,height,scene,point,label,status,file});
  }
  await context.close();
 }
 assert.equal(report.pageErrors.length,0);assert.equal(report.externalRequests.length,0);
 report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(JSON.stringify({passed:report.passed,views:report.views.length,pageErrors:report.pageErrors,externalRequests:report.externalRequests,failure:report.failure}));
