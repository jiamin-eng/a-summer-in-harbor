// @ts-nocheck -- Browser QA runs the compiled Main/View with an isolated account and SQLite.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {makeDemoServer} from './temporary-account-server';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {GAME_UUID} from '../src/game-id';

const out=resolve('..','evidence','shell-safe-area');
await mkdir(out,{recursive:true});
const directory=mkdtempSync('/tmp/harbor-shell-safe-area-');
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{throw Error('QA_MODEL_DISABLED')}});
const server=await makeDemoServer({directory,accountOnly:true,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const dist=resolve('dist');
const impl=readFileSync('/Users/yin/code/games/harbor-login-diagnostic-owner-release-16c-20261011/evidence/guest-shell.impl.js','utf8');
assert.equal(createHash('sha256').update(impl).digest('hex'),'8e07e0f5e544fd40c96de342f54751f79ad0ba1bd8692651584d9c836d57ad4e');
const start=impl.indexOf('var bannerCss=`');
assert.ok(start>=0);
const css=impl.slice(start+'var bannerCss=`'.length,impl.indexOf('`;',start));
const report={scope:'Compiled Main/View/Pixi with isolated SQLite and synthetic temporary-unverified account. Visible external bar uses the saved real guest-shell banner CSS and equivalent shadow-host content; platform-layout hides it. No production API, real identity, physical device or Telegram.',baseCommit:'c1cd219',candidateCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cases:[],errors:[],nonLocalBlocked:0,realPlayerWrites:0};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf'};
let browser,currentPage;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
 for(const [width,height,locale] of [[320,568,'zh'],[320,568,'en'],[390,844,'zh'],[390,844,'en'],[1280,800,'en']]){
  const c=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US',serviceWorkers:'block'});
  await c.addInitScript(({locale})=>{window.__name=f=>f;localStorage.setItem('harbor-locale',locale);window.Aigram={isInAigram:true,telegramId:'710812',callAigramAPI:()=>Promise.resolve({retcode:0})}},{locale});
  await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1'){report.nonLocalBlocked++;return r.abort()}if(u.pathname.includes('/api/'))return r.fulfill({response:await r.fetch({url:server.url+u.pathname+u.search})});const file=resolve(dist,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(dist+'/')||!existsSync(file))return r.fulfill({status:404,body:'Missing'});return r.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)})});
  const p=await c.newPage();currentPage=p;p.setDefaultTimeout(30000);p.on('pageerror',e=>report.errors.push(`${width}: ${String(e)}`));
  await p.goto(server.url+'/?debug=1');
  await p.getByText(locale==='zh'?'宿主身份未验证':'host identity is unverified',{exact:false}).waitFor();
  await p.getByRole('button',{name:locale==='zh'?'新游戏':'New game',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),null,{timeout:60000});
  while(await p.locator('.harbor-opening button').isVisible())await p.locator('.harbor-opening button').click();
  const geometry=()=>p.evaluate(()=>{const q=s=>document.querySelector(s)?.getBoundingClientRect();const app=q('.harbor-app'),banner=q('#alteru-guest-banner'),system=[...document.querySelectorAll('.harbor-header nav button')].at(-1)?.getBoundingClientRect(),world=q('.harbor-world'),panel=q('.harbor-panel'),hit=document.elementFromPoint(system.left+system.width/2,system.top+system.height/2);return {appTop:app.top,appBottom:app.bottom,bannerBottom:banner?.bottom??null,systemTop:system.top,systemMid:[system.left+system.width/2,system.top+system.height/2],systemHit:hit?.closest('button')=== [...document.querySelectorAll('.harbor-header nav button')].at(-1),hitTag:hit?.tagName,hitClass:hit?.className,worldTop:world.top,panelTop:panel?.top??null,panelBottom:panel?.bottom??null,overflow:document.documentElement.scrollWidth>innerWidth+1}});
  const baseline=await geometry();assert.ok(Math.abs(baseline.appTop)<1);
  await p.screenshot({path:`${out}/${width}-${locale}-platform-layout.png`});
  await p.evaluate(css=>{const host=document.createElement('nav');host.id='alteru-guest-banner';host.setAttribute('aria-label','AlterU');const root=host.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=css;root.append(style);const brand=document.createElement('a');brand.className='nav-brand';brand.href='#';brand.innerHTML='<span>AlterU</span>';const right=document.createElement('div');right.className='nav-right';right.innerHTML='<a class="nav-cta" href="#">Open app</a><button class="nav-close" aria-label="Close">×</button>';right.querySelector('.nav-close').addEventListener('click',()=>host.remove());root.append(brand,right);document.body.append(host)},css);
  await p.waitForFunction(()=>{const a=document.querySelector('.harbor-app').getBoundingClientRect(),b=document.querySelector('#alteru-guest-banner').getBoundingClientRect();return a.top>=b.bottom+3});
  await p.screenshot({path:`${out}/${width}-${locale}-external-guest-before-interactive.png`});
  await p.waitForFunction(()=>!document.querySelector('.harbor-loading'));
  const external=await geometry();report.pending={width,baseline,external};await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');assert.ok(external.systemTop>=external.bannerBottom+3);assert.ok(external.systemHit);assert.ok(Math.abs(external.appBottom-height)<2);assert.equal(external.overflow,false);
  await p.screenshot({path:`${out}/${width}-${locale}-external-guest.png`});
  await p.locator('.harbor-header nav button').last().click();await p.locator('.harbor-panel').waitFor();
  const menu=await geometry();assert.ok(menu.panelTop>=external.bannerBottom+3);assert.ok(menu.panelBottom<=height+1);
  await p.screenshot({path:`${out}/${width}-${locale}-external-guest-system.png`});
  await p.locator('#alteru-guest-banner').evaluate(e=>e.style.display='none');
  await p.waitForFunction(()=>Math.abs(document.querySelector('.harbor-app').getBoundingClientRect().top)<1);
  const hidden=await geometry();assert.ok(Math.abs(hidden.appTop-baseline.appTop)<1);
  await p.locator('#alteru-guest-banner').evaluate(e=>e.style.display='');
  await p.waitForFunction(()=>document.querySelector('.harbor-app').getBoundingClientRect().top>0);
  await p.locator('#alteru-guest-banner').locator('button.nav-close').click();
  await p.waitForFunction(()=>Math.abs(document.querySelector('.harbor-app').getBoundingClientRect().top)<1);
  report.cases.push({width,height,locale,baseline,external,menu,hidden,result:'PASS'});await c.close();
 }
 assert.deepEqual(report.errors,[]);delete report.pending;report.result='PASS';
}catch(e){report.result='FAIL';report.failure=String(e);report.stack=e?.stack;report.loadingText=await currentPage?.locator('.harbor-loading').allTextContents().catch(()=>[]);await currentPage?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true});await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({result:report.result,cases:report.cases.length,failure:report.failure,errors:report.errors}));
