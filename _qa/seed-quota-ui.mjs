import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.HARBOR_SEED_QA_EVIDENCE;if(!out)throw Error('QA_EVIDENCE_REQUIRED');await mkdir(out,{recursive:true});
const report={scope:'real Main/RPGJS and full formal clock/weather/animal/mint assembly, synthetic local Aigram adapter and SQLite journeys (not authenticated platform identity); setup plant/water/harvest via authored rules and explicit unit clock jump; external requests blocked',cases:[],errors:[],modelCalls:0,mediaPosts:0,comprehension:'unverified',physicalDevice:'unverified'};
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
try{
 for(const fixture of ['new','mixed','legacy'])for(const [width,height] of [[320,568],[390,844]])for(const locale of ['en','zh']){
  const record={fixture,width,height,locale,apiFailures:[]};report.cases.push(record);const account=String(990000+report.cases.length),c=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US',extraHTTPHeaders:{'X-Harbor-Telegram-Id':account,'X-Harbor-Identity-Mode':'temporary-unverified'}});
  await c.addInitScript(({account,locale})=>{window.Aigram={isInAigram:true,telegramId:account,callAigramAPI:async()=>({})};addEventListener('DOMContentLoaded',()=>{window.alteruLocalStorage.setItem('harbor-locale',locale);window.alteruLocalStorage.setItem('harbor-muted','1')})},{account,locale});
  await c.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
  await c.request.post('http://127.0.0.1:5681/qa/prepare?case='+fixture);
  const p=await c.newPage();p.on('pageerror',e=>report.errors.push(String(e)));p.on('response',async r=>{if(r.url().includes('/api/')&&r.status()>=400)record.apiFailures.push({path:new URL(r.url()).pathname,status:r.status(),body:(await r.text()).slice(0,1500)})});await p.goto('http://127.0.0.1:5680/?debug=1');
  await p.getByRole('button',{name:locale==='zh'?'新游戏':'New game',exact:true}).click();
  try{await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));}catch(error){record.body=(await p.locator('body').innerText()).slice(0,2000);await p.screenshot({path:out+'/STARTUP-FAILURE.png'});throw error;}
  for(let i=0;i<3;i++)await p.locator('.harbor-opening button').click();
  const tx=(zh,en)=>locale==='zh'?zh:en;await p.getByRole('button',{name:tx('行囊','Bag'),exact:true}).click();await p.locator('[data-bag-item]').first().waitFor();
  const directory=await(await c.request.get('http://127.0.0.1:5681/api/sessions')).json(),id=directory[0].id;
  const head=async()=>{const r=await c.request.get('http://127.0.0.1:5681/api/sessions/'+id);assert.equal(r.status(),200);return r.json()};const before=await head();
  const harvest=before.lifeV1?.seedQuotaV1?.harvests[0];
  const selector='[data-bag-item="crop:basil@1:produce'+(harvest?':'+harvest.id:'')+'"]',row=p.locator(selector),detail=p.locator('[data-bag-detail]');
  await row.click();await detail.waitFor();
  await detail.scrollIntoViewIfNeeded();
  const shot=async(name)=>{assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:`${out}/${fixture}-${width}-${locale}-${name}.png`})};await shot('before');
  assert.match(await detail.innerText(),harvest?/最多留一包|at most one seed packet/:/旧规则|Old-rule/);
  const button=detail.getByRole('button',{name:tx('留种 · 消耗1份收成','Save seed · use 1 harvest unit'),exact:true});const box=await button.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44);await button.click();
  await p.waitForFunction(({selector,n})=>document.querySelector(selector+' .harbor-bag__quantity')?.textContent.includes('×'+n),{selector,n:(harvest?3:2)-1});
  const after=await head();assert.equal(after.items['crop-basil'],before.items['crop-basil']-1);assert.equal(after.items['seed-basil'],(before.items['seed-basil']??0)+1);assert.equal(after.cash,before.cash);assert.equal(after.lifeV1.collections['seed:crop:basil'].ref.id,'crop:basil');
  if(harvest){assert.equal(after.lifeV1.seedQuotaV1.harvests[0].seedSpent,true);assert.equal(await detail.getByRole('button',{name:tx('留种 · 消耗1份收成','Save seed · use 1 harvest unit'),exact:true}).count(),0);assert.match(await detail.innerText(),/已留过|already provided/);if(fixture==='mixed')assert.match(await p.locator('[data-bag-item="crop:basil@1:produce"]').innerText(),/×2/);}
  else {assert.equal(after.lifeV1.seedQuotaV1,undefined);assert.equal(await detail.getByRole('button',{name:tx('留种 · 消耗1份收成','Save seed · use 1 harvest unit'),exact:true}).count(),1);}
  await detail.scrollIntoViewIfNeeded();await shot('after');
  await p.reload();await p.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  if(await p.locator('.harbor-opening button').count())for(let i=0;i<3;i++)await p.locator('.harbor-opening button').click();
  await p.getByRole('button',{name:tx('行囊','Bag'),exact:true}).click();await row.waitFor();await row.click();await detail.waitFor();
  assert.equal((await head()).items['seed-basil'],after.items['seed-basil']);if(harvest)assert.equal(await detail.getByRole('button',{name:tx('留种 · 消耗1份收成','Save seed · use 1 harvest unit'),exact:true}).count(),0);await detail.scrollIntoViewIfNeeded();await shot('reloaded');
  record.before={version:before.version,produce:before.items['crop-basil'],seeds:before.items['seed-basil']??0};record.after={version:after.version,produce:after.items['crop-basil'],seeds:after.items['seed-basil'],seedSpent:harvest?true:'legacy-unlimited'};record.rendererPlayer=true;record.touchTarget=box;record.reloadPreserved=true;
  await c.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(out+'/REPORT.json',JSON.stringify(report,null,2));await browser.close();}
