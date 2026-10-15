// @ts-nocheck -- Isolated synthetic authority, own headless browser and built candidate only.
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
const out=resolve('../evidence/gabriel-r2-ui');await mkdir(out,{recursive:true});
const root=resolve('dist');let seed:Partial<Save>={},qaScene='chapel',qaMinute=540;
const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'});
let externalModelCalls=0;
const assembly=createExplorationAssembly({resolveDialogue:async()=>{externalModelCalls++;throw Error('QA_MODEL_DISABLED')},initial:(locale:any,id:string)=>({...initial(locale,id),flags:['key','unpacked','bag-returned','chapel:visited'],visited:Object.keys(rooms).filter(id=>!id.startsWith('workshop-annex-')),...seed}),crabEnabled:true});
const api=createTemporaryAccountTransport({mode:'temporary-unverified',gameId:GAME_UUID,store,runtime:assembly.runtime,decorateAuthority:assembly.decorateAuthority,lifeProject:assembly.lifeProject,landProject:assembly.landProject,usage:{status:async()=>({resetAt:0,dialogue:{remaining:0,maximum:0,retryAt:null,pending:0}})}});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url!,'http://localhost');
 if(url.pathname==='/qa/prepare'){
  const owner=url.searchParams.get('owner')!,locale=url.searchParams.get('locale')??'en';assert.match(owner,/^99[0-9]{4}$/);
  seed={scene:qaScene,position:{...rooms[qaScene].entities.find(e=>e.person==='gabriel')!.approach},townMinutes:qaMinute,weatherV1:createWeatherState(qaMinute),weatherEcologyV1:createWeatherEcology(qaMinute)};
  const cap=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`harbor_demo=${cap}; HttpOnly; SameSite=Strict; Path=/`);return json(res,200,{synthetic:true});
 }
 if(/^\/[0-9a-f-]{36}\/api\//.test(url.pathname)||url.pathname.startsWith('/api/')){
  req.url=req.url!.replace(/^\/[0-9a-f-]{36}/,'');const owner=String(req.headers['x-harbor-telegram-id']??'');assert.match(owner,/^99[0-9]{4}$/);
  const cap=req.headers.cookie?.match(/(?:^|;\s*)harbor_demo=([a-f0-9]{64})(?:;|$)/)?.[1];assert.ok(cap);req.headers['x-harbor-game']??=GAME_UUID;return await api(req,res,createHash('sha256').update(cap).digest('hex'));
 }
 assert.equal(req.method,'GET');const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));assert.ok(file.startsWith(root+'/'));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.tmx':'application/xml'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(e:any){report.apiErrors??=[];report.apiErrors.push({path:new URL(req.url!,'http://localhost').pathname,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name});json(res,400,{error:'LOCAL_FIXTURE_REQUEST_FAILED'})}});
const report:any={result:'FAIL',baseProduct:'4451b92',libraryRevision:2,realDevice:false,realTelegram:false,productionPlayerAction:false,externalBlocked:0,rows:[],controlledRendererFrames:0};let browser,currentPage;

async function verifyActualRenderer(page,width,locale,scene){
 const tag=scene+'-'+width+'-'+locale;
 const response=await page.request.get(new URL('/art/npc-gabriel.png',page.url()).href);assert(response.ok());assert.equal(createHash('sha256').update(await response.body()).digest('hex'),'190e58e02560858d0a1c5c70b3397d010e957771bf1ea46ffb75619e5df91e4f');
 // Observe the naturally running renderer first; controlled frames below do not claim natural four-direction travel.
 const natural=[];for(let i=0;i<8;i++){natural.push(await page.evaluate(()=>{const c=document.querySelector('#rpg').__rpgClient,e=c.sceneMap.events()['person-gabriel'];return{graphics:e.graphics(),pose:e.animationName(),direction:e.direction(),x:e.x(),y:e.y()}}));await page.waitForTimeout(80)}
 assert(natural.every(e=>e.graphics.includes('npc-gabriel')));
 if(width<1000&&locale==='en'){
  await page.evaluate(()=>{const e=document.querySelector('#rpg').__rpgClient.sceneMap.events()['person-gabriel'],pose=e.animationName.set.bind(e.animationName),dir=e.direction.set.bind(e.direction);globalThis.__r2Fixture={event:e,pose,dir,forced:null};e.animationName.set=v=>pose(globalThis.__r2Fixture.forced?.pose??v);e.direction.set=v=>dir(globalThis.__r2Fixture.forced?.direction??v)});
  const frames=[];
  for(const direction of ['down','up','left','right'])for(const [phase,pose]of ['stride-0','stand','stride-2','stand'].entries()){
   await page.evaluate(v=>{const q=globalThis.__r2Fixture;q.forced=v;q.dir(v.direction);q.pose(v.pose)},{direction,pose});
   const col=pose==='stride-0'?0:pose==='stride-2'?2:1,row={down:0,up:1,left:2,right:3}[direction];
   await page.waitForFunction(({row,col})=>{const a=[];const walk=o=>{const label=o.texture?.source?.label;if(label?.split('?')[0].endsWith('/npc-gabriel.png'))a.push(o.texture.frame);for(const c of o.children??[])walk(c)};walk(document.querySelector('#rpg').__rpgClient.canvasApp.stage);return a.some(f=>f.x===col*128&&f.y===row*128&&f.width===128&&f.height===128)},{row,col},{timeout:6000});
   const actual=await page.evaluate(()=>{const q=globalThis.__r2Fixture,out=[];const walk=o=>{const label=o.texture?.source?.label;if(label?.split('?')[0].endsWith('/npc-gabriel.png'))out.push({frame:{x:o.texture.frame.x,y:o.texture.frame.y,w:o.texture.frame.width,h:o.texture.frame.height},anchor:{x:o.anchor.x,y:o.anchor.y},scale:{x:o.scale.x,y:o.scale.y}});for(const c of o.children??[])walk(c)};walk(document.querySelector('#rpg').__rpgClient.canvasApp.stage);return{graphics:q.event.graphics(),pose:q.event.animationName(),direction:q.event.direction(),sprites:out}});
   assert(actual.graphics.includes('npc-gabriel'));assert.equal(actual.pose,pose);assert.equal(actual.direction,direction);assert(actual.sprites.some(s=>Math.abs(s.anchor.x-.5)<1e-6&&Math.abs(s.anchor.y-122/128)<1e-6));
   await page.screenshot({path:out+'/'+tag+'-'+direction+'-'+phase+'.png'});frames.push({direction,pose,phase,actual});
  }
  await page.evaluate(()=>{const q=globalThis.__r2Fixture;q.event.animationName.set=q.pose;q.event.direction.set=q.dir;q.forced=null;q.pose('stand');delete globalThis.__r2Fixture});
  report.controlledRendererFrames+=frames.length;await writeFile(out+'/'+tag+'-selected-frames.json',JSON.stringify({controlledPoseOnly:true,naturalObservations:natural,frames},null,2)+'\n');
 }
 await writeFile(out+'/'+tag+'-natural-renderer.json',JSON.stringify(natural,null,2)+'\n');
}

try{
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
 for(const [caseIndex,[width,height,locale,scene]] of [[320,568,'zh','chapel'],[320,568,'en','chapel'],[390,844,'zh','chapel'],[390,844,'en','chapel'],[1280,800,'zh','chapel'],[1280,800,'en','chapel'],[320,568,'en','hill'],[390,844,'en','hill']].entries()){
  qaScene=scene;qaMinute=scene==='hill'?780:540;const selected=locale==='zh'?'priest-note':'priest-chair';
  const owner=String(992400+caseIndex),context=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US',hasTouch:width<1000});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(report.externalBlocked++,r.abort()));
  const prepared=await (await context.request.get(origin+'/qa/prepare?owner='+owner+'&locale='+locale)).json();assert.ok(prepared.synthetic);
  await context.addInitScript({content:`window.__name=(fn)=>fn;window.Aigram={isInAigram:true,telegramId:${JSON.stringify(owner)},callAigramAPI:async function(){return {}}};addEventListener('DOMContentLoaded',function(){window.alteruLocalStorage.setItem('harbor-locale',${JSON.stringify(locale)});window.alteruLocalStorage.setItem('harbor-muted','1')});`});
  const page=await context.newPage(),errors:string[]=[];currentPage=page;page.on('pageerror',e=>errors.push(e.name));let current:any;page.on('response',async r=>{if(new URL(r.url()).pathname.match(/\/api\/sessions\/[a-f0-9-]{36}$/)&&r.ok())current=await r.json()});
  page.setDefaultTimeout(8000);await page.goto(origin+'/?debug=1');await page.waitForTimeout(1000);await page.screenshot({path:out+'/'+scene+'-'+width+'-'+locale+'-entry-diagnostic.png'});await writeFile(out+'/'+scene+'-'+width+'-'+locale+'-entry-observation.json',JSON.stringify({buttons:await page.getByRole('button').allTextContents(),pageErrors:errors,feedback:await page.locator('.harbor-entry__feedback').textContent()},null,2));await page.getByRole('button',{name:locale==='zh'?'新游戏':'New game',exact:true}).click();for(let i=0;i<2;i++)await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();await page.getByRole('button',{name:locale==='zh'?'走过去打个招呼':'Go and say hello',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<any>('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  await page.locator('[data-target="gabriel"]').waitFor();await page.screenshot({path:out+'/'+scene+'-'+width+'-'+locale+'-map.png'});
  await verifyActualRenderer(page,width,locale,scene);
  const drain=async()=>{await page.locator('.harbor-reply__next button').waitFor();for(let i=0;i<20;i++){const next=page.locator('.harbor-reply__next button');if(!(await next.count()))return;await next.click();await page.waitForTimeout(50)}throw Error('READING_BOUNDED')};
  await page.locator('.harbor-action').click();await drain();
  await page.getByRole('button',{name:locale==='zh'?'回到海湾，什么最让你惦记？':'What stayed with you when you returned?',exact:true}).click();
  await page.locator('.harbor-reply__next button').waitFor();await page.screenshot({path:out+'/'+scene+'-'+width+'-'+locale+'-background.png'});await drain();
  await page.getByRole('button',{name:locale==='zh'?'那把多留的椅子呢？':'What about that extra chair?',exact:true}).click();await drain();
  if(scene==='chapel'){await page.getByRole('button',{name:locale==='zh'?'一起留张“可以坐一会儿”的便条':'Leave the chair for whoever wants to pause',exact:true}).click();await drain();}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/'+scene+'-'+width+'-'+locale+'-remembered.png'});
  let head=current;assert.ok(head);if(scene==='chapel'){assert.ok(head.flags.includes('talk:gabriel:'+selected));assert.equal(head.relations.gabriel,1);}else assert.equal(head.relations.gabriel??0,0);
  const card=page.locator('button.harbor-portrait');await card.waitFor();const cardState=await card.evaluate(e=>{const r=e.getBoundingClientRect(),im=e.querySelector('img');return{width:r.width,height:r.height,classes:e.className,natural:[im.naturalWidth,im.naturalHeight],fit:getComputedStyle(im).objectFit}});
  assert(cardState.classes.includes('harbor-portrait--portrait'));assert.deepEqual(cardState.natural,[256,320]);assert.equal(cardState.fit,'contain');assert(Math.abs(cardState.width/cardState.height-.8)<.001);
  await card.click();await page.locator('.harbor-portrait-full img').waitFor();assert.equal(await page.locator('.harbor-portrait-full img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===256&&img.naturalHeight===320),true);
  await page.screenshot({path:out+'/'+scene+'-'+width+'-'+locale+'-portrait.png'});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await writeFile(out+'/'+scene+'-'+width+'-'+locale+'-button-labels.json',JSON.stringify(await page.getByRole('button').allTextContents(),null,2));
  const people=page.getByRole('button',{name:locale==='zh'?'人物':'People',exact:true});await people.click();
  await page.locator('.harbor-rel__person').filter({hasText:locale==='zh'?'加布里埃尔':'Gabriel'}).click();
  await page.locator('.harbor-person-avatar[data-person="gabriel"] img').waitFor();
  assert.equal(await page.locator('.harbor-person-avatar[data-person="gabriel"] img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===256),true);
  await page.screenshot({path:out+'/'+scene+'-'+width+'-'+locale+'-profile.png'});
  const crop=await page.locator('.harbor-person-avatar[data-person="gabriel"] img').evaluate(im=>({width:im.style.width,height:im.style.height,left:im.style.left,top:im.style.top,fit:getComputedStyle(im).objectFit}));assert.deepEqual(crop,{width:'100%',height:'100%',left:'0%',top:'0%',fit:'contain'});
  await page.reload();await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<any>('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  head=current;assert.ok(head);if(scene==='chapel'){assert.equal(head.relations.gabriel,1);assert.ok(head.flags.includes('talk:gabriel:'+selected));}else assert.equal(head.relations.gabriel??0,0);assert.deepEqual(errors,[]);
  report.rows.push({width,height,locale,scene,selected:scene==='chapel'?selected:null,cardState,fullAvatarCrop:crop,normalDOMIntroductionAndChoice:true,actualRpgjs:true,profileAvatarAndPortraitLoaded:true,reloadMemoryRetained:true,pageErrors:errors.length,noHorizontalOverflow:true});await context.close();
 }
 assert.equal(externalModelCalls,0);report.result='PASS';
}catch(e){report.failure=String(e);report.stack=e?.stack;await currentPage?.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e}finally{
 if(browser)await browser.close();report.ownedBrowserClosed=true;await new Promise<void>(r=>server.close(()=>r()));await store.close();report.currentTemporaryGameFixtureOnly=true;report.externalModelCalls=externalModelCalls;report.ownedServerClosed=true;await writeFile(out+'/REPORT.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
