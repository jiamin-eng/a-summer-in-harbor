// Isolated compiled-client acceptance. All host identities and tokens are local
// fixtures; external requests and real player endpoints are blocked.
import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('dist'),game='e78df027-7ef4-4d49-82eb-ea91f03d9fb3';
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json'};
const first='9007199254740993',second='9007199254740992';
const tokenA='LOCAL_SYNTHETIC_TOKEN_A',tokenB='LOCAL_SYNTHETIC_TOKEN_B',tokenC='LOCAL_SYNTHETIC_TOKEN_C',expired='LOCAL_SYNTHETIC_EXPIRED';
const calls:{path:string;idShape:string;tokenMatch:boolean}[]=[];
let writes=0;
let holdFirstBootstrap=false,heldResponse:ServerResponse|undefined,markHeld:(()=>void)|undefined;
const server=createServer((req,res)=>{
 const path=new URL(req.url??'/', 'http://localhost').pathname;
 if(path==='/host'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><iframe src="/" style="width:390px;height:844px"></iframe>');return}
 if(path.startsWith('/'+game+'/api/')){
  const id=req.headers['x-harbor-telegram-id'],auth=req.headers.authorization;
  calls.push({path:path.slice(game.length+1),idShape:id===first?'first':id===second?'second':'other',tokenMatch:auth==='Bearer '+tokenA||auth==='Bearer '+tokenB||auth==='Bearer '+tokenC});
  if(path.endsWith('/api/sessions')&&req.method==='POST')writes++;
  if(holdFirstBootstrap&&path.endsWith('/api/bootstrap')&&id===first){holdFirstBootstrap=false;heldResponse=res;markHeld?.();return}
  if(auth==='Bearer '+expired){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'PLATFORM_HTTP_REJECTED'}));return}
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(path.endsWith('/api/bootstrap')?{mode:'platform-verified-v1',platformIdentityVerified:true,kind:'account'}:[]));return;
 }
 const file=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_SERVER_ADDRESS');
const origin='http://127.0.0.1:'+address.port;
let browser;
const report:any={scope:'isolated compiled Main; synthetic host only; external requests blocked',cases:[],realPlatformRequests:0,playerWrites:0,pageErrors:[]};
try{
 browser=await chromium.launch({headless:true,executablePath:'/Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--disk-cache-size=1']});
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript({content:"window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:'',token:'',callAigramAPI:()=>{window.__qaStats=(window.__qaStats||0)+1;return Promise.resolve({retcode:0})}}"});
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.name));page.setDefaultTimeout(12000);
 await page.goto(origin+'/');
 const login=page.getByRole('button',{name:'Sign in to start',exact:true});await login.waitFor();
 await page.evaluate(()=>{const button=document.querySelector('button.harbor-primary') as HTMLButtonElement;button.click();button.click()});
 assert.equal(await page.evaluate(()=>(window as any).__qaStats),1,'duplicate login click must issue one bridge request');
 await page.evaluate(id=>(window as any).Aigram.telegramId=id,first);await page.waitForTimeout(350);
 assert.equal(calls.length,0,'ID alone must not request a directory');
 await page.evaluate(token=>(window as any).Aigram.token=token,tokenA);
 await page.getByRole('button',{name:'New game',exact:true}).waitFor();
 assert.ok(calls.some(c=>c.path==='/api/bootstrap'&&c.idShape==='first'&&c.tokenMatch));
 assert.equal(calls.filter(c=>c.path==='/api/bootstrap').length,1,'one host transition must read the directory once');
 report.cases.push({case:'statistics-before-shell, ID-before-token, large string ID',passed:true,bootstrapCalls:calls.filter(c=>c.path==='/api/bootstrap').length});

 await page.evaluate(token=>(window as any).Aigram.token=token,expired);
 await page.getByRole('button',{name:'Sign in again',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'New game',exact:true}).count(),0,'expired token must not open a journey');
 await page.evaluate(token=>(window as any).Aigram.callAigramAPI=()=>{(window as any).__qaStats++;(window as any).Aigram.token=token;return Promise.resolve({retcode:0})},tokenB);
 await page.getByRole('button',{name:'Sign in again',exact:true}).click();
 await page.getByRole('button',{name:'New game',exact:true}).waitFor();
 assert.ok(calls.some(c=>c.path==='/api/bootstrap'&&c.idShape==='first'&&c.tokenMatch));
 report.cases.push({case:'expired token fails closed; explicit host re-sign-in recovers',passed:true});

 const beforeRotation=calls.length;
 await page.evaluate(token=>(window as any).Aigram.token=token,tokenA);
 await page.waitForFunction(()=>document.querySelector('main')?.getAttribute('aria-busy')==='false'&&document.querySelector('main')?.textContent?.includes('New game'));
 await page.waitForTimeout(350);
 assert.ok(calls.length>beforeRotation,'token rotation must retry the directory');
 assert.ok(calls.slice(beforeRotation).every(c=>c.tokenMatch&&c.idShape==='first'));
 report.cases.push({case:'same-ID token rotation',passed:true});

 const beforeLogout=calls.length;
 await page.evaluate(()=>(window as any).Aigram.token='');await login.waitFor();await page.waitForTimeout(250);
 assert.equal(calls.length,beforeLogout,'logout must not request an account');
 report.cases.push({case:'token removal fails closed',passed:true});

 const beforeTokenFirst=calls.length;
 await page.evaluate(()=>{(window as any).Aigram.telegramId='';(window as any).Aigram.token='LOCAL_SYNTHETIC_TOKEN_C'});
 await page.waitForTimeout(250);assert.equal(calls.length,beforeTokenFirst,'token alone must not read a directory');
 await page.evaluate(id=>(window as any).Aigram.telegramId=id,second);
 await page.getByRole('button',{name:'New game',exact:true}).waitFor();
 assert.ok(calls.some(c=>c.idShape==='second'&&c.tokenMatch));
 report.cases.push({case:'token-first account switch keeps separate string ID',passed:true});

 const beforeUnsafe=calls.length;
 await page.evaluate(()=>(window as any).Aigram.token='');await login.waitFor();
 await page.evaluate(token=>{(window as any).Aigram.telegramId=Number('9007199254740993');(window as any).Aigram.token=token},tokenA);
 await page.waitForTimeout(400);assert.equal(calls.length,beforeUnsafe,'unsafe JS number must not reach API');
 report.cases.push({case:'unsafe-number ID rejected',passed:true});
 await context.close();

 const queryContext=await browser.newContext({viewport:{width:320,height:568},locale:'zh-CN',serviceWorkers:'block'});
 await queryContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const queryPage=await queryContext.newPage();const beforeQuery=calls.length;
 await queryPage.goto(origin+'/?telegram_id='+first+'&token=LOCAL_SYNTHETIC_QUERY_ONLY');
 await queryPage.getByRole('button',{name:'登录并开始',exact:true}).waitFor();await queryPage.waitForTimeout(350);
 assert.equal(calls.length,beforeQuery,'launch query alone must not become identity');
 report.cases.push({case:'query-only guest rejected',passed:true});await queryContext.close();

 const nativeContext=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',serviceWorkers:'block'});
 await nativeContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await nativeContext.addInitScript({content:"window.__name=f=>f;window.Aigram={telegramId:'9007199254740993',token:'LOCAL_SYNTHETIC_TOKEN_A'};window.webkit={messageHandlers:{aigram:{postMessage(){}}}}"});
 const nativePage=await nativeContext.newPage();nativePage.on('pageerror',error=>report.pageErrors.push(error.name));await nativePage.goto(origin+'/');await nativePage.getByRole('button',{name:'New game',exact:true}).waitFor();
 report.cases.push({case:'synthetic NativeApp bridge with late/absent shell flag',passed:true});await nativeContext.close();

 const frameContext=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',serviceWorkers:'block'});
 await frameContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await frameContext.addInitScript({content:"window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:'9007199254740993',token:'LOCAL_SYNTHETIC_TOKEN_A',callAigramAPI:()=>Promise.resolve({retcode:0})}"});
 const host=await frameContext.newPage();host.on('pageerror',error=>report.pageErrors.push(error.name));await host.goto(origin+'/host');await host.frameLocator('iframe').getByRole('button',{name:'New game',exact:true}).waitFor();
 report.cases.push({case:'synthetic TelegramMiniApp embedded transport',passed:true});await frameContext.close();

 holdFirstBootstrap=true;const held=new Promise<void>(resolve=>markHeld=resolve);const lateStart=calls.length;
 const lateContext=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',serviceWorkers:'block'});
 await lateContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await lateContext.addInitScript({content:"window.__name=f=>f;window.Aigram={isInAigram:true,telegramId:'9007199254740993',token:'LOCAL_SYNTHETIC_TOKEN_A',callAigramAPI:()=>Promise.resolve({retcode:0})}"});
 const latePage=await lateContext.newPage();latePage.on('pageerror',error=>report.pageErrors.push(error.name));await latePage.goto(origin+'/');
 await Promise.race([held,new Promise((_resolve,reject)=>setTimeout(()=>reject(Error('held bootstrap not reached')),10000))]);
 await latePage.evaluate(([id,token])=>{(window as any).Aigram.telegramId=id;(window as any).Aigram.token=token},[second,tokenC]);
 await latePage.getByRole('button',{name:'New game',exact:true}).waitFor();
 if(heldResponse&&!heldResponse.destroyed){heldResponse.writeHead(200,{'Content-Type':'application/json'});heldResponse.end(JSON.stringify({mode:'platform-verified-v1',kind:'account'}))}
 assert.ok(calls.slice(lateStart).some(c=>c.path==='/api/bootstrap'&&c.idShape==='second'&&c.tokenMatch));
 report.cases.push({case:'late old-account bootstrap cannot bind switched account',passed:true});await lateContext.close();
 assert.equal(writes,0);assert.deepEqual(report.pageErrors,[]);
 report.playerWrites=0;report.result='PASS';
}catch(error){report.result='FAIL';report.failure=error instanceof Error?error.message:'unknown';process.exitCode=1}
finally{heldResponse?.destroy();await browser?.close();await new Promise<void>(resolve=>server.close(()=>resolve()));console.log(JSON.stringify(report))}
