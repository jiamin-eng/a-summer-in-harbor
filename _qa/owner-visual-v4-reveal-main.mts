// @ts-nocheck -- actual compiled Main and RPGJS, isolated temporary account.
import {createExplorationAssembly} from '../server/exploration-assembly';
import {makeDemoServer} from './temporary-account-server';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const directory=mkdtempSync(join(tmpdir(),'harbor-reveal-main-'));
const out='../evidence/visual-v4/reveal-main';
await mkdir(out,{recursive:true});
let spec,models=0;
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{models++;throw Error('MODEL_DISABLED_IN_QA')},initial:(locale,id)=>({...initial(locale,id),...structuredClone(spec),id,version:0,cursor:0,history:[]})});
const server=await makeDemoServer({directory,port:0,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.tmx':'application/xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const cases=[
 {name:'old-shop',start:{x:224,y:82},ms:950},
 {name:'courtyard-house',start:{x:1092,y:90},ms:950},
];
const report={base:'9585df4',scope:'compiled actual Main/View/RPGJS; synthetic local session and normal keyboard; no production account/save/model',cases:[],errors:[],blockedExternal:0,models:0,passed:false};
let browser,activePage,activeCase;
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
 for(const f of cases)for(const [width,height] of [[320,568],[390,844]]){
  activeCase=f.name+'-'+width;
  spec={scene:'market',position:{...f.start},townMinutes:720,flags:['key','unpacked','bag-returned','alternative-route','route-open','market-open'],visited:Object.keys(rooms),known:['dani','theo','mara'],items:{key:1}};
  const c=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),errors=[];
  await c.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){report.blockedExternal++;return route.abort()}
   if(u.pathname.includes('/api/'))return route.fulfill({response:await route.fetch({url:server.url+u.pathname+u.search})});
   const file=resolve('dist','.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
   if(!file.startsWith(resolve('dist')+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});
   return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)})});
  await c.addInitScript(({name,width})=>{window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:'99099'+width+name.length,callAigramAPI:async()=>({})};addEventListener('DOMContentLoaded',()=>{window.alteruLocalStorage.setItem('harbor-locale','zh');window.alteruLocalStorage.setItem('harbor-muted','1')})},{name:f.name,width});
  const p=await c.newPage();activePage=p;p.on('pageerror',e=>{errors.push(String(e));report.errors.push(String(e))});p.setDefaultTimeout(20000);
  await p.goto(server.url+'/?debug=1');await p.getByRole('button',{name:'新游戏',exact:true}).click();await p.locator('.harbor-opening button').waitFor();
  for(let i=0;i<8&&await p.locator('.harbor-opening button').count();i++)await p.locator('.harbor-opening button').click();
  await p.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'));
  await p.keyboard.down('ArrowDown');await p.waitForTimeout(f.ms);await p.keyboard.up('ArrowDown');await p.waitForTimeout(750);
  const geometry=await p.evaluate(()=>{
   const client=document.querySelector('#rpg').__rpgClient,p=client.getCurrentPlayer(),masks=[],heroes=[];
   const scan=n=>{const label=n.texture?.source?.label;if(n.label==='local-reveal-mask'&&n.visible)masks.push(n);if(typeof label==='string'&&label.includes('/hero.png')){const b=n.getBounds();heroes.push({label,x:b.x,y:b.y,w:b.width,h:b.height})}for(const child of n.children??[])scan(child)};scan(client.canvasApp.stage);
   const hit=masks.map(mask=>{const actual=mask.getGlobalPosition();return {actual:{x:actual.x,y:actual.y},local:{x:mask.x,y:mask.y}}});
   return {world:{x:p.x(),y:p.y()},masks:hit,heroes,loading:!!document.querySelector('.harbor-loading')};
  });
  assert.equal(geometry.loading,false);assert.ok(geometry.masks.length>=(f.name==='courtyard-house'?2:1),JSON.stringify(geometry));
  assert.equal(geometry.heroes.length,1,JSON.stringify(geometry));
  const hero=geometry.heroes[0];
  const aligned=geometry.masks.filter(item=>{const mask=item.actual;return Math.abs(mask.x-(hero.x+hero.w/2))<8&&Math.abs(mask.y-(hero.y+hero.h/2))<16});
  assert.ok(aligned.length>=(f.name==='courtyard-house'?2:1),JSON.stringify(geometry));
  assert.ok(geometry.world.y>f.start.y+540+15,JSON.stringify(geometry));
  assert.deepEqual(errors,[]);
  await p.screenshot({path:`${out}/${width}-${f.name}-rear.png`});
  await p.evaluate(()=>{const objective=document.querySelector('.harbor-objective');if(objective)objective.style.visibility='hidden'});
  await p.screenshot({path:`${out}/${width}-${f.name}-rear-unobscured.png`});
  report.cases.push({name:f.name,width,height,geometry,alignedMasks:aligned.length,errors});
  await c.close();
 }
 assert.equal(models,0);report.passed=true;
}catch(e){report.failure=String(e);report.failureCase=activeCase;report.stack=e?.stack;await activePage?.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1}
finally{report.models=models;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser?.close();await server.close();rmSync(directory,{recursive:true,force:true})}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failure:report.failure,errors:report.errors,models}));
