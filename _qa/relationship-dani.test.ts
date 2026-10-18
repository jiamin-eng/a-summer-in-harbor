import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,existsSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {initial,applyAction,type Save,type Action} from '../src/story/state';
import {entityAt,rooms} from '../src/world/data';
import {relationshipStage,relationshipMemory,relationshipRuleVersion,relationshipNext,relationshipProgressNotes,validRelationshipGrowth,RELATIONSHIP_NEXT_RULES,RELATIONSHIP_EXPANSION_RULES} from '../src/story/relationship-growth';
import {lifeProjectionKey} from '../src/candidate/life-projection';
import {lifeSnapshotKey} from '../src/life/snapshot';
import {createRuntime} from '../server/runtime';
import {relationshipNarrativeContext,admitRelationshipNarrative} from '../server/relationship-narrative';
// @ts-expect-error frozen asynchronous authority module
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

const fixture=(locale:'en'|'zh'='en'):Save=>({...initial(locale,randomUUID()),scene:'garden',position:entityAt('garden','dani')!.approach,flags:['key','unpacked','bag-returned'],visited:Object.keys(rooms),relations:{dani:-23},items:{key:1}});
const at=(s:Save,scene:string,minute:number):Save=>({...structuredClone(s),scene,townMinutes:minute,position:{...rooms[scene].spawn}});
function step(s:Save,id:string,target='dani'){
 const a:Action={action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,target)!.approach,target,action:id==='introduce'?id:id==='observe'?'relationship-observe:dani':'talk:'+id};
 return applyAction(s,a).head;
}
function closeFriend(locale:'en'|'zh'='en'){
 let s=fixture(locale);assert.equal(relationshipStage(s,'dani'),'stranger');
 s=step(s,'introduce');s=step(s,'rg-greet');s=step(s,'rg-personal');
 s=at(s,'garden',1980);s=step(s,'rg-greet');assert.equal(relationshipStage(s,'dani'),'familiar');
 s=step(s,'rg-request');s=at(s,'garden',2010);s=step(s,'observe','growing-fern');
 assert.equal(s.fernStartedAt,undefined,'observation never waters or takes the public fern');
 s=at(s,'garden',2030);s=step(s,'rg-fulfill');s=step(s,'rg-invite');
 s=at(s,'courtyard',2520);s=step(s,'rg-company');
 s=at(s,'courtyard',3960);s=step(s,'rg-greet');assert.equal(relationshipStage(s,'dani'),'trusted');
 s=step(s,'rg-private');s=step(s,'rg-private-invite');s=step(s,'rg-private-event');s=step(s,'rg-recall');
 for(const minute of [5400,6840]){s=at(s,'courtyard',minute);s=step(s,'rg-greet')}
 return s;
}

for(const locale of ['en','zh'] as const)test(`Dani ${locale}: five stages follow actual days, observation and two shared moments`,()=>{
 const s=closeFriend(locale);
 assert.equal(relationshipStage(s,'dani'),'close');assert.equal(s.relations.dani,-17);
 assert.equal(s.relationshipNextV1?.rules,RELATIONSHIP_NEXT_RULES);
 assert.equal(s.relationshipExpansionV1,undefined);assert.equal(s.relationshipsV1,undefined);
 assert.deepEqual(relationshipMemory(s,'dani').days,[0,1,2,3,4]);
 assert.equal(relationshipMemory(s,'dani').legacy.relation,-23);
 assert.equal(relationshipProgressNotes(s,'dani').length,3);
 assert.match(relationshipNext(s,'dani')!.text[1],/friendship/);
 assert.equal(relationshipRuleVersion('owen'),RELATIONSHIP_EXPANSION_RULES);
 assert.equal(relationshipRuleVersion('dani'),RELATIONSHIP_NEXT_RULES);
 const narrative=relationshipNarrativeContext(s,'dani');assert.equal(narrative.rules,RELATIONSHIP_NEXT_RULES);
 assert.equal(admitRelationshipNarrative(s,'dani',{schema:1,journey:s.id,basisVersion:s.version,person:'dani',lineId:'greeting'})?.length,2);
 assert.equal(admitRelationshipNarrative(s,'dani',{schema:1,journey:s.id,basisVersion:s.version,person:'dani',lineId:'greeting',points:100}),undefined);
 assert.equal(validRelationshipGrowth(s),true);createRuntime().assertReadable(s);
});

test('Dani optional root stays separate, rejects cross-roster placement and updates projections',()=>{
 const s=step(fixture(),'introduce'),unchanged=JSON.stringify(s.relationshipNextV1);
 assert.equal(s.relationshipExpansionV1,undefined);
 const next=step(s,'rg-personal');assert.equal(next.relations.dani,-22);
 assert.notEqual(lifeProjectionKey(s),lifeProjectionKey(next));assert.notEqual(lifeSnapshotKey(s),lifeSnapshotKey(next));
 assert.equal(JSON.stringify(s.relationshipNextV1),unchanged);
 for(const mutate of [
  (x:Save)=>(x.relationshipNextV1!.rules='relationship-expansion-v1.0' as any),
  (x:Save)=>(x.relationshipNextV1!.residents.owen=x.relationshipNextV1!.residents.dani),
  (x:Save)=>(x.relationshipExpansionV1={...x.relationshipNextV1!,rules:RELATIONSHIP_EXPANSION_RULES}),
 ]){
  const bad=structuredClone(s);mutate(bad);assert.equal(validRelationshipGrowth(bad),false);assert.throws(()=>createRuntime().assertReadable(bad),/UNSUPPORTED_SAVE/);
 }
});

test('past Dani score and conversations do not invent days or move plant/news facts',()=>{
 const s=fixture();s.known=['dani'];s.relations.dani=100;s.flags.push('talk:dani:leaf','news:checked');
 const frozen=JSON.stringify(s);for(let i=0;i<30;i++)createRuntime().assertReadable(s);
 assert.equal(JSON.stringify(s),frozen);assert.equal(s.relationshipNextV1,undefined);
 assert.equal(relationshipStage(s,'dani'),'acquaintance');
 const next=step(s,'rg-greet');assert.equal(next.relations.dani,100);
 assert.equal(next.relationshipExpansionV1,undefined);
 assert.equal(next.relationshipNextV1?.residents.dani.legacy.relation,100);
 assert.equal(next.flags.includes('news:checked'),true);
});

test('frozen 4da reader preserves Dani optional root through an ordinary old action',async()=>{
 const base='4da1808c009a2345614e82dee65a5ccccaa3c2ad',root=resolve('.data/rollback-4da-dani');
 if(!existsSync(join(root,'package.json'))){
  mkdirSync(root,{recursive:true});
  const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','src','server','vendor','package.json'],{encoding:'utf8'}).trim().split('\n').filter(p=>/\.(?:[cm]?js|tsx?|json)$/.test(p));
  const archive=execFileSync('git',['archive',base,...files],{maxBuffer:128*1024*1024});
  execFileSync('tar',['-x','-C',root],{input:archive});
  symlinkSync(resolve('node_modules'),join(root,'node_modules'));
  writeFileSync(join(root,'BASELINE.txt'),base+'\n');
 }
 assert.equal(readFileSync(join(root,'BASELINE.txt'),'utf8').trim(),base);
 for(const file of ['server/runtime.ts','src/story/relationship-growth.ts','src/story/state.ts'])assert.deepEqual(readFileSync(join(root,file)),execFileSync('git',['show',base+':'+file]));
 const old=await import(pathToFileURL(join(root,'server/runtime.ts')).href),reader=old.createRuntime();
 const s=at(closeFriend(),'home',7000),frozen=JSON.stringify(s.relationshipNextV1),before=JSON.stringify(s);
 reader.assertReadable(s);assert.equal(reader.upgrade(s),s);assert.equal(JSON.stringify(s),before);
 const next=(await reader.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:'home',position:entityAt('home','bed')!.approach,target:'bed',action:'rest'})).head;
 assert.equal(JSON.stringify(next.relationshipNextV1),frozen);
 assert.equal(relationshipStage(next,'dani'),'close');createRuntime().assertReadable(next);
});

test('SQLite receipt, replay, owner isolation and restart keep Dani progress atomic',async()=>{
 const dir=mkdtempSync('/tmp/harbor-dani-'),config={path:join(dir,'authority.sqlite'),worldId:'dani-synthetic',gameId:'dani-synthetic'},runtime={...createRuntime(),initial:(_l:any,id:string)=>({...fixture(),id,known:['dani']})};
 const A='a'.repeat(64),B='b'.repeat(64);let store=openAsyncSqliteAuthorityStore(config),auth=new AsyncSessionAuthority(store,runtime);
 try{
  let s=await auth.create(A,randomUUID(),'en');const command:Action={action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,'dani')!.approach,target:'dani',action:'talk:rg-personal'},old=JSON.stringify(s);
  const fault={...store,transaction:(work:any)=>store.transaction((repo:any)=>work({...repo,addReceipt:async()=>{throw Error('INJECTED_RECEIPT_FAILURE')}}))};
  await assert.rejects(new AsyncSessionAuthority(fault,runtime).action(A,s.id,command),/INJECTED_RECEIPT_FAILURE/);
  assert.equal(JSON.stringify(await auth.get(A,s.id)),old);
  const first=await auth.action(A,s.id,command);s=first.head;
  assert.equal(s.relationshipNextV1?.residents.dani.interactions['rg-personal']?.minute,540);
  assert.equal(s.relationshipExpansionV1,undefined);assert.deepEqual(await auth.action(A,s.id,command),first);
  await assert.rejects(auth.get(B,s.id),/SESSION_NOT_FOUND/);
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,runtime);
  assert.deepEqual(await auth.get(A,s.id),s);assert.deepEqual(await auth.action(A,s.id,command),first);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
