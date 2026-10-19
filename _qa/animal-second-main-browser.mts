// @ts-nocheck -- local synthetic Main/View browser acceptance, never player data.
import {chromium} from 'playwright';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeDemoServer} from './temporary-account-server';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createReviewedAnimalArcLife} from '../server/reviewed-animal-life';
import {withWildMint} from '../server/wild-mint';
import {withBasilPlantUses} from '../server/plant-basil';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
import {pinLegacy} from '../src/life/save';
import {createPlantsRegistry} from '../server/life-plants-b2';
import {observationId} from '../src/animal-life/types';
import first from '../server/content/reviewed-evening-gull-watch.json';
import second from '../server/content/phase2-quiet-after-gulls.json';
import {GAME_UUID} from '../src/game-id';
const root=resolve('dist'),out=resolve('../evidence/main-view');await mkdir(out,{recursive:true});
const temp=mkdtempSync('/tmp/harbor-animal-second-main-');let modelCalls=0,server,browser;
const report:any={result:'FAIL',scope:'built Main/View with synthetic local account and in-memory/temporary SQLite; no real player, model or publish',cases:[],blockedExternal:0,modelCalls:0};
const assembly=createExplorationAssembly({crabEnabled:true,now:()=>100000,boot:'animal-second-main-only',createLife:createReviewedAnimalArcLife,
 resolveDialogue:async()=>{modelCalls++;throw Error('MODEL_DISABLED')},
 decorateLife:(life:any)=>withWildMint(withBasilPlantUses(life,{enabled:true,newStarts:true}),{enabled:true,newStarts:true}),
 initial:(locale:any,id:string)=>{
  const s:any=pinLegacy({...initial(locale,id),scene:'garden',position:{...rooms.garden.entities.find(e=>e.person==='dani')!.approach},
   townMinutes:540,known:['mara','dani'],visited:Object.keys(rooms),flags:['key','unpacked','route-open','market-open'],items:{key:1},
   animalNotebookV1:{schema:1,briefs:[],pages:[{ref:first.ref,sourceAction:'a'.repeat(16),minute:500}]}},createPlantsRegistry());
  const gull=observationId('harbor-gull-3','shore-space');s.lifeV1.collections[gull]={id:gull,sourceAction:'b'.repeat(16),minute:500,source:{kind:'animal-schedule',id:'harbor-gull-3',visualVersion:'coastal-gull-v1'}};
  return s;
 }});
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.tmx':'application/xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
try{
 server=await makeDemoServer({directory:temp,providedRuntime:assembly.runtime,decorateAuthority:assembly.decorateAuthority,lifeProject:assembly.lifeProject,landProject:assembly.landProject});
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
 for(const [width,height,locale,owner] of [[320,568,'zh','990941'],[390,844,'en','990942']] as const){
  const context=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US',hasTouch:true,serviceWorkers:'block'});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==server.url){report.blockedExternal++;return route.abort()}if(u.pathname.includes('/api/'))return route.continue();
   const file=resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});
   return route.fulfill({contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)});
  });
  await context.addInitScript(({owner,locale})=>{(window as any).__name=(f:any)=>f;(window as any).Aigram={isInAigram:true,telegramId:owner,callAigramAPI:async()=>({})};addEventListener('DOMContentLoaded',()=>{(window as any).alteruLocalStorage.setItem('harbor-locale',locale);(window as any).alteruLocalStorage.setItem('harbor-muted','1')})},{owner,locale});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(20000);
  const tx=(zh:string,en:string)=>locale==='zh'?zh:en;
  await page.goto(server.url+'/?debug=1');
  await page.waitForTimeout(700);report.entry={url:page.url(),buttons:await page.getByRole('button').allTextContents(),body:(await page.locator('body').innerText()).slice(0,1500),errors};
  await page.screenshot({path:`${out}/${width}-${locale}-entry.png`});
  await page.getByRole('button',{name:tx('新游戏','New game'),exact:true}).click();
  for(let i=0;i<4&&await page.locator('.harbor-opening button').isVisible();i++)await page.locator('.harbor-opening button').click();
  await page.waitForFunction(()=>document.querySelector<any>('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  for(let i=0;i<4&&await page.locator('.harbor-opening button').isVisible();i++)await page.locator('.harbor-opening button').click();
  await page.locator('[data-target="dani"]').focus();await page.keyboard.press('Enter');
  await page.waitForTimeout(700);report.interaction={dani:await page.locator('[data-target="dani"]').evaluate(e=>({near:e.getAttribute('data-near'),readable:e.getAttribute('data-readable')})),body:(await page.locator('body').innerText()).slice(0,1700),action:await page.locator('.harbor-action').allTextContents(),errors};
  await page.screenshot({path:`${out}/${width}-${locale}-dani-focus.png`});
  await page.locator('.harbor-action.is-ready').click();
  const card=page.locator(`[data-animal-commission="${second.ref.id}"]`);await card.waitFor();
  await card.getByRole('button',{name:tx('聊聊动物日常','Ask about animal routines')}).click();
  await page.locator('.harbor-reply__next button').waitFor({timeout:10000});
  for(let i=0;i<20&&await page.locator('.harbor-reply__next button').count();i++)await page.locator('.harbor-reply__next button').click();
  report.afterBrief={card:(await card.innerText()).slice(0,1200),body:(await page.locator('body').innerText()).slice(0,1300),errors};
  await card.getByRole('button',{name:tx('读过了，接下这份观察约定','I have read it: accept this observation plan')}).click();
  await page.locator('.harbor-reply__next button').waitFor({timeout:10000});
  for(let i=0;i<20&&await page.locator('.harbor-reply__next button').count();i++)await page.locator('.harbor-reply__next button').click();
  await card.locator('[data-animal-active-brief]').waitFor();const interaction=await card.locator('[data-animal-active-brief]').innerText();
  assert.ok(interaction.includes(tx('住户庭院','Residents’ Courtyard'))&&interaction.includes(tx('夜间','at night')));
  await card.locator('[data-animal-active-brief]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${width}-${locale}-dani-active.png`});
  await page.keyboard.press('Escape');await page.locator('.harbor-header nav').getByRole('button',{name:tx('行囊','Bag'),exact:true}).click();
  await page.locator('.harbor-bag > .harbor-subnav').getByRole('button',{name:tx('发现记录','Records'),exact:true}).click();
  const bag=page.locator('.harbor-bag [data-animal-active-brief]');await bag.waitFor();const bagText=await bag.innerText();assert.equal(bagText,interaction);await bag.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${width}-${locale}-bag-active.png`});
  const api=server.url+'/'+GAME_UUID+'/api';const options={headers:{'X-Harbor-Telegram-Id':owner,'X-Harbor-Identity-Mode':'temporary-unverified','X-Harbor-Game':GAME_UUID}};
  const journeys=await(await context.request.get(api+'/sessions',options)).json();report.directory=journeys;
  assert.ok(Array.isArray(journeys)&&journeys.length);const current=await(await context.request.get(api+'/sessions/'+journeys[0].id,options)).json();
  assert.equal(current.animalNotebookV1.active.ref.hash,second.ref.hash);assert.ok(current.lifeV1.collections[observationId('harbor-gull-3','shore-space')]);
  assert.equal(current.lifeV1.collections[observationId('harbor-cat-3','sleep')],undefined);assert.equal(current.relations.dani??0,0);
  await page.getByRole('button',{name:tx('收起这份约定','Set this plan aside')}).click();
  await bag.waitFor({state:'hidden'});
  const canceled=await(await context.request.get(api+'/sessions/'+journeys[0].id,options)).json();
  assert.equal(canceled.animalNotebookV1.active,undefined);assert.ok(canceled.lifeV1.collections[observationId('harbor-gull-3','shore-space')]);
  assert.equal(canceled.animalNotebookV1.pages.filter((p:any)=>p.ref.id===first.ref.id).length,1);
  await page.reload();await page.getByRole('button',{name:tx('继续','Continue'),exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<any>('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  await page.locator('[data-target="dani"]').focus();await page.keyboard.press('Enter');await page.locator('.harbor-action.is-ready').click();
  const revisit=page.locator(`[data-animal-commission="${second.ref.id}"]`);await revisit.waitFor();
  await revisit.getByRole('button',{name:tx('读过了，接下这份观察约定','I have read it: accept this observation plan')}).click();
  await page.locator('.harbor-reply__next button').waitFor({timeout:10000});
  for(let i=0;i<20&&await page.locator('.harbor-reply__next button').count();i++)await page.locator('.harbor-reply__next button').click();
  await revisit.locator('[data-animal-active-brief]').waitFor();assert.equal(await revisit.locator('[data-animal-active-brief]').innerText(),interaction);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  report.cases.push({width,height,locale,actualMainView:true,rpgjs:true,acceptViaDani:true,bagHintPersists:true,oldGullRetained:true,onlyCatMissing:true,relationUnchanged:true,cancelReloadReturn:true,pageErrors:0});
  await context.close();
 }
 assert.equal(modelCalls,0);report.result='PASS';
}catch(error){report.failure=String(error);report.stack=(error as Error)?.stack;process.exitCode=1}
finally{report.modelCalls=modelCalls;await browser?.close();await server?.close();await writeFile(out+'/REPORT.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))}
