/** Own loopback synthetic authority + production dist; never a platform/save test. */
import {createServer} from 'node:http';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {json} from '../server/http';
import {createTemporaryAccountTransport} from '../server/account-transport';
import {GAME_UUID} from '../src/game-id';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {initial,type Save} from '../src/story/state';
import {rooms} from '../src/world/data';
import {createWeatherState} from '../src/weather/state';
import {createWeatherEcology} from '../src/weather/ecology';
// @ts-expect-error frozen existing authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const out=resolve('../evidence/priest-ui');await mkdir(out,{recursive:true});
const root=resolve('dist');let seed:Partial<Save>={};
const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'});
let externalModelCalls=0;
const assembly=createExplorationAssembly({resolveDialogue:async()=>{externalModelCalls++;throw Error('QA_MODEL_DISABLED')},initial:(locale:any,id:string)=>({...initial(locale,id),flags:['key','unpacked','bag-returned','chapel:visited'],visited:Object.keys(rooms).filter(id=>!id.startsWith('workshop-annex-')),...seed}),crabEnabled:true});
const api=createTemporaryAccountTransport({mode:'temporary-unverified',gameId:GAME_UUID,store,runtime:assembly.runtime,decorateAuthority:assembly.decorateAuthority,lifeProject:assembly.lifeProject,landProject:assembly.landProject,usage:{status:async()=>({resetAt:0,dialogue:{remaining:0,maximum:0,retryAt:null,pending:0}})}});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url!,'http://localhost');
 if(url.pathname==='/qa/prepare'){
  const owner=url.searchParams.get('owner')!,locale=url.searchParams.get('locale')??'en';assert.match(owner,/^99[0-9]{4}$/);
  seed={scene:'chapel',position:{...rooms.chapel.entities.find(e=>e.person==='gabriel')!.approach},townMinutes:540,weatherV1:createWeatherState(540),weatherEcologyV1:createWeatherEcology(540)};
  const cap=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`harbor_demo=${cap}; HttpOnly; SameSite=Strict; Path=/`);return json(res,200,{synthetic:true});
 }
 if(/^\/[0-9a-f-]{36}\/api\//.test(url.pathname)||url.pathname.startsWith('/api/')){
  req.url=req.url!.replace(/^\/[0-9a-f-]{36}/,'');const owner=String(req.headers['x-harbor-telegram-id']??'');assert.match(owner,/^99[0-9]{4}$/);
  const cap=req.headers.cookie?.match(/(?:^|;\s*)harbor_demo=([a-f0-9]{64})(?:;|$)/)?.[1];assert.ok(cap);req.headers['x-harbor-game']??=GAME_UUID;return await api(req,res,createHash('sha256').update(cap).digest('hex'));
 }
 assert.equal(req.method,'GET');const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));assert.ok(file.startsWith(root+'/'));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.tmx':'application/xml'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(e:any){report.apiErrors??=[];report.apiErrors.push({path:new URL(req.url!,'http://localhost').pathname,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name});json(res,400,{error:'LOCAL_FIXTURE_REQUEST_FAILED'})}});
const report:any={result:'FAIL',realDevice:false,realTelegram:false,productionPlayerAction:false,placeholderArtOnly:true,externalBlocked:0,rows:[]};let browser;
try{
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
 for(const [width,height,locale,selected] of [[320,568,'zh','priest-note'],[390,844,'en','priest-chair']] as const){
  const owner=width===320?'990901':'990902',context=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US',hasTouch:true});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(report.externalBlocked++,r.abort()));
  const prepared=await (await context.request.get(origin+'/qa/prepare?owner='+owner+'&locale='+locale)).json();assert.ok(prepared.synthetic);
  await context.addInitScript({content:`window.Aigram={isInAigram:true,telegramId:${JSON.stringify(owner)},callAigramAPI:async function(){return {}}};addEventListener('DOMContentLoaded',function(){window.alteruLocalStorage.setItem('harbor-locale',${JSON.stringify(locale)});window.alteruLocalStorage.setItem('harbor-muted','1')});`});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));let current:any;page.on('response',async r=>{if(new URL(r.url()).pathname.match(/\/api\/sessions\/[a-f0-9-]{36}$/)&&r.ok())current=await r.json()});
  page.setDefaultTimeout(8000);await page.goto(origin+'/?debug=1');await page.waitForTimeout(1000);await page.screenshot({path:out+'/'+width+'-entry-diagnostic.png'});await writeFile(out+'/'+width+'-entry-observation.json',JSON.stringify({buttons:await page.getByRole('button').allTextContents(),pageErrors:errors,feedback:await page.locator('.harbor-entry__feedback').textContent()},null,2));await page.getByRole('button',{name:locale==='zh'?'新游戏':'New game',exact:true}).click();for(let i=0;i<2;i++)await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();await page.getByRole('button',{name:locale==='zh'?'走过去打个招呼':'Go and say hello',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<any>('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  await page.locator('[data-target="gabriel"]').waitFor();await page.screenshot({path:out+'/'+width+'-map-placeholder.png'});
  const drain=async()=>{await page.locator('.harbor-reply__next button').waitFor();for(let i=0;i<20;i++){const next=page.locator('.harbor-reply__next button');if(!(await next.count()))return;await next.click();await page.waitForTimeout(50)}throw Error('READING_BOUNDED')};
  await page.locator('.harbor-action').click();await drain();
  await page.getByRole('button',{name:locale==='zh'?'回到海湾，什么最让你惦记？':'What stayed with you when you returned?',exact:true}).click();
  await page.locator('.harbor-reply__next button').waitFor();await page.screenshot({path:out+'/'+width+'-background.png'});await drain();
  await page.getByRole('button',{name:locale==='zh'?'那把多留的椅子呢？':'What about that extra chair?',exact:true}).click();await drain();
  await page.getByRole('button',{name:locale==='zh'?'一起留张“可以坐一会儿”的便条':'Leave the chair for whoever wants to pause',exact:true}).click();await drain();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/'+width+'-remembered.png'});
  let head=current;assert.ok(head);assert.ok(head.flags.includes('talk:gabriel:'+selected));assert.equal(head.relations.gabriel,1);
  await page.keyboard.press('Escape');
  await writeFile(out+'/'+width+'-button-labels.json',JSON.stringify(await page.getByRole('button').allTextContents(),null,2));
  const people=page.getByRole('button',{name:locale==='zh'?'人物':'People',exact:true});await people.click();
  await page.locator('.harbor-rel__person').filter({hasText:locale==='zh'?'加布里埃尔':'Gabriel'}).click();
  await page.locator('.harbor-person-avatar[data-person="gabriel"] img').waitFor();
  assert.equal(await page.locator('.harbor-person-avatar[data-person="gabriel"] img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===256),true);
  await page.screenshot({path:out+'/'+width+'-profile-placeholder.png'});
  await page.getByRole('button',{name:locale==='zh'?'放大人物肖像':'Enlarge portrait',exact:true}).click();
  await page.locator('.harbor-portrait-full img').waitFor();assert.equal(await page.locator('.harbor-portrait-full img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),true);
  await page.screenshot({path:out+'/'+width+'-portrait-placeholder.png'});await page.keyboard.press('Escape');
  await page.reload();await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<any>('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  head=current;assert.ok(head);assert.equal(head.relations.gabriel,1);assert.ok(head.flags.includes('talk:gabriel:'+selected));assert.deepEqual(errors,[]);
  report.rows.push({width,height,locale,selected,normalDOMIntroductionAndChoice:true,actualRpgjs:true,profileAvatarAndPortraitLoaded:true,reloadMemoryRetained:true,pageErrors:errors.length,noHorizontalOverflow:true});await context.close();
 }
 assert.equal(externalModelCalls,0);report.result='PASS';
}finally{
 if(browser)await browser.close();await new Promise<void>(r=>server.close(()=>r()));await store.close();report.externalModelCalls=externalModelCalls;report.ownedServerClosed=true;await writeFile(out+'/REPORT.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
