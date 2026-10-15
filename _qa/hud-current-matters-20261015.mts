// @ts-nocheck -- isolated browser fixture reads the compiled RPGJS client hook.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {makeDemoServer} from './temporary-account-server';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {initial} from '../src/story/state';
import {rooms,entityAt} from '../src/world/data';

const out=resolve('..','evidence','hud-current-matters-20261015');mkdirSync(out,{recursive:true});
const directory=mkdtempSync('/tmp/harbor-current-matters-');
let fixture={scene:'station',position:rooms.station.spawn};
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{throw Error('QA_MODEL_DISABLED')},initial:(locale,id)=>({...initial(locale,id),scene:fixture.scene,position:fixture.position,flags:['key','unpacked'],known:['mara'],visited:Object.keys(rooms)})});
const server=await makeDemoServer({directory,accountOnly:true,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const dist=resolve('dist');const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const report={base:'61773abcf50159b91a0be27d6dbe6ac13dd70fe5',scope:'Compiled Main/View/RPGJS with local synthetic account/SQLite only. 320/390 zh/en, far/person/object proximity, matter selection/navigation, and person dialogue. External requests blocked.',cases:[],errors:[],nonLocalBlocked:0};let browser,page;
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
  const header=await rect(p,'.harbor-header'),clock=await rect(p,'.harbor-heading__time'),sound=await rect(p,'.harbor-heading--clock .harbor-sound'),nav=await rect(p,'.harbor-header nav button:first-child'),green=await rect(p,'.harbor-next-step'),heading=await rect(p,'.harbor-next-step__heading'),matterBody=await rect(p,'.harbor-next-step__objective'),matterArrow=await rect(p,'.harbor-next-step__go'),stick=await rect(p,'.harbor-stick');
  const prompt=await p.locator('.harbor-next-step').innerText();
  assert.equal(await p.locator('.harbor-objective').count(),0);assert.equal(await p.locator('.harbor-next-step .harbor-sound').count(),0);
  assert.ok(sound.width>=44&&sound.height>=44&&sound.x>=clock.right&&sound.right<=nav.x+1,`${name} sound placement`);
  assert.ok(green.height<=85&&green.bottom<spec.height-88&&green.right<=spec.width+1,`${name} compact green bounds`);
  assert.ok(heading.bottom<=matterBody.y+1&&matterBody.height>=44&&matterArrow.width>=44&&matterArrow.height>=44,`${name} title/body/arrow geometry`);
  assert.ok(matterArrow.x>=matterBody.right&&matterArrow.right<=green.right+1,`${name} arrow stays in green card`);
  assert.ok(await p.locator('.harbor-next-step__go').evaluate(e=>{const s=getComputedStyle(e);return s.backgroundColor!=='rgba(0, 0, 0, 0)'&&s.borderTopWidth!=='0px'}),`${name} visible green arrow`);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(prompt.includes(spec.locale==='zh'?'眼前的事':'Current matters'));
  if(scenario==='far')assert.ok(prompt.includes(spec.locale==='zh'?'选一件':'Choose from'),`${name} choice precedes navigation`);
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
   await p.locator('.harbor-next-step__go').click();
   const people=p.locator('.harbor-panel--people');await people.waitFor();
   const picker=people.locator('.harbor-matter-picker'),options=picker.locator('button[data-matter-id]');
   const optionCount=await options.count();assert.ok(optionCount>=2,`${name} multiple actual choices`);
   assert.equal(await people.locator('.harbor-matter-picker button[aria-pressed=true]').count(),0);
   await p.screenshot({path:out+'/'+name+'-choices.png'});
   await picker.locator('button[data-matter-id="garden-crops"]').click();await people.waitFor({state:'detached'});
   const chosenText=await p.locator('.harbor-next-step').innerText();assert.ok(chosenText.includes(spec.locale==='zh'?'花园里的作物':'Crops in the garden'),`${name} selected card`);
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
   if(hasJourney){await alternate.click();await people.waitFor({state:'detached'});assert.ok(!(await p.locator('.harbor-next-step').innerText()).includes(spec.locale==='zh'?'花园里的作物':'Crops in the garden'),`${name} changed selection`)}
   else{await people.locator('[data-menu-close]').click();await people.waitFor({state:'detached'})}
   matterFlow={options:optionCount,chosenText,destination,switched:hasJourney};
  }
  report.cases.push({name,header,clock,sound,nav,green,heading,matterBody,matterArrow,stick,action,prompt,soundBefore:before,soundAfter:after,conversation,matterFlow,result:'PASS'});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error);report.stack=error?.stack;await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true});writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({result:report.result,cases:report.cases.length,errors:report.errors,failure:report.failure}));
