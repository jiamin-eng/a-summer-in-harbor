// @ts-nocheck -- local-only synthetic compiled Main/View/RPGJS browser regression.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {makeDemoServer} from './temporary-account-server';
import {initial} from '../src/story/state';
import {GAME_UUID} from '../src/game-id';
import {randomUUID} from 'node:crypto';

const out=resolve('../evidence/motion-recovery-ui');
await mkdir(out,{recursive:true});
const dist=resolve('dist'),directory=mkdtempSync('/tmp/harbor-motion-recovery-');
const assembly=createExplorationAssembly({crabEnabled:true,resolveDialogue:async()=>{throw Error('QA_MODEL_BLOCKED')},initial:(locale,id)=>({...initial(locale,id),scene:'station',position:{x:733,y:557},known:['mara'],flags:['key','unpacked','bag-returned'],items:{key:1},visited:['station','harbor']})});
const server=await makeDemoServer({directory,port:5634,providedRuntime:assembly.runtime,lifeProject:assembly.lifeProject,landProject:assembly.landProject,decorateAuthority:assembly.decorateAuthority});
const browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1','--media-cache-size=1']});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const report={scope:'isolated synthetic Main/View/RPGJS; one definite pre-commit motion path rejection; no real player data, model, external API or publication',cases:[]};
try{
 for(const [width,height] of [[320,568],[390,844]]){
  const rec={width,height,injected:false,openAfterReject:0,motionAfterReject:0,pageErrors:[],checks:[]};report.cases.push(rec);
  const context=await browser.newContext({viewport:{width,height},locale:'en-US',serviceWorkers:'block'});
  const account=String(98765700+width),headers={'X-Harbor-Telegram-Id':account,'X-Harbor-Identity-Mode':'temporary-unverified'};
  let setup=await context.request.post(server.url+'/'+GAME_UUID+'/api/bootstrap',{headers,data:{}});assert.equal(setup.status(),200);
  setup=await context.request.post(server.url+'/'+GAME_UUID+'/api/sessions',{headers,data:{enrollment_id:randomUUID(),locale:'en'}});assert.equal(setup.status(),200);
  await context.addInitScript(account=>{window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:account,callAigramAPI:async()=>({retcode:0})}},account);
  let inject=false;
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname!=='127.0.0.1')return route.abort();
   if(url.pathname.includes('/api/')){
    let body;try{body=request.postDataJSON()}catch{}
    if(['ask','notes-generate'].includes(body?.action)||url.pathname.includes('/media/')||url.pathname.includes('/assets/'))return route.abort();
    if(url.pathname.endsWith('/motion')&&body?.action==='candidate-motion-step'&&inject&&!rec.injected){
     rec.injected=true;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'INVALID_MOTION_PATH',terminal:true})});
    }
    const response=await route.fetch({url:server.url+url.pathname+url.search});
    if(rec.injected&&url.pathname.endsWith('/motion')&&body?.action==='candidate-motion-open'&&response.status()===200)rec.openAfterReject++;
    if(rec.injected&&url.pathname.endsWith('/motion')&&body?.action==='candidate-motion-step'&&response.status()===200)rec.motionAfterReject++;
    return route.fulfill({response});
   }
   const file=resolve(dist,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
   if(!file.startsWith(dist+'/')||!existsSync(file))return route.fulfill({status:404,body:'Missing'});
   return route.fulfill({status:200,contentType:mime[extname(file)]??'application/octet-stream',body:readFileSync(file)});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>rec.pageErrors.push(String(error)));
  const ready=()=>page.waitForFunction(()=>document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading'),null,{timeout:60000});
  const check=(label,value)=>{assert.ok(value,`${width}: ${label}`);rec.checks.push(label)};
  try{
   await page.goto(server.url+'/?debug=1');await page.getByRole('button',{name:'Continue',exact:true}).click();await ready();
   for(let i=0;i<3;i++)await page.locator('.harbor-opening button').click();
   await page.waitForTimeout(1500);
   inject=true;
   await page.keyboard.down('ArrowRight');await page.waitForTimeout(900);await page.keyboard.up('ArrowRight');
   await page.waitForFunction(()=>!document.querySelector('.harbor-loading')&&document.querySelector('#rpg')?.dataset?.motionBlock==='none',null,{timeout:15000}).catch(()=>{});
   await page.waitForTimeout(1500);
   check('definite path rejection injected',rec.injected);
   check('new lease opened after rejected path',rec.openAfterReject>0);
   check('progress-unconfirmed overlay absent',await page.locator('.harbor-loading').count()===0);
   const map=page.locator('.harbor-header nav').getByRole('button',{name:'Map',exact:true});await map.click();
   await page.locator('.harbor-map-gesture').waitFor();check('map opens after rejection',true);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.harbor-panel'));
   await page.keyboard.down('ArrowLeft');await page.waitForTimeout(700);await page.keyboard.up('ArrowLeft');await page.waitForTimeout(1200);
   check('new movement accepted after recovery',rec.motionAfterReject>0);
   check('no browser exception',rec.pageErrors.length===0);
   rec.status='PASS';
  }catch(error){rec.status='FAIL';rec.error=String(error);await page.screenshot({path:`${out}/${width}-failure.png`}).catch(()=>{});}finally{await context.close();}
 }
}finally{await browser.close();await server.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
if(report.cases.some(c=>c.status!=='PASS'))process.exitCode=1;
