import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tapWindow,replayTap} from '../src/challenges/fishing-tap';
import {initial,applyAction,type Save,type Action} from '../src/story/state';
import {fishingInitial,fishingStep,recordFishing,type FishingRun} from '../src/challenges/fishing';
import {makeShoreEncounter,replayShore,validFishingMemory,pendingShoreResult,pendingLegacyResult} from '../src/challenges/shore-fishing';
import {fishItem} from '../src/challenges/fishing-catalog';
import {entityAt,worldWithFlags} from '../src/world/data';
import {checkShore} from '../src/world/shore-water';
import {createRuntime} from '../server/runtime';
import {FISHING_PROTOCOL,assertFishingStartAllowed} from '../src/fishing-release';
import {fishingClientContract} from '../server/fishing-client-contract';
// @ts-expect-error pinned existing authority module
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
const input=(tick:number|null,wait=tick??165)=>({hookTick:tick,waitTicks:wait,runs:[]});
const action=(s:Save,verb:string,payload?:unknown,target=s.activeChallenge?.id??'fishing-kit'):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target,action:verb,payload});
function start(){let s={...initial('en',randomUUID()),scene:'dock',position:{x:340,y:500}};s=applyAction(s,action(s,'fishing-kit:claim')).head;const shore=checkShore(s.scene,s.position,worldWithFlags(s.flags));assert.ok(shore.ok);return applyAction(s,action(s,'fishing:start',{cast:shore.target.at},'shore-water')).head}
function oldRuns(first=false){let s=fishingInitial();const runs:FishingRun[]=[];while(s.result==='playing'){const held=s.tension<.65;recordFishing(runs,held);s=fishingStep(s,held,first?'first':'regular')}assert.equal(s.result,'caught');return runs}
test('C has exactly one timing decision: early/missed escape, valid window catches, no synthetic reel accepted',()=>{
 const w=tapWindow();assert.equal(replayTap(w,input(44)).result,'escaped');assert.equal(replayTap(w,input(45)).result,'caught');assert.equal(replayTap(w,input(164)).result,'caught');assert.equal(replayTap(w,input(null)).result,'escaped');
 for(const x of [input(-1),input(165),input(null,45),input(45,46),{...input(45),runs:[{ticks:1,reel:true}]},input(45.5)])assert.throws(()=>replayTap(w,x),/INVALID_FISHING_TAP_INPUT/);
});
test('new shore uses C but immutable ticket, shoreline and old v1/v2 replay remain authoritative',()=>{
 const s=start(),e=s.activeChallenge!.fishing!;assert.equal(e.rules,'shore-fishing-c-v1');assert.equal(validFishingMemory(s),true);assert.equal(replayShore(e,input(45)).result,'caught');
 for(const rules of ['shore-fishing-v1','shore-fishing-v2'] as const){const legacy={...e,rules,species:'bay-silverside' as const};assert.throws(()=>replayShore(legacy,input(45)));assert.equal(replayShore(legacy,{...input(45),runs:oldRuns(e.first)}).result,'caught')}
 assert.throws(()=>makeShoreEncounter(s,{...action(s,'fishing:start'),payload:{cast:{x:1,y:1}}},worldWithFlags(s.flags)),/FISHING_/);
});
test('C paid bait, codex, energy and reward stay pending until once-only confirmation',async()=>{
 const dir=mkdtempSync('/tmp/harbor-tap-c-'),config={path:join(dir,'authority.sqlite'),worldId:'tap-c',gameId:'tap-c'},runtime=createRuntime();
 const adapter={...runtime,initial:(locale:any,id:string)=>({...initial(locale,id),scene:'dock',position:{x:340,y:500},items:{'bait-worm':2},fishingV2:{schema:1,selected:'bait-worm',cycles:{saltwater:0,stream:0},tickets:{},codex:{}}})};
 let store=openAsyncSqliteAuthorityStore(config),auth=new AsyncSessionAuthority(store,adapter);const owner='synthetic-tap-c';
 try{let s:Save=await auth.create(owner,randomUUID(),'en');const act=async(v:string,p?:unknown,t?:string)=>s=(await auth.action(owner,s.id,action(s,v,p,t))).head;
  await act('fishing-kit:claim');const shore=checkShore(s.scene,s.position,worldWithFlags(s.flags));assert.ok(shore.ok);await act('fishing:start',{cast:shore.target.at},'shore-water');const e=s.activeChallenge!.fishing!,id=s.activeChallenge!.id;
  await assert.rejects(auth.action(owner,s.id,action(s,'challenge-finish',{shore:input(45)})),/FISHING_CONFIRM_REQUIRED/);
  const reserve=action(s,'fishing:land',{shore:input(45)}),receipt=await auth.action(owner,s.id,reserve);s=receipt.head;assert.deepEqual(await auth.action(owner,s.id,reserve),receipt);assert.equal(s.items[fishItem(e.species)],undefined);assert.equal(s.items['bait-worm'],2);assert.equal(s.energy,100);runtime.assertReadable(s);
  await assert.rejects(auth.action(owner,s.id,action(s,'fishing:land',{shore:input(46)})),/FISHING_RESULT_LOCKED/);await assert.rejects(auth.action(owner,s.id,action(s,'challenge-finish',{withdraw:true})),/FISHING_RESULT_AWAITING_CONFIRMATION/);
  await store.close();store=openAsyncSqliteAuthorityStore(config);auth=new AsyncSessionAuthority(store,adapter);assert.deepEqual(await auth.get(owner,s.id),s);
  const confirm=action(s,'fishing:confirm'),confirmed=await auth.action(owner,s.id,confirm);s=confirmed.head;assert.deepEqual(await auth.action(owner,s.id,confirm),confirmed);assert.equal(s.items[fishItem(e.species)],1);assert.equal(s.items['bait-worm'],1);assert.equal(s.fishingV2!.codex[e.species]!.count,1);assert.equal(s.energy,98);assert.equal(s.activeChallenge,undefined);runtime.assertReadable(s);await assert.rejects(auth.action(owner,s.id,action(s,'fishing:confirm',undefined,id)),/CHALLENGE_MISMATCH/);
 }finally{await store.close()}
});
test('early and missed C results/cancellation do not consume bait or energy',()=>{
 for(const x of [input(1),input(null,225)]){let s=start();const before=structuredClone(s.items);s=applyAction(s,action(s,'fishing:land',{shore:x})).head;s=applyAction(s,action(s,'fishing:confirm')).head;assert.deepEqual(s.items,before);assert.equal(s.energy,100)}
 let s=start();s=applyAction(s,action(s,'fishing:withdraw')).head;assert.equal(s.activeChallenge,undefined);assert.equal(s.energy,100);
});
test('normal Ruth start uses C while retaining legacy generic fish and relationship contract',()=>{
 let s:Save={...initial('en',randomUUID()),scene:'dock',known:['ruth'],position:{...entityAt('dock','ruth')!.approach}};
 s=applyAction(s,action(s,'challenge-start:fishing',undefined,'ruth')).head;assert.ok(s.activeChallenge!.fishingTap);assert.equal(s.activeChallenge!.fishing,undefined);
 s=applyAction(s,action(s,'fishing:land',{shore:input(45)})).head;assert.equal(validFishingMemory(s),true);assert.equal(s.items.fish,undefined);s=applyAction(s,action(s,'fishing:confirm')).head;assert.equal(s.items.fish,1);assert.equal(s.relations.ruth,1);assert.equal(s.energy,98);assert.equal(s.fishingV2,undefined);
});
test('old pending v2 and Ruth catches remain readable and confirm with their original rewards',()=>{
 for(const legacy of [false,true]){let s=start();const a=s.activeChallenge!;if(legacy){delete a.fishing;a.fishingPending=pendingLegacyResult(oldRuns())}else{a.fishing!.rules='shore-fishing-v2';a.fishingPending=pendingShoreResult(a.fishing!,{...input(45),runs:oldRuns(a.fishing!.first)})}assert.equal(validFishingMemory(s),true);s=applyAction(s,action(s,'fishing:confirm')).head;assert.equal(s.energy,98);assert.equal(s.activeChallenge,undefined);assert.equal(legacy?s.items.fish:Object.values(s.fishingV2!.codex)[0]!.count,1)}
});
test('protocol4 rejects mixed old writes, refresh contract stays explicit and stop-new keeps confirm open',()=>{
 assert.equal(FISHING_PROTOCOL,'4');for(const version of ['2','3','4']){let status=0,body='';const handled=fishingClientContract({url:'/api/sessions/'+randomUUID()+'/action',method:'POST',headers:{'x-harbor-fishing':version}} as any,{writeHead:(n:number)=>status=n,end:(s:string)=>body=s} as any);assert.equal(handled,version!=='4');if(version!=='4'){assert.equal(status,409);assert.equal(JSON.parse(body).requiredFishingProtocol,'4')}}
 assert.throws(()=>assertFishingStartAllowed('fishing:start',false),/FISHING_NEW_STARTS_CLOSED/);assert.doesNotThrow(()=>assertFishingStartAllowed('fishing:confirm',false));
});
