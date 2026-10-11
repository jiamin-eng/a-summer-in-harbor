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
import {rooms,world} from '../src/world/data';
import {findPath} from '../src/engine/world';
import {neighborReady} from './neighbor-fixture';
import {neighborProgress} from '../src/story/neighbor-chapter';
import {createWeatherState} from '../src/weather/state';
import {createWeatherEcology} from '../src/weather/ecology';
// @ts-expect-error frozen existing authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const out=resolve('../evidence/neighbor-ui');await mkdir(out,{recursive:true});
const root=resolve('dist');let seed:Partial<Save>={};
const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'});
let externalModelCalls=0;
const assembly=createExplorationAssembly({resolveDialogue:async()=>{externalModelCalls++;throw Error('QA_MODEL_DISABLED')},initial:(locale:any,id:string)=>({...neighborReady(),id,locale,version:0,cursor:0,...seed}),crabEnabled:true});
const api=createTemporaryAccountTransport({mode:'temporary-unverified',gameId:GAME_UUID,store,runtime:assembly.runtime,decorateAuthority:assembly.decorateAuthority,lifeProject:assembly.lifeProject,landProject:assembly.landProject,usage:{status:async()=>({resetAt:0,dialogue:{remaining:0,maximum:0,retryAt:null,pending:0}})}});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url!,'http://localhost');
 if(url.pathname==='/qa/prepare'){
  const owner=url.searchParams.get('owner')!,locale=url.searchParams.get('locale')??'en';assert.match(owner,/^99[0-9]{4}$/);
  const scene=url.searchParams.get('scene')==='coast'?'coast':'chapel';seed={scene,position:{...rooms[scene].entities.find(e=>e.id==='neighbor-gathering')!.approach},townMinutes:1980,weatherV1:createWeatherState(1980),weatherEcologyV1:createWeatherEcology(1980)};
  const cap=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`harbor_demo=${cap}; HttpOnly; SameSite=Strict; Path=/`);return json(res,200,{synthetic:true});
 }
 if(/^\/[0-9a-f-]{36}\/api\//.test(url.pathname)||url.pathname.startsWith('/api/')){
  req.url=req.url!.replace(/^\/[0-9a-f-]{36}/,'');const owner=String(req.headers['x-harbor-telegram-id']??'');assert.match(owner,/^99[0-9]{4}$/);
  const cap=req.headers.cookie?.match(/(?:^|;\s*)harbor_demo=([a-f0-9]{64})(?:;|$)/)?.[1];assert.ok(cap);req.headers['x-harbor-game']??=GAME_UUID;return await api(req,res,createHash('sha256').update(cap).digest('hex'));
 }
 assert.equal(req.method,'GET');const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));assert.ok(file.startsWith(root+'/'));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.tmx':'application/xml'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(e:any){report.apiErrors??=[];report.apiErrors.push({path:new URL(req.url!,'http://localhost').pathname,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name});json(res,400,{error:'LOCAL_FIXTURE_REQUEST_FAILED'})}});
const report:any={result:'FAIL',realDevice:false,realTelegram:false,productionPlayerAction:false,fixturePriorIntroductionsAndRelationships:true,admittedExistingArtOnly:true,externalBlocked:0,rows:[]};let browser;
try{
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
 for(const [width,height,locale,venue] of [[320,568,'zh','chapel'],[390,844,'en','coast']] as const){
 const owner=width===320?'990901':'990902',context=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US',hasTouch:true});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(report.externalBlocked++,r.abort()));
 assert.ok((await (await context.request.get(origin+'/qa/prepare?owner='+owner+'&locale='+locale+'&scene='+venue)).json()).synthetic);
 await context.addInitScript({content:`window.Aigram={isInAigram:true,telegramId:${JSON.stringify(owner)},callAigramAPI:async function(){return {}}};addEventListener('DOMContentLoaded',function(){window.alteruLocalStorage.setItem('harbor-locale',${JSON.stringify(locale)});window.alteruLocalStorage.setItem('harbor-muted','1')});`});
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));let current:any;page.on('response',async r=>{if(new URL(r.url()).pathname.match(/\/api\/sessions\/[a-f0-9-]{36}$/)&&r.ok())current=await r.json()});
 page.setDefaultTimeout(12000);await page.goto(origin+'/?debug=1');await page.getByRole('button',{name:locale==='zh'?'新游戏':'New game',exact:true}).click();for(let i=0;i<2;i++)await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();await page.getByRole('button',{name:locale==='zh'?'走过去打个招呼':'Go and say hello',exact:true}).click();
 const ready=async()=>{await page.waitForFunction(()=>document.querySelector<any>('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));await page.waitForTimeout(180)};await ready();
 const drain=async()=>{await page.waitForTimeout(500);for(let i=0;i<20;i++){const next=page.locator('.harbor-reply__next button');if(!(await next.count()))return;await next.click();await page.waitForTimeout(120)}throw Error('READING_BOUNDED')};
 const approach=async(id:string)=>{await page.keyboard.press('Escape');await page.waitForTimeout(250);
 const e=rooms[venue].entities.find(e=>e.id===id)!;
 const current=await page.evaluate(()=>{const p=document.querySelector<any>('#rpg').__rpgClient.getCurrentPlayer();return {x:p.x(),y:p.y()}}),path=findPath(world,venue,current,e.approach);assert.ok(path.length,'ordinary reachable approach');
 for(const goal of path)for(let i=0;i<12;i++){
  const pos=await page.evaluate(()=>{const p=document.querySelector<any>('#rpg').__rpgClient.getCurrentPlayer();return {x:p.x(),y:p.y()}});const dx=goal.x-pos.x,dy=goal.y-pos.y;if(Math.hypot(dx,dy)<5)break;
  const horizontal=Math.abs(dx)>Math.abs(dy),delta=horizontal?dx:dy,key=horizontal?(delta>0?'ArrowRight':'ArrowLeft'):(delta>0?'ArrowDown':'ArrowUp');await page.keyboard.down(key);await page.waitForTimeout(Math.min(180,Math.max(25,Math.abs(delta)/112*1000)));await page.keyboard.up(key);await page.waitForTimeout(30);
 }
 await page.waitForFunction((target)=>document.querySelector(`[data-target="${target}"]`)?.getAttribute('data-near')==='true',id);await page.waitForTimeout(150);await page.locator('.harbor-action').click();await drain();await page.screenshot({path:out+'/'+width+'-approach-'+id+'.png'});await writeFile(out+'/'+width+'-approach-'+id+'.json',JSON.stringify({buttons:await page.getByRole('button').allTextContents(),body:await page.locator('body').innerText()},null,2))};
 await approach('neighbor-gathering');await page.screenshot({path:out+'/'+width+'-ready.png'});await page.getByRole('button',{name:locale==='zh'?'开始这次小聚':'Begin this gathering',exact:true}).click();await drain();await page.screenshot({path:out+'/'+width+'-first-party.png'});
 for(const p of ['mara','avery']){await approach('gathering-'+p);await page.getByRole('button',{name:locale==='zh'?'聊聊今天，留下一段共同记忆':'Talk about today and share a moment',exact:true}).click();await page.locator('.harbor-reply__next button').waitFor();await page.waitForTimeout(300);await page.screenshot({path:out+'/'+width+'-'+p+'-conversation.png'});await drain()}
 await approach('neighbor-gathering');await page.getByRole('button',{name:locale==='zh'?'记下这次小聚，大家继续一天的生活':'Remember the gathering and return to the day',exact:true}).click();await drain();await page.screenshot({path:out+'/'+width+'-permanent-invitation.png'});
 await page.getByRole('button',{name:locale==='zh'?'邀约或取消萨米拉':'Invite or remove Samira',exact:true}).click();await drain();await page.getByRole('button',{name:locale==='zh'?'开始这次小聚':'Begin this gathering',exact:true}).click();await drain();
 const samira=venue==='chapel'?'samira':'gathering-samira';await approach(samira);await page.getByRole('button',{name:locale==='zh'?'聊聊今天，留下一段共同记忆':'Talk about today and share a moment',exact:true}).click();await drain();await approach('neighbor-gathering');await page.getByRole('button',{name:locale==='zh'?'记下这次小聚，大家继续一天的生活':'Remember the gathering and return to the day',exact:true}).click();await drain();await page.screenshot({path:out+'/'+width+'-repeat-finished.png'});
 await page.reload();await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();await ready();await approach('neighbor-gathering');await page.screenshot({path:out+'/'+width+'-reload.png'});
 assert.ok(current);assert.ok(neighborProgress(current).invitationUnlocked);assert.deepEqual(current.neighborChapterV1.lastParty.people,['samira']);assert.equal(current.neighborChapterV1.party,undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 report.rows.push({width,height,locale,venue,actualRpgjs:true,normalDOMFirstPartyAndEachGuest:true,permanentInvitationAndSoloRepeat:true,reloadMemoryRetained:true,pageErrors:0,noHorizontalOverflow:true});await context.close();
 }
 assert.equal(externalModelCalls,0);report.result='PASS';
}finally{
 if(browser)await browser.close();await new Promise<void>(r=>server.close(()=>r()));await store.close();report.externalModelCalls=externalModelCalls;report.ownedServerClosed=true;await writeFile(out+'/REPORT.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
