/** Run only inside a NEW isolated QA host. No product/old-evidence writes. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const ORIGINAL_ROUND='/Users/yin/Documents/Codex/2026-10-13/task-2/round-20261015-candidates-081701';
const waypoints=[{x:536,y:448},{x:536,y:402},{x:558,y:402}];
export async function readSamiraState(d){return d.p.evaluate(()=>{
 const h=document.querySelector('#rpg'),c=h?.__rpgClient,a=document.querySelector('.harbor-controls .harbor-action');
 const persons=Object.entries(c?.sceneMap?.events?.()??{}).filter(([id,e])=>id.startsWith('person-')&&e.graphics?.().length).map(([id,e])=>({id,x:e.x(),y:e.y()}));
 return {position:{x:Number(h?.dataset.projectedX),y:Number(h?.dataset.projectedY)},paused:h?.dataset.worldPaused!=='false',playerCount:Object.keys(c?.sceneMap?.players?.()??{}).length,canvases:document.querySelectorAll('#rpg canvas').length,persons,label:a?.querySelector('span')?.textContent?.trim()??'',ready:!!a&&!a.disabled&&a.classList.contains('is-ready'),room:c?.activeRoom?.()?.name};
})}
export function samiraIsReady(s,name){return !s.paused&&s.ready&&s.label===name&&s.persons.some(e=>e.id==='person-samira')}
/** Target readiness is checked BEFORE coordinate convergence or stall errors. */
export async function walkUntilSamira(d,worldModule,name,records,options={}){
 const read=options.read??(()=>readSamiraState(d)),input=options.input??(async(key,ms)=>{await d.p.keyboard.down(key);try{await d.p.waitForTimeout(ms)}finally{await d.p.keyboard.up(key)}await d.p.waitForTimeout(25)});
 let goalIndex=0,stalls=0;const h=options.head??await d.getHead(),base=worldModule.worldWithFlags(h.flags),{findPath,walkable}=worldModule;
 for(let i=0;i<(options.maxSteps??200);i++){
  const s=await read();assert.equal(s.playerCount,1,'single actual controlled player required');assert.equal(s.canvases,1);assert.equal(s.room,'chapel');
  if(samiraIsReady(s,name))return {reason:'actual-Samira-target-ready',state:s,inputSteps:records.length};
  if(s.paused){await d.p.waitForTimeout(75);continue}
  const p=s.position;assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));const live={...base,scenes:{...base.scenes,chapel:{...base.scenes.chapel,obstacles:[...base.scenes.chapel.obstacles,...s.persons.map(q=>({x:q.x-9,y:q.y-8,w:18,h:8}))]}}};
  while(goalIndex<waypoints.length-1&&Math.hypot(p.x-waypoints[goalIndex].x,p.y-waypoints[goalIndex].y)<2)goalIndex++;
  const goal=waypoints[goalIndex],path=findPath(live,'chapel',p,goal);assert.ok(path.length,'No collision-aware route: '+JSON.stringify({p,goal,target:s.label}));
  const next=path.find(q=>Math.hypot(q.x-p.x,q.y-p.y)>3)??goal,dx=next.x-p.x,dy=next.y-p.y;let horizontal=Math.abs(dx)>Math.abs(dy);
  const probe=axis=>axis?{x:p.x+Math.sign(dx)*Math.min(2,Math.abs(dx)),y:p.y}:{x:p.x,y:p.y+Math.sign(dy)*Math.min(2,Math.abs(dy))};
  if(!walkable(live,'chapel',probe(horizontal))&&Math.abs(horizontal?dy:dx)>.5)horizontal=!horizontal;
  assert.ok(walkable(live,'chapel',probe(horizontal)),'No safe keyboard step');const delta=horizontal?dx:dy,key=horizontal?(dx>0?'ArrowRight':'ArrowLeft'):(dy>0?'ArrowDown':'ArrowUp'),ms=Math.max(5,Math.min(65,Math.abs(delta)/112*1000));
  await input(key,ms);const after=await read();records.push({key,ms,from:p,to:after.position,beforeTarget:s.label,afterTarget:after.label,at:new Date().toISOString()});
  if(samiraIsReady(after,name))return {reason:'actual-Samira-target-ready',state:after,inputSteps:records.length};
  stalls=Math.hypot(after.position.x-p.x,after.position.y-p.y)<.15?stalls+1:0;if(stalls>12)throw Error('Movement stalled before Samira became ready: '+JSON.stringify({goal,state:after}));
 }
 throw Error('Samira target not reached within bounded keyboard steps');
}
async function ready(d){await d.p.waitForFunction(()=>!!document.querySelector('#rpg')?.__rpgClient?.getCurrentPlayer()&&!document.querySelector('.harbor-loading')&&!document.querySelector('.harbor-account-switch')&&document.querySelector('#rpg')?.dataset.worldPaused==='false',null,{timeout:25000})}
async function finishReply(d){for(let i=0;i<12;i++){if(!await d.p.locator('.harbor-reply').isVisible())return;await d.p.locator('.harbor-reply__next button').click();await d.p.waitForTimeout(75)}assert.equal(await d.p.locator('.harbor-reply').isVisible(),false,'reply pagination did not finish')}
export default async function replay(env){
 assert.ok(!resolve(env.root).startsWith(ORIGINAL_ROUND),'Use a NEW evidence/SQLite/profile directory; original QA evidence is immutable');
 const load=p=>import(pathToFileURL(resolve(env.root,'source',p)).href),[data,engine,growth]=await Promise.all([load('src/world/data.ts'),load('src/engine/world.ts'),load('src/story/relationship-growth.ts')]);
 const identity=JSON.parse(readFileSync(resolve(env.root,'reports/candidate-identity.json'),'utf8')),commit=execFileSync('git',['rev-parse','HEAD'],{cwd:resolve(env.root,'source'),encoding:'utf8'}).trim();assert.equal(commit,identity.version);
 const seat=data.entityAt('chapel','chapel-seat'),fixed=seat.at.y===515;assert.ok(fixed||seat.at.y===485,'Unreviewed chapel geometry');
 const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),report={candidate:commit,geometry:fixed?'seat-hotspot-515':'unchanged-4451-c9-seat-485',fixture:'fresh synthetic only; no reuse of original account/journey',cases:[],errors:[],browserGate:'actual renderer/UI, not rule-test substitution'};
 const configs=[['authored-approach',{x:592,y:442}],['previous-stall-coordinate',{x:599.8399999983309,y:400.072800001335}],['door',data.rooms.chapel.spawn]];
 for(const [width,height,locale]of[[390,844,'zh'],[320,568,'en']])for(const [start,position]of configs){
  const name=`samira-target-${commit.slice(0,7)}-${stamp}-${width}-${locale}-${start}`,d=await env.create(name,{scene:'chapel',locale,minute:780,known:['samira'],position:{...position},flags:['key','unpacked','bag-returned','route-open'],items:{key:1}},{width,height}),r={fixture:name,start,viewport:{width,height},locale,status:'running',steps:[]};let mode='external-guest';
  try{
   await d.enter();await ready(d);if(await d.p.locator('[data-menu-close]').isVisible())await d.p.locator('[data-menu-close]').click();await ready(d);
   const label=data.people.samira.name[locale==='zh'?0:1];r.initial=await readSamiraState(d);
   if(fixed&&start==='authored-approach')assert.ok(samiraIsReady(r.initial,label),'Fixed default approach still does not select Samira');
   if(start==='door'){
    await d.p.locator('[data-target="samira"]').press('Enter');
    for(let i=0;i<45;i++){const s=await readSamiraState(d);if(samiraIsReady(s,label))break;await d.p.waitForTimeout(60)}
    r.afterNormalApproach=await readSamiraState(d);
   }
   r.walk=await walkUntilSamira(d,{...data,...engine},label,r.steps);await d.snap('target-ready-external-guest');await d.p.addStyleTag({content:'#alteru-guest-banner{display:none!important}'});mode='platform-layout';await d.snap('target-ready-platform-layout');
   assert.ok(samiraIsReady(await readSamiraState(d),label));await d.p.locator('.harbor-controls .harbor-action.is-ready').click();await d.p.getByRole('dialog',{name:label,exact:true}).waitFor();await finishReply(d);
   const before=await d.getHead(),topic=growth.growthTopics(before,'samira').find(t=>t.id==='rg-personal');assert.ok(topic,'Fresh synthetic Samira personal topic missing');
   const response=d.p.waitForResponse(res=>{if(res.request().method()!=='POST'||!res.url().endsWith('/action'))return false;const a=res.request().postDataJSON();return a?.target==='samira'&&a?.action==='talk:rg-personal'});await d.p.getByRole('dialog',{name:label,exact:true}).getByRole('button',{name:topic.label[locale==='zh'?0:1],exact:true}).click();const http=await response;assert.equal(http.status(),200,await http.text());const result=await http.json(),after=result.head;assert.equal(after.id,before.id);assert.equal(after.relations.samira,(before.relations.samira??0)+1);assert.equal(after.history.at(-1).person,'samira');assert.deepEqual(after.history.at(-1).text,topic.reply);assert.ok(after.relationshipsV1.residents.samira.interactions['rg-personal']);assert.deepEqual(after.relationshipExpansionV1,before.relationshipExpansionV1);assert.deepEqual(after.items,before.items);
   await finishReply(d);await d.snap('Samira-personal-platform-layout');await d.p.locator('[data-menu-close]').click();const memory=JSON.stringify(after.relationshipsV1);await d.p.reload();mode='external-guest';if(await d.p.getByRole('button',{name:d.tx('继续','Continue'),exact:true}).isVisible())await d.p.getByRole('button',{name:d.tx('继续','Continue'),exact:true}).click();await ready(d);const restored=await d.getHead();assert.equal(restored.id,after.id);assert.equal(JSON.stringify(restored.relationshipsV1),memory);assert.equal(restored.relations.samira,after.relations.samira);await d.p.addStyleTag({content:'#alteru-guest-banner{display:none!important}'});mode='platform-layout';await d.snap('Samira-restored-platform-layout');
   Object.assign(r,{status:'passed',journey:after.id,beforeRelation:before.relations.samira??0,afterRelation:after.relations.samira,actionPerson:after.history.at(-1).person,reloaded:true});
  }catch(e){r.status='blocked';r.error=String(e);report.errors.push({fixture:name,error:String(e)});await d.snap('first-failure-'+mode).catch(()=>{});}
  finally{report.cases.push(r);writeFileSync(resolve(env.root,'reports/samira-target-'+stamp+'.json'),JSON.stringify(report,null,2)+'\n');env.record(name,r.status,{error:r.error});await d.c.close()}
 }
 return report;
}
