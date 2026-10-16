// @ts-nocheck -- browser fixture uses a local runtime hook exposed by compiled RPGJS.
// Four font comparisons on the compiled, unchanged 71c3d8d game UI.
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
import {makeDemoServer} from './temporary-account-server';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';

const out = resolve('..', 'evidence', 'clock-font-20261015');
mkdirSync(out, {recursive:true});
const directory = mkdtempSync('/tmp/harbor-clock-font-');
const assembly = createExplorationAssembly({
  crabEnabled:true,
  resolveDialogue:async()=>{throw Error('QA_MODEL_DISABLED')},
  initial:(locale,id)=>({...initial(locale,id),scene:'station',position:rooms.station.spawn,flags:['key','unpacked'],known:['mara'],visited:Object.keys(rooms)})
});
const server = await makeDemoServer({directory,accountOnly:true,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const dist = resolve('dist');
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const jersey10Path='/Users/yin/code/games/toy-rampage/src/pixel/fonts/Jersey10-Regular.ttf';
const jersey10=readFileSync(jersey10Path).toString('base64');
const variants=[
  {id:'a-jersey15-regular',label:'Jersey 15 Regular',family:'Harbor Display',size:34},
  {id:'b-jersey10-regular',label:'Jersey 10 Regular',family:'Clock Jersey 10',size:34},
  {id:'c-fusion-pixel-regular',label:'Fusion Pixel Regular',family:'Harbor Pixel',size:28},
  {id:'d-menlo-regular',label:'Menlo Regular',family:'Menlo',size:25},
];
const report:any={base:'71c3d8d766ff59ac2eeaa6e307447cc22b11c5d4',scope:'Compiled Main/View/RPGJS, one local synthetic account, station at 09:00, 320x568; only clock glyph CSS changes.',jersey10Source:jersey10Path,variants:[],errors:[],blockedExternal:0};
let browser:any;
try {
  browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width:320,height:568},locale:'zh-CN',serviceWorkers:'block'});
  await context.addInitScript(()=>{(window as any).__name=(f:any)=>f;localStorage.setItem('harbor-locale','zh');(window as any).Aigram={isInAigram:true,telegramId:'710812',callAigramAPI:()=>Promise.resolve({retcode:0})}});
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='127.0.0.1'){report.blockedExternal++;return route.abort()}
    if(u.pathname.includes('/api/'))return route.fulfill({response:await route.fetch({url:server.url+u.pathname+u.search})});
    const file=resolve(dist,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
    if(!file.startsWith(dist+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});
    return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)});
  });
  const page=await context.newPage();
  page.on('pageerror',(e:any)=>report.errors.push(String(e)));
  await page.goto(server.url+'/?debug=1');
  await page.getByRole('button',{name:'新游戏',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),null,{timeout:60000});
  while(await page.locator('.harbor-opening button').isVisible())await page.locator('.harbor-opening button').click();
  await page.locator('.harbor-interaction-hint').waitFor();
  await page.addStyleTag({content:`@font-face{font-family:'Clock Jersey 10';src:url(data:font/ttf;base64,${jersey10}) format('truetype');font-weight:400;font-display:block}`});
  const fixed=await page.evaluate(()=>({meta:document.querySelector('.harbor-heading__meta')?.textContent,time:document.querySelector('.harbor-heading__time')?.textContent,place:document.querySelector('.harbor-heading__place')?.textContent,header:(()=>{const r=document.querySelector('.harbor-header')!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()}));
  assert.equal(fixed.time,'09:00');
  for(const variant of variants){
    await page.locator('#clock-option').evaluateAll(es=>es.forEach(e=>e.remove()));
    const style=await page.addStyleTag({content:`.harbor-heading--clock .harbor-heading__time{font-family:'${variant.family}' !important;font-size:${variant.size}px !important;font-weight:400 !important;text-shadow:none !important;font-synthesis:none !important}`});
    await style.evaluate(e=>e.id='clock-option');
    await page.evaluate(({family,size})=>document.fonts.load(`${size}px '${family}'`),variant);
    await page.waitForTimeout(100);
    const measured=await page.evaluate(()=>{
      const e=document.querySelector('.harbor-heading__time') as HTMLElement,r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const glyph=range.getBoundingClientRect();const s=getComputedStyle(e);
      return {family:s.fontFamily,weight:s.fontWeight,size:s.fontSize,clock:e.textContent,box:{x:r.x,y:r.y,width:r.width,height:r.height},glyph:{x:glyph.x,y:glyph.y,width:glyph.width,height:glyph.height},header:(()=>{const h=document.querySelector('.harbor-header')!.getBoundingClientRect();return {x:h.x,y:h.y,width:h.width,height:h.height}})(),meta:document.querySelector('.harbor-heading__meta')?.textContent,place:document.querySelector('.harbor-heading__place')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    assert.equal(measured.clock,fixed.time);assert.equal(measured.meta,fixed.meta);assert.equal(measured.place,fixed.place);assert.deepEqual(measured.header,fixed.header);assert.equal(measured.overflow,false);
    assert.ok(measured.glyph.x>=measured.box.x-1&&measured.glyph.x+measured.glyph.width<=measured.box.x+measured.box.width+1,`${variant.id} clipped`);
    const filename=`${variant.id}-320-zh.png`;
    await page.screenshot({path:resolve(out,filename)});
    report.variants.push({...variant,filename,weight:400,measured});
  }
  assert.deepEqual(report.errors,[]);report.result='PASS';
  await context.close();
}catch(error:any){report.result='FAIL';report.failure=String(error);report.stack=error?.stack;process.exitCode=1}
finally{await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true});writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({result:report.result,variants:report.variants.length,failure:report.failure}));
