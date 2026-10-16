// @ts-nocheck -- compiled Main/View, normal keyboard input, isolated SQLite account.
import {createExplorationAssembly} from '../server/exploration-assembly';
import {makeDemoServer} from './temporary-account-server';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
import {globalPoint} from '../src/candidate/continuity';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const directory=mkdtempSync(join(tmpdir(),'harbor-terrain-main-'));
const out=process.env.TERRAIN_MAIN_OUT??'../evidence/structural-main';
await mkdir(out,{recursive:true});
let spec,models=0;
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{models++;throw Error('MODEL_DISABLED_IN_QA')},initial:(locale,id)=>({...initial(locale,id),...structuredClone(spec),id,version:0,cursor:0,history:[]})});
const server=await makeDemoServer({directory,port:0,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.tmx':'application/xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const cases=[];
for(const [width,height] of [[320,568],[390,844],[1280,800]])for(const [name,scene,start,key,minute] of [
 ['harbor-quay-day','harbor',{x:1080,y:450},'ArrowLeft',780],
 ['harbor-pier-night','harbor',{x:600,y:740},'ArrowUp',1260],
 ['dock-day','dock',{x:350,y:350},'ArrowRight',780],
 ['beach-day','beach',{x:500,y:570},'ArrowLeft',780],
 ['path-night','path',{x:460,y:370},'ArrowDown',1260],
 ['coast-day','coast',{x:930,y:650},'ArrowLeft',780],
 ['coast-north-exit','coast',{x:550,y:115},'ArrowDown',780],
 ['coast-west-exit','coast',{x:70,y:475},'ArrowRight',1260],
 ['station-day','station',{x:400,y:395},'ArrowDown',780],
])cases.push({name,width,height,scene,start,key,minute,ms:350});
const report={base:'55c8eabc46fdd11d5f19195c135ef1b5ab2b6f0f',scope:'compiled actual Main/View/RPGJS; ordinary keyboard movement; isolated synthetic browser-cookie API and temporary SQLite; no production save/model/Telegram',cases:[],errors:[],externalBlocked:0,externalHosts:[],models:0,passed:false};
let browser,activePage,activeCase;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
 for(const f of cases.filter(f=>(!process.env.TERRAIN_MAIN_ONLY||process.env.TERRAIN_MAIN_ONLY.split(',').includes(f.name))&&(!process.env.TERRAIN_MAIN_WIDTH||f.width===Number(process.env.TERRAIN_MAIN_WIDTH)))){
  activeCase=f.name;
  spec={scene:f.scene,position:{...f.start},townMinutes:f.minute,flags:['key','unpacked','bag-returned','alternative-route','route-open','market-open'],visited:Object.keys(rooms),known:['dani','theo','mara'],items:{key:1}};
  const c=await browser.newContext({viewport:{width:f.width,height:f.height},serviceWorkers:'block'}),errors=[];let createdHeaders;
  await c.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){report.externalBlocked++;report.externalHosts.push(u.hostname);return route.abort()}
   if(u.pathname.endsWith('/api/sessions')&&route.request().method()==='POST')createdHeaders=Object.fromEntries(Object.entries(route.request().headers()).filter(([k])=>k==='cookie'||k.startsWith('x-harbor-')));
   if(u.pathname.includes('/api/'))return route.fulfill({response:await route.fetch({url:server.url+u.pathname+u.search})});
   const file=resolve('dist','.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
   if(!file.startsWith(resolve('dist')+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});
   return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)})});
  await c.addInitScript(({name})=>{window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:'99088'+name.length+name.charCodeAt(0),callAigramAPI:async()=>({})};addEventListener('DOMContentLoaded',()=>window.alteruLocalStorage.setItem('harbor-muted','1'))},{name:f.name});
  const p=await c.newPage(),created=[];activePage=p;p.on('pageerror',e=>{errors.push(String(e));report.errors.push({case:f.name,error:String(e)})});
  p.on('response',r=>{if(r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/api/sessions'))created.push(r.json().catch(()=>null))});p.setDefaultTimeout(20000);
  await p.goto(server.url+'/?debug=1');
  await p.getByRole('button',{name:'New game',exact:true}).click();
  await p.locator('.harbor-opening button').waitFor();
  for(let i=0;i<8&&await p.locator('.harbor-opening button').count();i++)await p.locator('.harbor-opening button').click();
  await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  const measure=()=>p.evaluate(()=>{const c=document.querySelector('#rpg').__rpgClient,q=c.getCurrentPlayer();return {x:q.x(),y:q.y(),loading:!!document.querySelector('.harbor-loading'),overflow:document.documentElement.scrollWidth>innerWidth+1}});
  const before=await measure(),global=globalPoint(f.scene,f.start);
  assert.ok(Math.hypot(before.x-global.x,before.y-global.y)<2,JSON.stringify({case:f.name,before,global}));
  await p.screenshot({path:`${out}/${f.width}-${f.name}-before.png`});
  await p.keyboard.down(f.key);await p.waitForTimeout(f.ms);await p.keyboard.up(f.key);await p.waitForTimeout(850);
  const after=await measure();assert.equal(after.loading,false);assert.equal(after.overflow,false);assert.deepEqual(errors,[]);
  assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>5,JSON.stringify({case:f.name,before,after}));
  await p.screenshot({path:`${out}/${f.width}-${f.name}-after.png`});
  const location=await p.locator('.harbor-location').innerText();
  let saveReadback;
  if(['harbor-quay-day','coast-north-exit','coast-west-exit'].includes(f.name)&&f.width===320){
   const id=(await Promise.all(created)).map(x=>x?.id??x?.head?.id).find(Boolean);
   assert.ok(id,'synthetic new-game session ID');
   assert.ok(createdHeaders?.cookie,'synthetic browser possession cookie on create');
   for(let attempt=0;attempt<10;attempt++){
    const response=await fetch(server.url+'/api/sessions/'+id,{headers:createdHeaders});
    assert.equal(response.status,200);
    const head=await response.json();saveReadback={id:head.id,scene:head.scene,position:head.position,items:head.items,version:head.version};
    if(head.scene===f.scene&&Math.hypot(head.position.x-after.x,head.position.y-after.y)<15)break;
    await p.waitForTimeout(500);
   }
   assert.equal(saveReadback.scene,f.scene);assert.deepEqual(saveReadback.items,{key:1});
   assert.ok(Math.hypot(saveReadback.position.x-after.x,saveReadback.position.y-after.y)<15,JSON.stringify(saveReadback));
  }
  let portalReadback;
  if(process.env.TERRAIN_MAIN_PORTALS==='1'&&f.width===320&&f.name.endsWith('-exit')){
   const portalId=f.name==='coast-north-exit'?'road-hill':'road-harbor',destination=f.name==='coast-north-exit'?'hill':'harbor';
   assert.equal(rooms.coast.entities.find(e=>e.id===portalId)?.destination,destination);
   const id=(await Promise.all(created)).map(x=>x?.id??x?.head?.id).find(Boolean);
   assert.ok(id&&createdHeaders?.cookie,'synthetic session for portal readback');
   assert.equal(await p.locator(`button[data-target="${portalId}"]`).getAttribute('data-near'),'true');
   await p.locator('.harbor-action.is-ready').click();
   await p.locator('.harbor-choices button.harbor-primary').click();
   for(let attempt=0;attempt<20;attempt++){
    const response=await fetch(server.url+'/api/sessions/'+id,{headers:createdHeaders});assert.equal(response.status,200);
    const head=await response.json();portalReadback={scene:head.scene,position:head.position,items:head.items,version:head.version};
    if(head.scene===destination)break;
    await p.waitForTimeout(350);
   }
   assert.equal(portalReadback.scene,destination,`${portalId} ordinary click`);
   assert.deepEqual(portalReadback.items,{key:1});
   await p.waitForFunction(()=>!!document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
   await p.screenshot({path:`${out}/${f.width}-${f.name}-portal.png`});
  }
  report.cases.push({name:f.name,width:f.width,height:f.height,minute:f.minute,before,after,location,pageErrors:errors,saveReadback,portalReadback});
  await c.close();
 }
 assert.equal(models,0);report.passed=true;
}catch(e){report.failure=String(e);report.stack=e?.stack;report.failureCase=activeCase;report.body=await activePage?.locator('body').innerText().catch(()=>null);await activePage?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{report.models=models;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true})}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failure:report.failure,errors:report.errors,models}));
