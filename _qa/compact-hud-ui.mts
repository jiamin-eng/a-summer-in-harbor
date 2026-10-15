// @ts-nocheck -- compiled Main/View with isolated synthetic account and local SQLite.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {makeDemoServer} from './temporary-account-server';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {initial} from '../src/story/state';
import {rooms,entityAt} from '../src/world/data';

const out=resolve('..','evidence','compact-ui','candidate');mkdirSync(out,{recursive:true});
const directory=mkdtempSync('/tmp/harbor-compact-hud-');
let fixture={scene:'station',position:rooms.station.spawn};
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{throw Error('QA_MODEL_DISABLED')},initial:(locale,id)=>({...initial(locale,id),scene:fixture.scene,position:fixture.position,flags:['key','unpacked'],known:['mara'],visited:Object.keys(rooms)})});
const server=await makeDemoServer({directory,accountOnly:true,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const dist=resolve('dist');const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const report={scope:'Local compiled Main/View/RPGJS, synthetic accounts and SQLite only; external requests blocked. No real Telegram or physical phone.',cases:[],errors:[],nonLocalBlocked:0};let browser,page;
const rect=async(p,selector)=>p.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}});
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
 for(const spec of [
  {width:320,height:568,locale:'zh',name:'empty-320-zh',scene:'station',position:rooms.station.spawn,near:false},
  {width:390,height:844,locale:'en',name:'mara-390-en',scene:'station',position:entityAt('station','mara').approach,near:true},
  {width:1280,height:800,locale:'en',name:'mara-desktop-en',scene:'station',position:entityAt('station','mara').approach,near:true},
  {width:320,height:568,locale:'en',name:'garden-multi-320-en',scene:'garden',position:entityAt('garden','crop-bed-1').approach,near:true},
 ]){
  fixture={scene:spec.scene,position:spec.position};
  const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},locale:spec.locale==='zh'?'zh-CN':'en-US',serviceWorkers:'block'});
  await context.addInitScript(({locale})=>{window.__name=f=>f;localStorage.setItem('harbor-locale',locale);window.Aigram={isInAigram:true,telegramId:'710812',callAigramAPI:()=>Promise.resolve({retcode:0})}},{locale:spec.locale});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){report.nonLocalBlocked++;return route.abort()}if(u.pathname.includes('/api/'))return route.fulfill({response:await route.fetch({url:server.url+u.pathname+u.search})});const file=resolve(dist,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(dist+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)})});
  const p=await context.newPage();page=p;p.setDefaultTimeout(30000);p.on('pageerror',e=>report.errors.push(spec.name+': '+String(e)));
  await p.goto(server.url+'/?debug=1');await p.getByRole('button',{name:spec.locale==='zh'?'新游戏':'New game',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),null,{timeout:60000});
  while(await p.locator('.harbor-opening button').isVisible())await p.locator('.harbor-opening button').click();
  if(spec.near)await p.locator('.harbor-action.is-ready').waitFor({timeout:20000});else await p.locator('.harbor-interaction-hint').waitFor();
  const header=await rect(p,'.harbor-header'),location=await rect(p,'.harbor-location'),sound=await rect(p,'.harbor-sound'),stick=await rect(p,'.harbor-stick');
  const nav=await p.locator('.harbor-header nav button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),width:r.width,height:r.height}}));
  assert.equal(nav.length,4);assert.ok(nav.every(x=>x.width>=44&&x.height>=44));assert.ok(sound.width>=44&&sound.height>=44);assert.ok(sound.right<=location.right+1);assert.ok(stick.width>=88&&stick.height>=88);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(await p.locator('.harbor-action').count(),spec.near?1:0);
  await p.screenshot({path:out+'/'+spec.name+'.png'});
  const gapHit=await p.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.harbor-controls'),{x:stick.right+5,y:stick.bottom-20});assert.ok(gapHit,'control gap must not forward a tap to the map');await p.mouse.click(stick.right+5,stick.bottom-20);assert.equal(await p.locator('.harbor-panel').count(),0);
  if(spec.near){await p.locator('.harbor-action').click();await p.locator('.harbor-panel--entity').waitFor();await p.screenshot({path:out+'/'+spec.name+'-interaction.png'});await p.locator('[data-menu-close]').click();await p.locator('.harbor-controls').waitFor()}
  if(spec.name==='empty-320-zh')for(const section of ['map','people','bag','menu']){await p.locator('.harbor-header nav button').nth(['map','people','bag','menu'].indexOf(section)).click();await p.locator('.harbor-panel--'+section).waitFor();await p.locator('[data-menu-close]').click();await p.locator('.harbor-controls').waitFor()}
  const soundBefore=await p.locator('.harbor-sound').getAttribute('aria-pressed');await p.locator('.harbor-sound').click();const soundAfter=await p.locator('.harbor-sound').getAttribute('aria-pressed');assert.notEqual(soundAfter,soundBefore);assert.equal(await p.evaluate(()=>window.alteruLocalStorage.getItem('harbor-muted')),soundAfter==='true'?'0':'1');
  await p.locator('.harbor-header nav button').last().click();await p.locator('.harbor-panel--menu').waitFor();await p.getByRole('button',{name:spec.locale==='zh'?'设置':'Settings'}).click();await p.getByRole('button',{name:spec.locale==='zh'?'返回上一处':'Back'}).click();await p.locator('.harbor-panel--menu').waitFor();await p.locator('[data-menu-close]').click();await p.locator('.harbor-controls').waitFor();
  assert.equal(await p.locator('.harbor-sound').getAttribute('aria-pressed'),soundAfter);
  if(spec.name==='empty-320-zh'){await p.reload();await p.getByRole('button',{name:'继续',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),null,{timeout:60000});await p.locator('.harbor-interaction-hint').waitFor();assert.equal(await p.locator('.harbor-sound').getAttribute('aria-pressed'),soundAfter);await p.screenshot({path:out+'/'+spec.name+'-reloaded.png'})}
  if(spec.name==='mara-390-en'){await p.keyboard.down('ArrowDown');await p.waitForTimeout(900);await p.keyboard.up('ArrowDown');await p.locator('.harbor-interaction-hint').waitFor({timeout:10000});await p.screenshot({path:out+'/'+spec.name+'-left-target.png'});await p.keyboard.down('ArrowUp');await p.waitForTimeout(900);await p.keyboard.up('ArrowUp');await p.locator('.harbor-action.is-ready').waitFor({timeout:10000});await p.screenshot({path:out+'/'+spec.name+'-returned-target.png'})}
  const center={x:stick.x+stick.width/2,y:stick.y+stick.height/2};await p.mouse.move(center.x,center.y);await p.mouse.down();await p.mouse.move(center.x+24,center.y,{steps:4});const drag=await p.locator('.harbor-stick__knob').evaluate(e=>getComputedStyle(e).transform);assert.notEqual(drag,'none');await p.mouse.up();await p.waitForFunction(()=>getComputedStyle(document.querySelector('.harbor-stick__knob')).transform==='matrix(1, 0, 0, 1, 0, 0)');
  if(!spec.near){await p.locator('.harbor-location__details>span').evaluate(e=>e.textContent='A very long coastal market and harbor station location name');await p.screenshot({path:out+'/'+spec.name+'-long-location.png'});const stressed=await rect(p,'.harbor-location'),rightSound=await rect(p,'.harbor-sound');assert.ok(rightSound.right<=stressed.right+1);assert.ok(stressed.right<=spec.width+1);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
  report.cases.push({name:spec.name,header,location,sound,stick,nav,soundBefore,soundAfter,drag,near:spec.near,result:'PASS'});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error);report.stack=error?.stack;await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true});writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({result:report.result,cases:report.cases.length,errors:report.errors,failure:report.failure}));
