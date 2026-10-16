// @ts-nocheck -- isolated browser fixture reads the compiled RPGJS client hook.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {makeDemoServer} from './temporary-account-server';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {initial} from '../src/story/state';
import {rooms,entityAt} from '../src/world/data';

const out=resolve('..','evidence','hud-compact-pages-final-20261015');mkdirSync(out,{recursive:true});
const directory=mkdtempSync('/tmp/harbor-compact-pages-');
let fixture={scene:'station',position:rooms.station.spawn};
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{throw Error('QA_MODEL_DISABLED')},initial:(locale,id)=>({...initial(locale,id),scene:fixture.scene,position:fixture.position,flags:['key','unpacked'],known:['mara'],visited:Object.keys(rooms)})});
const server=await makeDemoServer({directory,accountOnly:true,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const dist=resolve('dist');const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const report={base:'0a4c607e70c82e20635a3f56798912e80f40b295',scope:'Compiled Main/View/RPGJS with local synthetic account/SQLite only. 320/390 zh/en, 3 actual matter pages, full chooser, focused map, far/person/object proximity and dialogue. External requests blocked.',baselineCardHeight:71,cases:[],errors:[],nonLocalBlocked:0};let browser,page;
const rect=async(p,selector)=>p.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}});
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
 for(const spec of [{width:320,height:568,locale:'zh'},{width:390,height:844,locale:'zh'},{width:320,height:568,locale:'en'},{width:390,height:844,locale:'en'}])for(const scenario of ['far','person','object']){
  fixture=scenario==='object'?{scene:'home',position:entityAt('home','bed').approach}:{scene:'station',position:scenario==='person'?entityAt('station','mara').approach:rooms.station.spawn};
  const name=`${spec.width}-${spec.locale}-${scenario}`;
  const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},locale:spec.locale==='zh'?'zh-CN':'en-US',serviceWorkers:'block'});
  await context.addInitScript(({locale})=>{window.__name=f=>f;localStorage.setItem('harbor-locale',locale);window.Aigram={isInAigram:true,telegramId:'710812',callAigramAPI:()=>Promise.resolve({retcode:0})}},{locale:spec.locale});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){report.nonLocalBlocked++;return route.abort()}if(u.pathname.includes('/api/'))return route.fulfill({response:await route.fetch({url:server.url+u.pathname+u.search})});const file=resolve(dist,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(dist+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)})});
  const p=await context.newPage();page=p;p.setDefaultTimeout(30000);p.on('pageerror',e=>report.errors.push(name+': '+String(e)));
  await p.goto(server.url+'/?debug=1');await p.getByRole('button',{name:spec.locale==='zh'?'新游戏':'New game',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),null,{timeout:60000});
  while(await p.locator('.harbor-opening button').isVisible())await p.locator('.harbor-opening button').click();
  if(scenario!=='far')await p.locator('.harbor-action.is-ready').waitFor({timeout:20000});else await p.locator('.harbor-next-step__objective').waitFor();
  await p.evaluate(()=>document.fonts.ready);
  const header=await rect(p,'.harbor-header'),clock=await rect(p,'.harbor-heading__time'),sound=await rect(p,'.harbor-heading--clock .harbor-sound'),nav=await rect(p,'.harbor-header nav button:first-child'),green=await rect(p,'.harbor-next-step'),heading=await rect(p,'.harbor-next-step__heading'),pager=await rect(p,'.harbor-next-step__pager'),matterBody=await rect(p,'.harbor-next-step__objective'),matterArrow=await rect(p,'.harbor-next-step__go'),stick=await rect(p,'.harbor-stick');
  const prompt=await p.locator('.harbor-next-step').innerText();
  assert.equal(await p.locator('.harbor-objective').count(),0);assert.equal(await p.locator('.harbor-next-step .harbor-sound').count(),0);
  assert.ok(sound.width>=44&&sound.height>=44&&sound.x>=clock.right&&sound.right<=nav.x+1,`${name} sound placement`);
  assert.ok(green.height<=61&&green.height<=report.baselineCardHeight-10&&green.bottom<spec.height-88&&green.right<=spec.width+1,`${name} compact green bounds ${green.height}`);
  assert.ok(heading.bottom<=matterBody.y+2&&matterBody.height>=28&&matterArrow.width>=44&&matterArrow.height>=44,`${name} title/body/arrow geometry`);
  assert.ok(pager.width>=44&&pager.height>=24&&pager.y<=heading.y+1&&pager.bottom>=heading.bottom-1,`${name} visible tappable page number`);
  assert.ok(matterArrow.x>=matterBody.right&&matterArrow.right<=green.right+1,`${name} arrow stays in green card`);
  assert.ok(await p.locator('.harbor-next-step__go').evaluate(e=>{const s=getComputedStyle(e);return s.backgroundColor!=='rgba(0, 0, 0, 0)'&&s.borderTopWidth!=='0px'}),`${name} visible green arrow`);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(prompt.includes(spec.locale==='zh'?'眼前的事':'Current matters'));
  assert.equal((await p.locator('.harbor-next-step__pager').innerText()).trim(),'1/3',`${name} first real matter page`);
  assert.ok(prompt.includes(spec.locale==='zh'?'玛拉':'Mara'),`${name} actual first action`);
  assert.ok(!prompt.includes(spec.locale==='zh'?'互动':'Interact with'),`${name} interaction stays outside objective`);
  assert.equal(await p.locator('.harbor-next-step small[role=status]').count(),0);
  let action=null;
  if(scenario==='far')assert.equal(await p.locator('.harbor-action').count(),0);
  else{
   action=await rect(p,'.harbor-action.is-ready');
   assert.ok(action.width>=44&&action.height>=44&&action.x>=stick.right+8&&action.right<=spec.width-10&&action.bottom<=spec.height-18&&action.bottom>=spec.height-50,`${name} right-bottom safe interaction`);
   assert.ok((await p.locator('.harbor-action.is-ready').innerText()).includes(scenario==='person'?(spec.locale==='zh'?'玛拉':'Mara'):(spec.locale==='zh'?'床':'Bed')));
  }
  await p.screenshot({path:out+'/'+name+'.png'});
  const before=await p.locator('.harbor-heading--clock .harbor-sound').getAttribute('aria-pressed');
  await p.locator('.harbor-heading--clock .harbor-sound').click();
  const after=await p.locator('.harbor-heading--clock .harbor-sound').getAttribute('aria-pressed');assert.notEqual(before,after);
  assert.equal(await p.evaluate(()=>window.alteruLocalStorage.getItem('harbor-muted')),after==='true'?'0':'1');
  if(name==='320-zh-far')await p.screenshot({path:out+'/'+name+'-sound-toggled.png'});
  let conversation=null;
  if(scenario==='person'){
   await p.locator('.harbor-action.is-ready').click();
   const panel=p.locator('.harbor-panel--conversation');await panel.waitFor();
   assert.ok((await panel.locator('header h2').innerText()).length>0);assert.ok(await panel.locator('.harbor-dialogue').count()>0);
   await p.waitForFunction(()=>{const img=document.querySelector('.harbor-panel--conversation .harbor-portrait img');return !img||img.complete&&img.naturalWidth>0},null,{timeout:10000});
   const white=await rect(p,'.harbor-panel--conversation');assert.ok(white.y>=green.bottom-1&&white.right<=spec.width+1,`${name} dialogue bounds`);assert.equal(await p.locator('.harbor-controls').count(),0);
   await p.screenshot({path:out+'/'+name+'-dialogue.png'});
   const body=panel.locator('.harbor-panel__body');
   const scroll=await body.evaluate(e=>({client:e.clientHeight,total:e.scrollHeight}));
   const choices=await panel.locator('.harbor-choices button').count();assert.ok(choices>0&&scroll.total>scroll.client+2,`${name} scrollable choices`);
   await body.evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await body.evaluate(e=>e.scrollTop)>0);await p.screenshot({path:out+'/'+name+'-options.png'});
   conversation={white,scroll,choices,returnButton:await panel.locator('.harbor-panel__return').count()};
   await panel.locator('[data-menu-close]').click();await panel.waitFor({state:'detached'});await p.locator('.harbor-controls').waitFor();
  }
  let matterFlow=null;
  if(scenario==='far'){
   const pageHeights=[green.height],pageTexts=[await p.locator('.harbor-next-step__objective').innerText()];
   for(let i=2;i<=3;i++){
    await p.locator('.harbor-next-step__pager').click();
    assert.equal((await p.locator('.harbor-next-step__pager').innerText()).trim(),i+'/3',`${name} page ${i}`);
    const pageText=await p.locator('.harbor-next-step__objective').innerText();assert.notEqual(pageText,pageTexts.at(-1));pageTexts.push(pageText);
    const current=await rect(p,'.harbor-next-step');pageHeights.push(current.height);
    assert.ok(current.height<=61,`${name} page ${i} height ${current.height}`);
    assert.ok(await p.locator('.harbor-next-step__objective').evaluate(e=>e.scrollHeight<=e.clientHeight+1),`${name} page ${i} no clipped action`);
    await p.screenshot({path:out+'/'+name+'-page-'+i+'.png'});
   }
   assert.ok(pageTexts[2].toLowerCase().includes(spec.locale==='zh'?'花园':'garden'),`${name} third real action`);
   const longLayout=await p.locator('.harbor-next-step__objective').evaluate((e,sample)=>{const original=e.textContent;e.textContent=sample;const card=e.closest('.harbor-next-step');const result={cardHeight:card.getBoundingClientRect().height,bodyClient:e.clientHeight,bodyScroll:e.scrollHeight};e.textContent=original;return result},spec.locale==='zh'?'沿公共路线去车站街，找到玛拉确认昨天约好的事，再去海岸记录新发现；这些步骤可以按自己的顺序完成。':'Follow the public route to Station Street, speak with Mara about the plan, then visit the coast to record what you discover.');
   assert.ok(longLayout.cardHeight>pageHeights[2]&&longLayout.bodyScroll<=longLayout.bodyClient+1,`${name} longer matter expands without clipping`);
   await p.locator('.harbor-next-step__go').click();
   const people=p.locator('.harbor-panel--people');await people.waitFor();
   const picker=people.locator('.harbor-matter-picker'),options=picker.locator('button[data-matter-id]');
   const optionCount=await options.count();assert.ok(optionCount>=2,`${name} multiple actual choices`);
   assert.equal(await people.locator('.harbor-matter-picker button[aria-pressed=true]').count(),1);
   assert.equal(await picker.locator('button[data-matter-id="garden-crops"]').getAttribute('aria-pressed'),'true');
   await p.screenshot({path:out+'/'+name+'-choices.png'});
   await picker.locator('button[data-matter-id="garden-crops"]').click();await people.waitFor({state:'detached'});
   const chosenText=await p.locator('.harbor-next-step').innerText();assert.ok(chosenText.toLowerCase().includes(spec.locale==='zh'?'花园':'garden'),`${name} selected card`);
   await p.screenshot({path:out+'/'+name+'-selected.png'});
   await p.locator('.harbor-next-step__objective').click();const map=p.locator('.harbor-panel--map');await map.waitFor();
   const destination=await map.locator('select[aria-label="'+(spec.locale==='zh'?'选择目的地':'Choose destination')+'"]').inputValue();assert.equal(destination,'garden',`${name} selected map destination`);
   assert.ok(await map.locator('.harbor-spatial-destination').count()>0,`${name} actual route controls`);
   await p.screenshot({path:out+'/'+name+'-route.png'});
   await map.locator('[data-menu-close]').click();await map.waitFor({state:'detached'});
   await p.locator('.harbor-next-step__go').click();await people.waitFor();
   assert.equal(await picker.locator('button[data-matter-id="garden-crops"]').getAttribute('aria-pressed'),'true',`${name} remembered selection`);
   await p.screenshot({path:out+'/'+name+'-switch.png'});
   const alternate=picker.locator('button[data-matter-id="journey"]'),hasJourney=await alternate.count()>0;
   if(hasJourney){await alternate.click();await people.waitFor({state:'detached'});assert.equal((await p.locator('.harbor-next-step__pager').innerText()).trim(),'1/3',`${name} changed selection`)}
   else{await people.locator('[data-menu-close]').click();await people.waitFor({state:'detached'})}
   matterFlow={options:optionCount,pageTexts,pageHeights,longLayout,chosenText,destination,switched:hasJourney};
  }
  report.cases.push({name,header,clock,sound,nav,green,heading,pager,matterBody,matterArrow,stick,action,prompt,soundBefore:before,soundAfter:after,conversation,matterFlow,result:'PASS'});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error);report.stack=error?.stack;await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true});writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({result:report.result,cases:report.cases.length,errors:report.errors,failure:report.failure}));
