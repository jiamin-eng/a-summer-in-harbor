import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {initial,type Action,type Save} from '../src/story/state';
import {entityAt,rooms} from '../src/world/data';
import {createRuntime} from '../server/runtime';
import {assertOwnedFernReadable,moveOwnedFern,OWNED_FERN_POT,OWNED_FERN_RULES,type OwnedFernSave,type FernLocation} from '../src/life/owned-fern-kernel';
// @ts-expect-error frozen asynchronous authority adapter
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

const roomPoint=entityAt('home','bed')!.approach;
const gate={kind:'fixture-room-admission',scene:'home',slot:OWNED_FERN_POT} as const;
function fixture(id:string=randomUUID(),locale:'en'|'zh'='en'):OwnedFernSave{
 const sourceAction=randomUUID(),s:OwnedFernSave={...initial(locale,id),scene:'home',position:{...roomPoint},visited:['station','home'],flags:['key','unpacked'],townMinutes:540};
 s.ownedFernV1={schema:1,rules:OWNED_FERN_RULES,source:{kind:'fixture-only',actionId:sourceAction,minute:540},instance:{id:'fern:'+sourceAction,species:'fern',ownerJourney:id,acquiredMinute:540,ageMinutesAtGrant:75,location:'bag',moveCount:0}};
 return s;
}
function command(s:OwnedFernSave,to:FernLocation):Action{return {action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{...s.position},target:to==='bag'?'qa-fern-bag':'qa-fern-pot',action:'qa:owned-fern-move'};}
/** The fixture host is deliberately private to tests; public.ts never imports it. */
function fixtureHost(){
 const base=createRuntime();
 const host={...base,
  initial:(locale:'en'|'zh',id:string)=>fixture(id,locale),
  assertReadable(s:OwnedFernSave){base.assertReadable(s);assertOwnedFernReadable(s)},
  validateAction(a:Action){base.validateAction(a);if(a.action==='qa:owned-fern-move'&&(a.payload!==undefined||!['qa-fern-bag','qa-fern-pot'].includes(a.target)))throw Error('INVALID_FERN_MOVE')},
  async prepare(s:OwnedFernSave,a:Action,cancel?:unknown,context?:{owner:string}){
   host.assertReadable(s);host.validateAction(a);
   if(a.action!=='qa:owned-fern-move'){const r=await base.prepare(s,a,cancel,context);host.assertReadable(r.head);return r}
   if(a.scene!==s.scene||Math.hypot(a.position.x-s.position.x,a.position.y-s.position.y)>4)throw Error('FERN_SCENE_OR_POSITION');
   base.position(s,a.position);
   const to=a.target==='qa-fern-pot'?OWNED_FERN_POT:'bag';
   const next=moveOwnedFern(s,{actionId:a.action_id,expectedVersion:a.expected_version,to},gate);
   next.version=s.version+1;next.cursor=s.cursor+1;next.position={...a.position};
   const text:[string,string]=to===OWNED_FERN_POT?['本地夹具：盆株入位。','Local fixture: placed.']:['本地夹具：盆株收回。','Local fixture: removed.'];
   next.history.push({id:a.action_id,kind:'action',text});host.assertReadable(next);
   return {head:next,text,kind:a.action,accepted:true,actionId:a.action};
  },
 };
 return host;
}

test('fixture-only fern has one owner and one holder; moving is immutable and preserves source and age',async()=>{
 const host=fixtureHost(),start=fixture(),frozen=structuredClone(start);
 host.assertReadable(start);const placed=(await host.prepare(start,command(start,OWNED_FERN_POT))).head as OwnedFernSave;
 assert.deepEqual(start,frozen);assert.equal(placed.ownedFernV1!.instance.location,OWNED_FERN_POT);
 assert.deepEqual(placed.ownedFernV1!.source,start.ownedFernV1!.source);
 assert.equal(placed.ownedFernV1!.instance.id,start.ownedFernV1!.instance.id);
 assert.equal(placed.ownedFernV1!.instance.ageMinutesAtGrant,75);
 assert.equal(placed.items['fern'],undefined);assert.equal(placed.energy,start.energy);assert.equal(placed.townMinutes,start.townMinutes);
 const removed=(await host.prepare(placed,command(placed,'bag'))).head as OwnedFernSave;
 assert.deepEqual([removed.ownedFernV1!.instance.location,removed.ownedFernV1!.instance.moveCount],['bag',2]);
 assert.equal(removed.ownedFernV1!.instance.id,placed.ownedFernV1!.instance.id);
 assert.equal(removed.ownedFernV1!.instance.ownerJourney,start.id);
});

test('bad provenance, wrong journey, forged location and impossible move history fail closed',()=>{
 const host=fixtureHost(),start=fixture();assertOwnedFernReadable(start);
 for(const mutate of [
  (s:OwnedFernSave)=>{s.ownedFernV1!.rules='new-rule' as any},
  (s:OwnedFernSave)=>{s.ownedFernV1!.source.kind='public-fern' as any},
  (s:OwnedFernSave)=>{s.ownedFernV1!.source.minute=999},
  (s:OwnedFernSave)=>{s.ownedFernV1!.instance.id='another-fern'},
  (s:OwnedFernSave)=>{s.ownedFernV1!.instance.ownerJourney='other-journey'},
  (s:OwnedFernSave)=>{s.ownedFernV1!.instance.location=OWNED_FERN_POT},
  (s:OwnedFernSave)=>{s.ownedFernV1!.instance.moveCount=1},
  (s:OwnedFernSave)=>{(s.ownedFernV1 as any).secondInstance={id:'copy'}},
  (s:OwnedFernSave)=>{s.ownedFernV1!.instance.ageMinutesAtGrant=-1},
 ]){
  const bad=structuredClone(start);mutate(bad);assert.throws(()=>host.assertReadable(bad),/UNSUPPORTED_OWNED_FERN_SAVE/);
 }
 host.assertReadable(initial('en',randomUUID()));
});

test('room access, active challenge, missing trusted slot, same location and stale version reject without changing save',()=>{
 const start=fixture(),attempt=(s:OwnedFernSave,to:FernLocation,gateValue=gate,version=s.version)=>moveOwnedFern(s,{actionId:randomUUID(),expectedVersion:version,to},gateValue),check=(s:OwnedFernSave,re:RegExp,to:FernLocation=OWNED_FERN_POT,gateValue=gate,version=s.version)=>{const frozen=structuredClone(s);assert.throws(()=>attempt(s,to,gateValue,version),re);assert.deepEqual(s,frozen)};
 check({...start,scene:'garden'},/FERN_ROOM_ACCESS/);
 check({...start,flags:['key']},/FERN_ROOM_ACCESS/);
 check({...start,visited:['station']},/FERN_ROOM_ACCESS/);
 check({...start,activeChallenge:{id:'x',kind:'turn',scene:'home'}},/CHALLENGE_ACTIVE/);
 check(start,/FERN_ADMISSION_REQUIRED/,OWNED_FERN_POT,{...gate,slot:'wrong' as any});
 check(start,/FERN_ALREADY_THERE/,'bag');
 check(start,/VERSION_CONFLICT/,OWNED_FERN_POT,gate,start.version+1);
 check({...start,movingClock:{transport:{} as any} as any},/MOTION_CHECKPOINT_REQUIRED/);
});

test('old published runtime keeps optional fixture root through ordinary rest; no read creates a gift',async()=>{
 const old=createRuntime(),absent=initial('en',randomUUID()),plain=JSON.stringify(absent);
 for(let i=0;i<3;i++)old.assertReadable(absent);assert.equal(JSON.stringify(absent),plain);assert.equal((absent as OwnedFernSave).ownedFernV1,undefined);
 const s=fixture(),frozen=JSON.stringify(s.ownedFernV1);old.assertReadable(s);
 const next=(await old.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:'home',position:{...roomPoint},target:'bed',action:'rest'})).head as OwnedFernSave;
 assert.equal(JSON.stringify(next.ownedFernV1),frozen);assertOwnedFernReadable(next);
 assert.equal(rooms.home.props.find(p=>p.id==='fern')?.art,'flora-pot-rubber-v1');
 assert.equal(entityAt('garden','growing-fern')?.id,'growing-fern');
});

test('existing authority atomically commits one move, replays receipt, rolls back fault and isolates owner after restart',async()=>{
 const dir=mkdtempSync('/tmp/harbor-owned-fern-'),config={path:join(dir,'authority.sqlite'),worldId:'owned-fern-fixture',gameId:'owned-fern-fixture'};
 const host=fixtureHost(),A='a'.repeat(64),B='b'.repeat(64);let store=openAsyncSqliteAuthorityStore(config),authority=new AsyncSessionAuthority(store,host);
 try{
  let s:OwnedFernSave=await authority.create(A,randomUUID(),'en');const a=command(s,OWNED_FERN_POT),other={...a,action_id:randomUUID()},before=structuredClone(s);
  const fault={...store,transaction:(work:any)=>store.transaction((repo:any)=>work({...repo,addReceipt:async()=>{throw Error('INJECTED_RECEIPT_FAILURE')}}))};
  await assert.rejects(new AsyncSessionAuthority(fault,host).action(A,s.id,a),/INJECTED_RECEIPT_FAILURE/);
  assert.deepEqual(await authority.get(A,s.id),before);
  const race=await Promise.allSettled([authority.action(A,s.id,a),authority.action(A,s.id,other)]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);const winner=race[0].status==='fulfilled'?a:other;
  s=await authority.get(A,s.id);assert.equal(s.ownedFernV1!.instance.moveCount,1);assert.equal(s.ownedFernV1!.instance.location,OWNED_FERN_POT);
  const replay=await authority.action(A,s.id,winner);assert.deepEqual(replay.head,s);assert.deepEqual(await authority.get(A,s.id),s);
  await assert.rejects(authority.action(A,s.id,{...winner,target:'qa-fern-bag'}));
  await assert.rejects(authority.action(A,s.id,command(s,OWNED_FERN_POT)),/FERN_ALREADY_THERE/);
  await assert.rejects(authority.get(B,s.id),/SESSION_NOT_FOUND/);
  await store.close();store=openAsyncSqliteAuthorityStore(config);authority=new AsyncSessionAuthority(store,host);
  assert.deepEqual(await authority.get(A,s.id),s);assert.deepEqual((await authority.action(A,s.id,winner)).head,s);
 }finally{await store.close();rmSync(dir,{recursive:true,force:true})}
});
