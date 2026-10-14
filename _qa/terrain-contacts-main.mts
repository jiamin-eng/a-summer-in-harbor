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
const out='../evidence/visual-v4/terrain-main';
await mkdir(out,{recursive:true});
let spec,models=0;
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{models++;throw Error('MODEL_DISABLED_IN_QA')},initial:(locale,id)=>({...initial(locale,id),...structuredClone(spec),id,version:0,cursor:0,history:[]})});
const server=await makeDemoServer({directory,port:0,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.tmx':'application/xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const cases=[
 {name:'stone-sand',width:320,height:568,scene:'coast',start:{x:300,y:550},key:'ArrowUp',ms:520},
 {name:'sand-water',width:390,height:844,scene:'coast',start:{x:880,y:650},key:'ArrowRight',ms:850},
 {name:'beach-shore',width:320,height:568,scene:'beach',start:{x:500,y:570},key:'ArrowDown',ms:750},
 {name:'path-canal',width:390,height:844,scene:'path',start:{x:350,y:250},key:'ArrowRight',ms:850},
 {name:'coast-east-edge',width:390,height:844,scene:'coast',start:{x:1220,y:300},key:'ArrowRight',ms:450},
 {name:'coast-beach-crossing',width:390,height:844,scene:'coast',start:{x:542,y:765},key:'ArrowDown',ms:1100,arrive:'beach'},
];
const report={base:'9585df4',scope:'compiled actual Main/View/RPGJS; ordinary keyboard movement; isolated synthetic browser-cookie API and temporary SQLite, without asserting save readback; no production save/model/Telegram',cases:[],errors:[],externalBlocked:0,externalHosts:[],models:0,passed:false};
let browser,activePage,activeCase;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
 for(const f of cases){
  activeCase=f.name;
  spec={scene:f.scene,position:{...f.start},townMinutes:540,flags:['key','unpacked','bag-returned','alternative-route','route-open','market-open'],visited:Object.keys(rooms),known:['dani','theo','mara'],items:{key:1}};
  const c=await browser.newContext({viewport:{width:f.width,height:f.height},serviceWorkers:'block'}),errors=[];
  await c.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){report.externalBlocked++;report.externalHosts.push(u.hostname);return route.abort()}
   if(u.pathname.includes('/api/'))return route.fulfill({response:await route.fetch({url:server.url+u.pathname+u.search})});
   const file=resolve('dist','.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
   if(!file.startsWith(resolve('dist')+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});
   return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)})});
  await c.addInitScript(({name})=>{window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:'99088'+name.length+name.charCodeAt(0),callAigramAPI:async()=>({})};addEventListener('DOMContentLoaded',()=>window.alteruLocalStorage.setItem('harbor-muted','1'))},{name:f.name});
  const p=await c.newPage();activePage=p;p.on('pageerror',e=>{errors.push(String(e));report.errors.push({case:f.name,error:String(e)})});p.setDefaultTimeout(20000);
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
  if(f.name==='stone-sand')assert.ok(after.y<before.y-15&&after.y>before.y-95,JSON.stringify(after));
  if(f.name==='sand-water')assert.ok(after.x>before.x+15&&after.x<960,JSON.stringify(after));
  if(f.name==='beach-shore')assert.ok(after.y>before.y+10&&after.y<1270,JSON.stringify(after));
  if(f.name==='path-canal')assert.ok(after.x>before.x+15&&after.x<1590,JSON.stringify(after));
  await p.screenshot({path:`${out}/${f.width}-${f.name}-after.png`});
  if(f.arrive)await p.waitForFunction(()=>document.querySelector('.harbor-location')?.textContent.includes('Shell Beach'),{},{timeout:12000});
  const location=await p.locator('.harbor-location').innerText();
  report.cases.push({name:f.name,width:f.width,height:f.height,before,after,location,pageErrors:errors});
  await c.close();
 }
 assert.equal(models,0);report.passed=true;
}catch(e){report.failure=String(e);report.stack=e?.stack;report.failureCase=activeCase;report.body=await activePage?.locator('body').innerText().catch(()=>null);await activePage?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{report.models=models;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true})}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failure:report.failure,errors:report.errors,models}));
