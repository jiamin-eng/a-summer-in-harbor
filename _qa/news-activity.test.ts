import{test}from'node:test';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{runtime}from'../server/runtime';import{configuredNews}from'../server/news/configured';import{dialogueContext}from'../server/dialogue-context';import{initial,type Save}from'../src/story/state';import{entityAt}from'../src/world/data';import{description}from'../src/story/descriptions';
// @ts-expect-error pinned local authority
import{AsyncSessionAuthority,openAsyncSqliteAuthorityStore}from'../vendor/dynamic-runtime/packages/authority-session/async.mjs';
for(const edition of['current-finance','legacy-hours'])test(`${edition}: full authored story persists and its map/context describes the actual checked note`,async()=>{
 const dir=mkdtempSync(join(tmpdir(),'harbor-news-activity-'));const cfg={path:join(dir,'qa.sqlite'),worldId:'news-activity-local',gameId:'news-activity-local'};let store=openAsyncSqliteAuthorityStore(cfg);
 const base=edition==='current-finance'?configuredNews(runtime,'server/news/frozen-catalog-20261006.json',()=>Date.parse('2026-10-06T04:43:00Z')).runtime:runtime;
 const seed={...base,initial:(locale:any,id:string)=>({...base.initial(locale,id),scene:'garden',position:entityAt('garden','dani')!.approach,known:['dani'],flags:['key','unpacked'],visited:['station','garden']})};
 try{let auth=new AsyncSessionAuthority(store,seed),s:Save=await auth.create('LOCAL_QA_OWNER',randomUUID(),'en');const before=structuredClone(s);
  for(const topic of['visitor-news','visitor-test',edition==='current-finance'?'visitor-budget':'visitor-hours']){const a={action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target:'dani',action:'talk:'+topic};await auth.action('LOCAL_QA_OWNER',s.id,a);if(topic!=='visitor-news')await auth.action('LOCAL_QA_OWNER',s.id,a);s=await auth.get('LOCAL_QA_OWNER',s.id)}
  assert.equal(s.cursor,3);assert.equal(s.cash,before.cash);assert.equal(s.energy,before.energy);assert.deepEqual(s.items,before.items);assert.deepEqual(s.relations,before.relations);assert.equal(s.townMinutes,before.townMinutes);assert.ok(s.flags.includes('news:checked'));
  await store.close();store=openAsyncSqliteAuthorityStore(cfg);auth=new AsyncSessionAuthority(store,seed);assert.deepEqual(await auth.get('LOCAL_QA_OWNER',s.id),s);
  const shown=description(s,entityAt('garden','dani')!);const context=dialogueContext(s,'dani').residentLife.activity;assert.deepEqual(context,shown);
  if(edition==='current-finance'){assert.match(shown[0],/预算.*\$3/);assert.match(shown[1],/budget.*\$3/);assert.doesNotMatch(shown.join(' '),/营业|hours/);assert.deepEqual(s.newsEdition,before.newsEdition)}else{assert.match(shown[0],/营业/);assert.match(shown[1],/hours/);assert.equal(s.newsEdition,undefined)}
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
