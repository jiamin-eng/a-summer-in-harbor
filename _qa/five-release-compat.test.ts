import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runtime} from '../server/runtime';
import {dialogueContext} from '../server/dialogue-context';
import {initial,applyAction,availableTopics,type Save} from '../src/story/state';
import {people,rooms,entityAt} from '../src/world/data';
import {nextResidents,nextRoutes} from '../src/world/next-residents';
import {npcSheets} from '../src/world/sheets';
import {knownPeople,relationshipStory} from '../src/story/relationships';
import {nextStoryLeads} from '../src/story/next-neighbors';
import {configuredNews} from '../server/news/configured';
// @ts-expect-error pinned runtime
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

test('Mira addition restores existing knowledge without rewriting earlier history or repeating completed stories',()=>{
 const ids=['rowan','mira','jordan','leila','casey','grant'];
 assert.deepEqual(nextResidents.map(p=>p.id),ids);assert.equal(Object.keys(people).length,23);
 assert.equal(people.mira.mapArt,'mira');assert.ok(nextRoutes.mira);assert.ok(npcSheets.some(p=>p.id==='npc-mira'&&p.image==='./art/npc-mira.png'));
 const s:Save={...initial('en',randomUUID()),scene:'secondhand',townMinutes:780,position:entityAt('secondhand','nell')!.approach,
  known:['nell','mira',...ids.filter(p=>p!=='mira')],relations:{mira:3,rowan:1},
  flags:['key','unpacked','talk:mira:n2-start','talk:nell:n2-mira-consult','neighbors2:mira:done','neighbors2:rowan:done'],
  history:[{id:'old-mira',kind:'talk',person:'mira',text:['先前的经历。','An earlier experience.']}]};
 const before=JSON.stringify(s);runtime.assertReadable(s);assert.equal(runtime.upgrade(s),s);
 assert.ok(knownPeople(s).includes('mira'));assert.ok(relationshipStory(s).people.some(p=>p.id==='mira'));
 assert.ok(nextStoryLeads(s).some(p=>p.id==='neighbors2-mira'&&p.state==='done'));
 assert.ok(!availableTopics(s,'nell').some(p=>p.id==='n2-mira-consult'));
 assert.ok(dialogueContext(s,'nell').knownPeople.some(n=>n[1]==='Mira Vale'));
 assert.equal(JSON.stringify(s),before);assert.equal(s.relations.mira,3);assert.equal(s.history[0].person,'mira');
});

test('13-resident-era bilingual saves reopen unchanged; CAS and replay preserve deferred facts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'five-release-compat-'));
 const cfg={path:join(dir,'qa.sqlite'),worldId:'five-release-compat',gameId:'five-release-compat'};
 let store=openAsyncSqliteAuthorityStore(cfg);
 try{
  for(const locale of ['en','zh'] as const){
   // Existing public save shape: no optional new systems and no schema migration.
   const old:Save={id:randomUUID(),version:17,cursor:17,mapVersion:1,locale,scene:'station',
    position:entityAt('station','mara')!.approach,flags:['key','unpacked','bag-returned'],
    known:['mara','theo','june'],visited:['station','home','cafe'],items:{key:1,toolkit:1,'crop-radish':2},
    energy:83,cash:31,standing:3,relations:{mara:3},
    history:[{id:'old-bag',kind:'talk',person:'mara',text:['工具袋已经交还。','The tool bag was returned.']}]};
   runtime.assertReadable(old);assert.equal(runtime.upgrade(old),old);
   // Import only this test-owned fixture at the persistence boundary, as a prior writer did.
   await store.transaction(async(repo:any)=>{await repo.insert('QA-'+locale,randomUUID(),'qa-fixture',old,Date.now());await repo.write('QA-'+locale,old,old.cursor,Date.now())});
   let auth=new AsyncSessionAuthority(store,runtime);
   assert.deepEqual(await auth.get('QA-'+locale,old.id),old);
   await store.close();store=openAsyncSqliteAuthorityStore(cfg);auth=new AsyncSessionAuthority(store,runtime);
   assert.deepEqual(await auth.get('QA-'+locale,old.id),old);
   await assert.rejects(auth.get('OTHER',old.id),/SESSION_NOT_FOUND/);
  }
  let pre:Save={...initial('en',randomUUID()),scene:'gym',position:entityAt('gym','idris')!.approach,
   known:['mira','idris','rowan'],flags:['key','unpacked','neighbors2:mira:done','neighbors2:rowan:done'],
   relations:{mira:2,rowan:1},items:{key:1,'crop-radish':2},
   plots:{'crop-bed-1':{crop:'radish',grown:120,updatedAt:540,wetUntil:900}},
   history:[{id:'mira-fact',kind:'talk',person:'mira',text:['保留旧经历。','Keep the prior experience.']}]};
  const cmd=(s:Save,target:string,action:string,payload?:unknown)=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target,action,payload});
  pre=applyAction(pre,cmd(pre,'idris','battle-start',{encounter:'training'})).head;
  pre=applyAction(pre,cmd(pre,pre.turnBattle!.id,'battle-pause')).head;
  const pinned=JSON.parse(readFileSync('doc/qa/real-news-20261005/catalog.json','utf8')).records[0];
  pre={...pre,scene:'station',position:entityAt('station','mara')!.approach,known:[...pre.known,'mara'],newsMode:'live',newsEdition:pinned};
  runtime.assertReadable(pre);
  await store.transaction(async(repo:any)=>{await repo.insert('PRE',randomUUID(),'qa-fixture',pre,Date.now());await repo.write('PRE',pre,pre.cursor,Date.now())});
  let auth=new AsyncSessionAuthority(store,runtime);
  await store.close();store=openAsyncSqliteAuthorityStore(cfg);auth=new AsyncSessionAuthority(store,runtime);
  assert.deepEqual(await auth.get('PRE',pre.id),pre);
  const a=cmd(pre,'mara','talk:town');await auth.action('PRE',pre.id,a);await auth.action('PRE',pre.id,a);
  const after=await auth.get('PRE',pre.id);assert.equal(after.version,pre.version+1);
  assert.deepEqual(after.turnBattle,pre.turnBattle);assert.deepEqual(after.newsEdition,pinned);
  assert.deepEqual(after.items,pre.items);assert.deepEqual(after.plots,pre.plots);assert.deepEqual(after.relations,pre.relations);
  assert.ok(after.known.includes('mira'));assert.deepEqual(after.history[0],pre.history[0]);
  await assert.rejects(auth.action('PRE',pre.id,{...a,action_id:randomUUID()}),/VERSION_CONFLICT/);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});

test('production frozen edition is exactly the admitted recheck; deployment explicitly opts in',()=>{
 const path='server/news/frozen-catalog-20261006.json';
 assert.deepEqual(readFileSync(path),readFileSync('doc/qa/real-news-rechecked-20261006/catalog.json'));
 const b=configuredNews(runtime,path,()=>Date.parse('2026-10-06T03:17:49.315Z'));
 const s=b.runtime.initial('en',randomUUID());
 assert.equal(s.newsEdition.publishedAt,'2026-09-16T18:00:00.000Z');
 assert.equal(s.newsEdition.lastCheckedAt,'2026-10-05T18:59:16.076Z');
 assert.equal(s.newsEdition.expiresAt,'2026-10-08T18:59:16.076Z');
 assert.equal(b.newsProject!(s).newsAvailability,'current');
 assert.match(readFileSync('deploy/Dockerfile','utf8'),/HARBOR_NEWS_CATALOG=\/opt\/harbor\/news\/frozen-catalog-20261006\.json/);
});
