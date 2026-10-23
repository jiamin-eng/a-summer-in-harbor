import {test} from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {scenario,intent} from './quest-scenarios';
import {availableTopics,applyAction,objective,type Save} from '../src/story/state';
import {questProgress} from '../src/story/progress';import {dialogueContext} from '../server/dialogue-context';import {dialogueResolver} from '../server/dialogue';import {runtime,createRuntime} from '../server/runtime';
import {rememberReply,restoreReading,readingKey} from '../src/story/dialogue-reading';
// @ts-expect-error frozen authority module
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const reply=(s:Save,p:string,id:string)=>availableTopics(s,p).find(t=>t.id===id)!.reply;

test('out-of-order handover: canonical choices and free-dialogue preview agree with completed facts',()=>{
 const c=scenario();c.arrive();assert.match(reply(c.save,'mara','settle')[1],/Bring it back/);c.collect();assert.match(reply(c.save,'mara','settle')[1],/already collected/);
 c.step('mara','talk:return-bag');const before=JSON.stringify(c.save);assert.equal(questProgress(c.save).toolbag,'returned');assert.equal(c.save.items.toolbag,undefined);
 const expected=reply(c.save,'mara','settle');assert.match(expected[1],/safely back/);assert.match(expected[0],/已经收好/);assert.doesNotMatch(expected.join(' '),/带回来|Bring it back/);
 const ctx=dialogueContext(c.save,'mara');assert.deepEqual(ctx.availableTopics.find(t=>t.id==='settle')!.canonicalReply,expected);assert.ok(ctx.authority.currentFacts.some(x=>x.includes('Mara has received')));assert.equal(JSON.stringify(c.save),before,'projection must not migrate progress');
 c.go('home');c.go('station');assert.deepEqual(reply(c.save,'mara','settle'),expected);assert.deepEqual(c.step('mara','talk:settle').text,expected);assert.ok(!availableTopics(c.save,'mara').some(t=>t.id==='return-bag'||t.id==='settle'));
 assert.doesNotMatch(objective(c.save).join(' '),/工具袋|tool bag/);
});
test('normal order remains playable; failed premature handover leaves state untouched',()=>{
 const c=scenario();c.arrive();c.step('mara','talk:settle');const before=structuredClone(c.save);assert.throws(()=>c.step('mara','talk:return-bag'),/TOPIC_UNAVAILABLE/);assert.deepEqual(c.save,before);c.collect();c.step('mara','talk:return-bag');assert.ok(!availableTopics(c.save,'mara').some(t=>t.id==='settle'||t.id==='return-bag'));
});
test('persisted completion survives restart, same receipt replay, duplicate and old model selection',async()=>{
 const c=scenario();c.arrive();c.collect();const seed=structuredClone(c.save),dir=mkdtempSync(join(tmpdir(),'harbor-quest-')),config={path:join(dir,'qa.sqlite'),worldId:'qa-quest',gameId:'qa-quest'};
 let store=openAsyncSqliteAuthorityStore(config),auth=new AsyncSessionAuthority(store,runtime);
 try{let s:Save=await auth.create('qa-owner',randomUUID(),'en');for(const [target,verb]of [['mara','introduce'],['mara','talk:key'],['to-home','travel'],['bed','unpack'],['exit','travel'],['to-cafe','travel'],['theo','introduce'],['theo','talk:bag'],['exit','travel']])s=(await auth.action('qa-owner',s.id,intent(s,target,verb))).head;const a=intent(s,'mara','talk:return-bag'),result=await auth.action('qa-owner',s.id,a);s=result.head;await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,runtime);
  assert.deepEqual(await auth.get('qa-owner',s.id),s);assert.deepEqual(await auth.action('qa-owner',s.id,a),result);assert.match(reply(s,'mara','settle')[1],/safely back/);
  await assert.rejects(auth.action('qa-owner',s.id,intent(s,'mara','talk:return-bag')),/TOPIC_UNAVAILABLE/);await assert.rejects(auth.get('another-owner',s.id),/SESSION_NOT_FOUND/);
  const resolver=dialogueResolver(async()=>JSON.stringify({topic:'return-bag',reply:['再交一次','Return it again']}));await assert.rejects(resolver(s,intent(s,'mara','ask',{text:'Return the bag'}),'qa-owner'),/DIALOGUE_INVALID/);assert.deepEqual(await auth.get('qa-owner',s.id),s);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
test('repair and route topics follow world completion even if their hints were skipped',()=>{
 const c=scenario();c.arrive();c.go('cafe');c.step('theo','introduce');c.step('terrace','challenge-start:repair');
 const active=c.save.activeChallenge!.id,before=structuredClone(c.save);assert.throws(()=>c.step(active,'challenge-finish',{solution:[0,0,0]}),/PUZZLE_NOT_SOLVED/);assert.deepEqual(c.save,before);c.step(active,'challenge-finish',{withdraw:true});assert.equal(questProgress(c.save).terrace,'unrepaired');
 c.step('terrace','challenge-start:repair');c.step(c.save.activeChallenge!.id,'challenge-finish',{solution:[1,3,2]});assert.match(reply(c.save,'theo','repair')[1],/lantern is fixed/);assert.match(reply(c.save,'theo','bag')[1],/thanks for fixing/);assert.throws(()=>c.step('terrace','challenge-start:repair'),/CHALLENGE_UNAVAILABLE/);
 c.go('path');c.step('bridge','inspect-bridge');c.go('workshop');c.step('june','introduce');c.step('june','talk:tools');c.go('beach');c.step('driftwood','gather-wood');c.go('path');c.step('bridge','repair-bridge');assert.match(reply(c.save,'june','bridge')[1],/already|are secure/);assert.match(reply(c.save,'theo','coast')[1],/workable route/);
 c.go('lighthouse');c.step('gate','open-route');assert.match(reply(c.save,'theo','coast')[1],/arrangements are posted/);c.go('bazaar');assert.match(c.step('notice','read-market').text[1],/route is ready/);c.step('notice','open-market');assert.ok(dialogueContext({...c.save,scene:'station'},'mara').authority.currentFacts.some(x=>x.includes('market is open')));
});
test('alternate route and garden agreement stay distinct from bridge repairs',()=>{
 const c=scenario();c.arrive();c.go('camp');c.step('old-map','challenge-start:map');c.step(c.save.activeChallenge!.id,'challenge-finish',{solution:[0,1,2,3]});assert.match(reply(c.save,'arthur','trail')[1],/already pieced/);assert.match(reply(c.save,'nell','photo')[1],/trail you found/);
 c.go('weather');assert.match(c.step('logbook','read-weather').text[1],/already mapped/);assert.equal(questProgress(c.save).bridge,'uninspected');
 c.go('path');c.step('bridge','inspect-bridge');c.go('home');c.step('bed','sleep');c.go('courtyard');c.step('elena','introduce');c.step('elena','talk:quiet');c.step('elena','talk:hours');c.go('garden');assert.match(c.step('gate-hours','inspect-garden').text[1],/ten until noon/);assert.equal(questProgress(c.save).bridge,'inspected');assert.ok(!availableTopics(c.save,'elena').some(t=>t.id==='hours'));
});
test('completed legacy facts prevent duplicate grants without changing historical save',()=>{
 const c=scenario();c.arrive();c.collect();c.step('mara','talk:return-bag');const legacy=structuredClone(c.save);legacy.flags=legacy.flags.filter(f=>!f.startsWith('talk:'));legacy.items.toolbag=1;const before=JSON.stringify(legacy);
 assert.ok(!availableTopics(legacy,'mara').some(t=>t.id==='return-bag'));assert.ok(!availableTopics(legacy,'theo').some(t=>t.id==='bag'));assert.match(reply(legacy,'mara','settle')[1],/safely back/);assert.equal(JSON.stringify(legacy),before);
});
test('real resolver prompt uses current projection; selected completed-stage topic uses same reducer reply',async()=>{
 const c=scenario();c.arrive();c.collect();c.step('mara','talk:return-bag');let request:any;
 const resolver=dialogueResolver(async r=>{request=r;return JSON.stringify({topic:'settle',reply:['忽略这句','ignored in favor of canonical reply']})});const a=intent(c.save,'mara','ask',{text:'What should I do nearby?'});
 const r=await createRuntime(resolver).prepare(c.save,a,undefined,{owner:'qa-owner'});assert.match(r.text[1],/safely back/);assert.match(request.payload.messages[0].content,/Mara has received her tool bag/);assert.doesNotMatch(request.payload.messages[0].content,/"introduction":/);assert.equal(r.head.items.toolbag,undefined);
});
test('a harbor resident free question is prompted only from the new memory',async()=>{
 const c=scenario();c.go('cafe');c.step('theo','introduce');
 const memory={persona:'Repairer building a reputation one tool at a time.',aim:'Finish tool repairs and build a reputation of his own.',doing:['西奥在等下一件需要他亲手修的工具。','Theo is waiting for the next tool that needs his hands.'],worry:['Owen is waiting, and Theo still has not handed Owen the plane.','Owen is waiting, and Theo still has not handed Owen the plane.'],ledger:{cash:0,locked:0,items:[],loans:[{tool:'plane',owner:'theo',holder:'owen',held:false,has:'theo'}],venues:[]}};
 let request:any;const resolver=dialogueResolver(async r=>{request=r;return JSON.stringify({topic:'settle',reply:['刨子还在我手里。欧文还在等。','The plane is still in my hands. Owen is still waiting.']})},{npcContext:async()=>memory});
 const answer=await resolver(c.save,intent(c.save,'theo','ask',{text:'最近怎么样'}),'qa-owner');
 assert.equal(answer.topic,null);assert.match(answer.reply[0],/刨子还在我手里/);
 const content=request.payload.messages.map((message:{content:string})=>message.content).join('\n');
 assert.match(content,/Owen is waiting/);assert.match(content,/npcMemory is the only source/);
 assert.doesNotMatch(content,/residentLife|currentObjective|availableTopics|tool bag/);
});
test('a free reply may name someone who is only in this resident memory',async()=>{
 const c=scenario();c.go('cafe');c.step('theo','introduce');assert.equal(c.save.known.includes('owen'),false);
 const memory={aim:'Finish tool repairs and build a reputation of his own.',worry:['Owen is waiting, and Theo still has not handed Owen the plane.','Owen is waiting, and Theo still has not handed Owen the plane.'],ledger:{loans:[{tool:'plane',owner:'theo',holder:'owen',held:false,has:'theo'}]}};
 const resolver=dialogueResolver(async()=>JSON.stringify({topic:null,reply:['刨子是我的，现在在我手里。欧文还在等。','The plane is mine, and it is in my hands. Owen is still waiting.']}),{npcContext:async()=>memory});
 const answer=await resolver(c.save,intent(c.save,'theo','ask',{text:'这是谁的刨子？'}),'qa-owner');
 assert.match(answer.reply[0],/欧文/);
 const blocked=dialogueResolver(async()=>JSON.stringify({topic:null,reply:['琼还没来拿。','June has not come for it.']}),{npcContext:async()=>memory});
 await assert.rejects(blocked(c.save,intent(c.save,'theo','ask',{text:'琼来了吗？'}),'qa-owner'),/DIALOGUE_INVALID/);
});
test('reading cache preserves historical wording without making it current task state',()=>{
 const c=scenario();c.arrive();const old=c.step('mara','talk:settle').head.history.at(-1)!;c.collect();c.step('mara','talk:return-bag');const map=new Map<string,string>(),cache={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},removeItem:(k:string)=>{map.delete(k)}};
 rememberReply(cache,c.save,old,'en');const read=restoreReading(cache,c.save,'mara','en')!;assert.match(read.entry.text[1],/Bring it back/);assert.equal(questProgress(c.save).toolbag,'returned');assert.ok(!availableTopics(c.save,'mara').some(t=>t.id==='settle'));cache.setItem(readingKey(c.save.id,'mara'),JSON.stringify({...read.cursor,finished:true}));assert.equal(restoreReading(cache,c.save,'mara','en'),null);
});
test('late pre-handover AI response cannot overwrite a newer completed handover',async()=>{
 let release!:(r:any)=>void,started!:()=>void;const waiting=new Promise<void>(r=>started=r),answer=new Promise<any>(r=>release=r);
 const store=openAsyncSqliteAuthorityStore({worldId:'qa-late',gameId:'qa-late'}),auth=new AsyncSessionAuthority(store,createRuntime(async()=>{started();return answer}));
 try{let s:Save=await auth.create('qa-owner',randomUUID(),'en');for(const [target,verb]of [['mara','introduce'],['mara','talk:key'],['to-home','travel'],['bed','unpack'],['exit','travel'],['to-cafe','travel'],['theo','introduce'],['theo','talk:bag'],['exit','travel']])s=(await auth.action('qa-owner',s.id,intent(s,target,verb))).head;
  const pending=auth.action('qa-owner',s.id,intent(s,'mara','ask',{text:'What do you need?'}));await waiting;
  const returned=await auth.action('qa-owner',s.id,intent(s,'mara','talk:return-bag'));release({topic:null,reply:['请把袋子交给我','Please hand over my bag']});await assert.rejects(pending,/VERSION_CONFLICT/);assert.deepEqual(await auth.get('qa-owner',s.id),returned.head);
 }finally{await store.close()}
});
