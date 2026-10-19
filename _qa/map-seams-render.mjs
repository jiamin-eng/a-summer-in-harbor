/** Isolated renderer only: no API, account, save, model or production service. */
import {createServer} from 'vite';
import {createServer as portProbe} from 'node:net';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {passages,outdoors} from '../src/world/outdoors.ts';
import {rooms} from '../src/world/data.ts';
import {internalPassage} from '../src/candidate/continuity.ts';
const phase=process.argv[2];if(!['before','after'].includes(phase))throw Error('EXPLICIT_PHASE_REQUIRED');const out='../qa-map-seams-20261019/'+phase;await mkdir(out,{recursive:true});
const probe=portProbe();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const ephemeral=probe.address().port;await new Promise(r=>probe.close(r));const server=await createServer({server:{host:'127.0.0.1',port:ephemeral,strictPort:true},clearScreen:false});await server.listen();const port=server.httpServer.address().port;
let browser;const report={phase,scope:'actual isolated RPGJS/Pixi, synthetic restore at authored approach; no authoritative travel or Main interaction claim',port,views:[],errors:[],outsideRequests:[],started:new Date().toISOString()};
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader']});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1'&&u.protocol!=='data:'){report.outsideRequests.push(u.hostname);return r.abort()}return r.continue()});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto('http://127.0.0.1:'+port+'/qa-renderer.html?debug=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.harborRendererHarness,{timeout:30000});
 for(const [scene,links] of Object.entries(passages))for(const [destination,p] of Object.entries(links)){
  await page.evaluate(async({scene,p})=>window.harborRendererHarness.restore(scene,p),{scene,p:p.approach});await page.waitForTimeout(120);const file=scene+'--'+destination+'.png';await page.screenshot({path:out+'/'+file});const rendered=await page.evaluate(({at})=>{const h=window.harborRendererHarness,host=document.querySelector('#rpg'),client=host.__rpgClient,actor=client?.getCurrentPlayer();return {position:h.space.position(),scene:h.space.scene(),targetScreen:h.space.project(at),direction:actor?.direction?.(),animation:actor?.animationName?.(),canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,rect:c.getBoundingClientRect().toJSON()}))}},{at:p.at});report.views.push({scene,destination,passage:p,continuous:internalPassage(scene,destination),bounds:outdoors[scene].bounds,file,...rendered});
 }
 // Cached indoor scenes are also restored from reciprocal entrances, without a fake journey.
 for(const [scene,r] of Object.entries(rooms).filter(([,r])=>!r.outdoor&&!r.id.startsWith('workshop-annex-'))){const e=r.entities.find(e=>e.kind==='portal');await page.evaluate(async({scene,p})=>window.harborRendererHarness.restore(scene,p),{scene,p:e?.approach??r.spawn});await page.waitForTimeout(80);await page.screenshot({path:out+'/interior-'+scene+'.png'});report.views.push({scene,interior:true,from:e?.destination,position:e?.approach??r.spawn,file:'interior-'+scene+'.png'})}
 report.passed=report.errors.length===0;console.log(JSON.stringify({phase,views:report.views.length,errors:report.errors,outsideRequests:report.outsideRequests}));
} catch(e){report.failure=String(e);process.exitCode=1;console.error(e)}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser?.close();await server.close()}
