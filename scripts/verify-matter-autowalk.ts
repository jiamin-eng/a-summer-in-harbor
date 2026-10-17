import {chromium} from 'playwright';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
import {globalPoint} from '../src/candidate/continuity';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createApiHandler} from '../server/http';
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

const out=resolve('../evidence'),dist=resolve('dist'),publicRoot=resolve('public');mkdirSync(out,{recursive:true});
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.tmx':'application/xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const cases:[number,number,'zh'|'en','garden'|'hill'|'market'][]=[[320,568,'zh','garden'],[320,568,'en','hill'],[390,844,'zh','market'],[390,844,'en','garden'],[1280,800,'en','hill']];
const selectedCases=cases.filter(([width,,locale,scene])=>!process.env.QA_CASE_NAME||`${width}-${locale}-${scene}`===process.env.QA_CASE_NAME);
const report:any={baseCommit:'b2a45bd1bd2cd636798f34013f1226253275c325',scope:'Local compiled Main/View/RPGJS, isolated in-memory SQLite, synthetic players; all external requests blocked; no real account/save or publication.',bundle:readFileSync(resolve(dist,'index.html'),'utf8').match(/src="([^"]+index-[^"]+\.js)"/)?.[1],cases:[],errors:[],apiFailures:[],externalBlocked:[],modelCalls:0};
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader']});
try{
 let caseNumber=0;
 for(const [width,height,locale,scene] of selectedCases){
  const name=`${width}-${locale}-${scene}`,owner=String(990000+(++caseNumber));
  const store=openAsyncSqliteAuthorityStore({path:':memory:',worldId:randomUUID(),gameId:'matter-local-candidate',environment:'test'});
  const assembly=createExplorationAssembly({resolveDialogue:async()=>{report.modelCalls++;throw Error('QA_MODEL_CLOSED')},initial:(language:'en'|'zh',id:string)=>({...initial(language,id),version:0,scene,position:scene==='market'?{x:597,y:145}:rooms[scene].spawn,townMinutes:718,flags:['key','unpacked','bag-returned'],visited:Object.keys(rooms)})});
  const authority=assembly.decorateAuthority(new AsyncSessionAuthority(store,assembly.runtime),store);
  const seed=await authority.create(owner,randomUUID(),locale),head=()=>authority.get(owner,seed.id);
  const api=createApiHandler({authority,lifeProject:assembly.lifeProject,landProject:assembly.landProject,usage:{status:async()=>({resetAt:0,dialogue:{remaining:0,maximum:0,retryAt:null,pending:0}})},noteMedia:{}});
  const actions:any[]=[],context=await browser.newContext({viewport:{width,height},locale:locale==='zh'?'zh-CN':'en-US'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.hostname!=='127.0.0.1'){report.externalBlocked.push(url.origin+url.pathname);return route.abort()}
   if(url.pathname.includes('/api/')){
    const endpoint=url.pathname.slice(url.pathname.indexOf('/api/'));
    if(endpoint==='/api/bootstrap')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'temporary-unverified'})});
    const data=req.postData();if(endpoint.endsWith('/action'))actions.push(req.postDataJSON());
    const request:any=Readable.from(data?[Buffer.from(data)]:[]);request.url=endpoint+url.search;request.method=req.method();request.headers=req.headers();
    let status=200,headers:any={},body=Buffer.alloc(0);const response:any={writeHead:(s:number,h:any)=>{status=s;headers=h},end:(v:any)=>body=Buffer.from(v??'')};
    try{await api(request,response,owner)}catch(e:any){status=400;body=Buffer.from(JSON.stringify({error:e.code??e.message,terminal:true}))}
    if(status>=400)report.apiFailures.push({name,endpoint,status,errorCode:JSON.parse(body.toString()||'{}').error});
    return route.fulfill({status,headers,body});
   }
   const relative='.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname));let file=resolve(dist,relative);
   if(!file.startsWith(dist+'/'))return route.fulfill({status:404,body:'Missing local resource'});
   if(!existsSync(file)){file=resolve(publicRoot,relative);if(!file.startsWith(publicRoot+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing local resource'})}
   return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)});
  });
  await context.addInitScript(({id,owner,locale})=>{(window as any).__name=(f:any)=>f;(window as any).Aigram={isInAigram:true,telegramId:owner,callAigramAPI:async()=>({})};addEventListener('DOMContentLoaded',()=>{window.alteruLocalStorage?.setItem('harbor-muted','1');window.alteruLocalStorage?.setItem('harbor-opening:'+id,'3');window.alteruLocalStorage?.setItem('harbor-locale',locale)})},{id:seed.id,owner,locale});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push({name,error:String(e)}));
  try{
   await page.goto('http://127.0.0.1:5498/?debug=1&candidate=1&clock=4000');
   await page.getByRole('button',{name:locale==='zh'?'继续':'Continue',exact:true}).click();
   await page.waitForFunction(()=>!!(document.querySelector('#rpg') as any)?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),undefined,{timeout:25000});
   for(let i=0;i<3&&await page.locator('.harbor-opening button').count();i++)await page.locator('.harbor-opening button').click();
   const position=()=>page.evaluate(()=>{const p=(document.querySelector('#rpg') as any).__rpgClient.getCurrentPlayer();return {x:p.x(),y:p.y()}});
   const go=page.locator('.harbor-next-step__go'),pager=page.locator('.harbor-next-step__pager');
   const selected=scene==='market'?(locale==='zh'?'旅程线索':'Journey thread'):(locale==='zh'?'花园里的作物':'Crops in the garden');
   const originalLabel=await go.getAttribute('aria-label');
   for(let i=0;i<20&&!(await go.getAttribute('aria-label'))?.includes(selected);i++)await pager.click();
   assert.ok((await go.getAttribute('aria-label'))?.includes(selected),name+' selected task');
   const selectedLabel=await go.getAttribute('aria-label');assert.ok(selectedLabel!==originalLabel||scene==='market');
   await page.screenshot({path:resolve(out,name+'-selected.png')});
   const taskCount=actions.length,before=await position();await go.click();
   if(scene==='garden'){
    const target=rooms.garden.entities.find(e=>e.id==='crop-bed-1')!;
    await page.waitForTimeout(350);await page.keyboard.down('ArrowLeft');await page.waitForTimeout(450);await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(2500);
    const canceled=await position();assert.ok(Math.hypot(canceled.x-target.approach.x,canceled.y-target.approach.y)>25,name+' manual movement cancels route');
    await go.click();
    await page.waitForFunction(([x,y,label])=>{const p=(document.querySelector('#rpg') as any).__rpgClient.getCurrentPlayer();const action=document.querySelector('.harbor-action.is-ready');return Math.hypot(p.x()+8-x,p.y()+6-y)<65&&!!action?.textContent?.includes(label)},[target.at.x,target.at.y,locale==='zh'?'菜畦 1':'Growing bed 1'],{timeout:13000});
    assert.equal((await head()).scene,'garden');assert.equal(actions.length,taskCount,'navigation does not complete task');
    await page.screenshot({path:resolve(out,name+'-arrived.png')});
    await page.locator('.harbor-action.is-ready').click();assert.equal(await page.getByRole('dialog').count(),1);
    await page.getByRole('button',{name:locale==='zh'?'关闭':'Close',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
    await page.locator('.harbor-next-step__objective').click();assert.equal(await page.getByRole('dialog').count(),1);
    await page.getByRole('button',{name:locale==='zh'?'关闭':'Close',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await go.getAttribute('aria-label'),selectedLabel,'returning from the panel preserves the selected matter');
    assert.equal(actions.length,taskCount,'closing and returning do not complete the task');
    report.cases.push({name,selectedLabel,before,canceled,arrived:await position(),manualCancel:true,arrivalIsInteractable:true,sameScene:true,interactedAfterArrival:true,closedAndReturned:true,noTaskAutoCompletion:true});
   }else if(scene==='hill'){
    const door=rooms.hill.entities.find(e=>e.destination==='garden')!;
    await page.waitForFunction(([x,y])=>{const p=(document.querySelector('#rpg') as any).__rpgClient.getCurrentPlayer();return Math.hypot(p.x()-x,p.y()-y)<8},[door.approach.x,door.approach.y],{timeout:14000});
    assert.equal((await head()).scene,'hill');assert.equal(actions.length,taskCount,'door still needs explicit interaction');
    await page.screenshot({path:resolve(out,name+'-door.png')});
    await page.locator('.harbor-action.is-ready').click();
    await page.getByRole('dialog').getByRole('button',{name:locale==='zh'?/前往山坡花园/:/Go to Hillside Garden/}).click();
    await page.waitForFunction(()=>{const p=(document.querySelector('#rpg') as any)?.__rpgClient?.getCurrentPlayer();return !!p&&(p.x()!==0||p.y()!==0)&&!document.querySelector('.harbor-loading')&&!(document.querySelector('.harbor-next-step__go') as HTMLButtonElement)?.disabled},undefined,{timeout:20000});
    for(let i=0;i<40&&(await head()).scene!=='garden';i++)await page.waitForTimeout(100);
    assert.equal((await head()).scene,'garden');assert.ok(actions.some(a=>a.action==='travel'));
    assert.ok((await go.getAttribute('aria-label'))?.includes(selected));
    await go.click();
    const bed=rooms.garden.entities.find(e=>e.id==='crop-bed-1')!;
    await page.waitForFunction(([x,y])=>{const p=(document.querySelector('#rpg') as any).__rpgClient.getCurrentPlayer();return Math.hypot(p.x()-x,p.y()-y)<8},[bed.approach.x,bed.approach.y],{timeout:14000});
    await page.screenshot({path:resolve(out,name+'-arrived.png')});
    report.cases.push({name,selectedLabel,before,door:door.approach,arrived:await position(),explicitTravel:true,thenSameTaskTarget:true,noTaskAutoCompletion:true});
   }else{
    const notice=rooms.bazaar.entities.find(e=>e.id==='notice')!;
    for(let i=0;i<90&&(await head()).scene!=='bazaar';i++)await page.waitForTimeout(150);
    assert.equal((await head()).scene,'bazaar');
    const globalNotice=globalPoint('bazaar',notice.approach);
    await page.waitForFunction(([x,y])=>{const p=(document.querySelector('#rpg') as any).__rpgClient.getCurrentPlayer();return Math.hypot(p.x()-x,p.y()-y)<8},[globalNotice.x,globalNotice.y],{timeout:12000});
    assert.equal(actions.length,taskCount,'seam crossing does not complete task');
    await page.screenshot({path:resolve(out,name+'-arrived.png')});
    report.cases.push({name,selectedLabel,before,arrived:await position(),sameClusterCrossing:true,noTaskAutoCompletion:true});
   }
   assert.equal(await page.locator('.harbor-error').count(),0);
   }catch(error){await page.screenshot({path:resolve(out,name+'-failure.png')}).catch(()=>{});report.diagnostic={name,errorType:(error as Error).name,player:await page.evaluate(()=>{const p=(document.querySelector('#rpg') as any)?.__rpgClient?.getCurrentPlayer();return p?{x:p.x(),y:p.y()}:null}).catch(()=>null),scene:(await head()).scene,serverPosition:(await head()).position,motion:await page.locator('#rpg').evaluate(el=>({...el.dataset})).catch(()=>null),selected:await page.locator('.harbor-next-step__go').getAttribute('aria-label').catch(()=>null),goDisabled:await page.locator('.harbor-next-step__go').isDisabled().catch(()=>null),actionReady:await page.locator('.harbor-action.is-ready').count(),loading:await page.locator('.harbor-loading').allTextContents().catch(()=>[])};throw error}
  finally{await context.close();await store.close()}
 }
}finally{await browser.close();writeFileSync(resolve(out,'renderer-report.json'),JSON.stringify(report,null,2)+'\n')}
assert.equal(report.errors.length,0);assert.equal(report.modelCalls,0);console.log(JSON.stringify({cases:report.cases.map((c:any)=>c.name),errors:report.errors,externalBlocked:report.externalBlocked.length,modelCalls:report.modelCalls,bundle:report.bundle}));
