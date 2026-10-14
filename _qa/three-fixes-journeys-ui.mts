// @ts-nocheck -- isolated local account and SQLite; actual compiled Main UI.
import {chromium} from 'playwright';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {makeDemoServer} from './temporary-account-server';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
import {GAME_UUID} from '../src/game-id';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';

const out='../evidence/visual-v4/journeys';
await mkdir(out,{recursive:true});
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{throw Error('NO_MODEL_IN_QA')},initial:(locale,id)=>({...initial(locale,id),scene:'station',position:{...rooms.station.spawn}})});
const server=await makeDemoServer({directory:mkdtempSync('/tmp/harbor-three-fixes-journeys-'),port:0,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.tmx':'application/xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
const report={base:'9585df4d57a256e66fb790278ea1a47422e27fbc',scope:'compiled local Main and real Journeys with synthetic normal browser-cookie account/SQLite',cases:[],externalRequestsBlocked:0,errors:[],passed:false};
let lastPage;
try{
 for(const [width,height,locale] of [[320,568,'zh'],[320,568,'en'],[390,844,'zh'],[390,844,'en'],[430,844,'zh'],[430,844,'en']]){
  const c=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US',serviceWorkers:'block'});
  await c.addInitScript(({width,locale})=>{window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:'990771'+width+(locale==='zh'?'1':'2'),callAigramAPI:async()=>({})};addEventListener('DOMContentLoaded',()=>{window.alteruLocalStorage.setItem('harbor-locale',locale);window.alteruLocalStorage.setItem('harbor-muted','1')})},{width,locale});
  await c.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){report.externalRequestsBlocked++;return route.abort()}
   if(u.pathname.includes('/api/'))return route.fulfill({response:await route.fetch()});
   const file=resolve('dist','.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
   if(!file.startsWith(resolve('dist')+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});
   return route.fulfill({contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)})});
  const p=await c.newPage();lastPage=p;p.on('pageerror',e=>report.errors.push(String(e)));p.setDefaultTimeout(20000);
  const tx=(zh,en)=>locale==='zh'?zh:en;
  const finishOpening=async()=>{for(let i=0;i<8&&await p.locator('.harbor-opening button').count();i++)await p.locator('.harbor-opening button').click();await p.locator('.harbor-opening').waitFor({state:'hidden'})};
  await p.goto(server.url+'/?debug=1');
  await p.getByRole('button',{name:tx('新游戏','New game'),exact:true}).click();
  await p.locator('.harbor-opening button').waitFor();
  await finishOpening();
  const journeys=async()=>{await p.locator('.harbor-header nav').getByRole('button',{name:tx('系统','System'),exact:true}).click();await p.getByRole('button',{name:tx('我的旅程','My journeys'),exact:true}).click();await p.locator('.harbor-journeys__list').waitFor()};
  await journeys();
  await p.getByRole('button',{name:tx('开启独立的新旅程','Start a separate new journey'),exact:true}).click();
  await p.getByRole('button',{name:tx('保留旧档，开启新旅程','Keep old journeys and start new'),exact:true}).click();
  await p.locator('.harbor-opening button').waitFor();
  await finishOpening();
  await journeys();
  const rows=p.locator('.harbor-journeys__list article');await rows.first().waitFor();assert.equal(await rows.count(),2);
  const old=rows.filter({has:p.getByRole('button',{name:tx('继续这段旅程','Continue this journey'),exact:true})});assert.equal(await old.count(),1);
  const boxes=await old.evaluate(e=>{const t=e.querySelector('.harbor-journeys__footer small'),b=e.querySelector('.harbor-journeys__footer button'),r=x=>x.getBoundingClientRect().toJSON();return {time:r(t),button:r(b),card:r(e),viewport:innerWidth,footerStyle:getComputedStyle(b.parentElement).display}});
  const overlap=boxes.time.x<boxes.button.right&&boxes.time.right>boxes.button.x&&boxes.time.y<boxes.button.bottom&&boxes.time.bottom>boxes.button.y;
  assert.equal(boxes.footerStyle,'flex');assert.equal(overlap,false,'timestamp and continuation button overlap');
  assert.ok(boxes.button.right<=boxes.card.right+1&&boxes.button.right<=width+1,'button stays right-aligned within card and viewport');
  assert.ok(Math.abs(boxes.button.right-boxes.card.right)<2,'button aligns to card right edge');
  await old.scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${width}-${locale}-old-journey.png`});
  report.cases.push({width,height,locale,rows:2,boxes,overlap:false});await c.close();
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.failure=String(e);report.lastView=await lastPage?.locator('body').innerText().catch(()=>null);await lastPage?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();await server.close()}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(c=>({width:c.width,overlap:c.overlap})),failure:report.failure,errors:report.errors}));
