import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createRuntime} from '../server/runtime';
import {configuredNews} from '../server/news/configured';
import {createPlantsRegistry,snapPeaV2Ref} from '../server/life-plants-b2';
import {createHarborLife} from '../server/life-assembly';
import {initial,type Action} from '../src/story/state';
import {rooms,people,entityAt} from '../src/world/data';
import {landEntity} from '../src/life/land';
import {techNomads} from '../src/world/tech-nomads';
import {acceptedAnimals} from '../src/animals/art';
import {GAME_UUID} from '../src/game-id';
import {lifePlotStatus} from '../src/life/rules';
// @ts-expect-error frozen authority
import {initializeAsyncAuthoritySchema,openPgAuthorityStore,AsyncSessionAuthority} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';
// @ts-expect-error frozen PG adapter
import {initializeCandidateSchema,registerCandidateWorld} from '../vendor/dynamic-runtime/packages/pg-candidate/index.mjs';

const raw=process.env.HARBOR_ACCOUNT_QA_PG_URL!;
const url=new URL(raw);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55439');assert.equal(url.pathname,'/harbor_account_qa_20261005');
const catalog='doc/qa/real-news-rechecked-20261006/catalog.json',clock=()=>Date.parse('2026-10-06T17:00:00Z');
let modelCalls=0;
const base=createRuntime(async()=>{modelCalls++;throw Error('MODEL_FORBIDDEN')});
const assembled=(starts=true)=>{const b2=createHarborLife(base,starts);return {...b2,...configuredNews(b2.runtime,catalog,clock)}};
function oldSeed(locale:any,id:string){
 const n=techNomads.find(n=>n.id==='harper')!,choice=n.story.choices[0].id;
 return {...configuredNews(base,catalog,clock).runtime.initial(locale,id),scene:'grocery',position:rooms.grocery.spawn,visited:Object.keys(rooms),known:['mara','harper',n.story.partner],
  flags:['key','unpacked','garden-agreed','alternative-route','talk:harper:nomads-v1-start',`talk:${n.story.partner}:nomads-v1-harper-consult`,n.story.id+':done','talk:harper:nomads-v1-'+choice],
  techNomadsV1:{schema:1,stories:{harper:{choice,completedAt:540}}},animalsV1:{schema:1,individuals:{'harbor-cat-1':{familiarity:2,lastPetMinute:540}}},
  relations:{mara:3,harper:1,elena:1},items:{key:1,'seed-radish':2},plots:{'crop-bed-2':{crop:'basil',grown:200,updatedAt:500,wetUntil:1220}}};
}
for(const locale of ['en','zh'])test('B2+22 actual existing PG '+locale+': persisted 341 memory, fixed public assembly, CAS crop loop, zero-write reads/replay/reopen',async()=>{
 const pool=new Pool({connectionString:raw,max:4}),schema='kit_b222_owner_qa_'+randomUUID().replaceAll('-','').slice(0,16),options={pool,schema,worldId:GAME_UUID,gameId:GAME_UUID,environment:'test'};let first:any,second:any;
 const fingerprint=async()=>{const tables=(await pool.query('select table_name from information_schema.tables where table_schema=$1 order by table_name',[schema])).rows;const result=[];for(const {table_name:t} of tables){assert.match(t,/^[a-z_]+$/);result.push({table:t,...(await pool.query(`select count(*)::int as count,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by md5(row_to_json(t)::text)),'')) as digest from "${schema}"."${t}" t`)).rows[0]})}return result};
 try{
  assert.deepEqual((await pool.query('select current_database() as db,current_user as role,inet_server_port() as port')).rows[0],{db:'harbor_account_qa_20261005',role:'harbor_qa',port:55439});
  const c=await pool.connect();try{await initializeCandidateSchema(c,options);await initializeAsyncAuthoritySchema(c,options);await registerCandidateWorld(c,options)}finally{c.release()}
  first=await openPgAuthorityStore(options);second=await openPgAuthorityStore(options);
  const legacy=new AsyncSessionAuthority(first,{...base,initial:oldSeed}),owner='synthetic-b222-'+locale;
  let s:any=await legacy.create(owner,randomUUID(),locale);const old=structuredClone(s);assert.equal(s.lifeV1,undefined);assert.equal(s.landV1,undefined);
  const a=assembled();let aa=new AsyncSessionAuthority(first,a.runtime),bb=new AsyncSessionAuthority(second,a.runtime);
  assert.equal(Object.keys(people).length,23);assert.equal(acceptedAnimals.length,7);
  const invariant=(h:any)=>({nomads:h.techNomadsV1,animals:h.animalsV1,news:h.newsEdition,relations:h.relations,known:h.known,flags:h.flags,oldPlots:h.plots});
  const unchanged=structuredClone(invariant(old));
  const before=await fingerprint();a.runtime.assertReadable(s);a.lifeProject(s);assert.throws(()=>a.landProject(s,new URLSearchParams({region:'courtyard-common',x:'288',y:'604'})),/LAND_SCENE/);a.newsProject!(s);assert.deepEqual(await bb.get(owner,s.id),old);assert.deepEqual(await fingerprint(),before);
  const action=(target:string,verb:string,command?:any,position=entityAt(s.scene,target)?.approach??s.position):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position,target,action:verb,...(command?{payload:{command}}:{})});
  const execute=async(cmd:Action)=>{const receipt=await aa.action(owner,s.id,cmd);s=await aa.get(owner,s.id);a.runtime.assertReadable(s);return receipt};
  const buy=action('crop-counter','life:buy-seed',{verb:'buy-seed',ref:snapPeaV2Ref}),other={...buy,action_id:randomUUID()};
  const race=await Promise.allSettled([aa.action(owner,s.id,buy),bb.action(owner,s.id,other)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected'&&/VERSION_CONFLICT/.test(String(r.reason))).length,1);
  const winner=race[0].status==='fulfilled'?buy:other;s=await aa.get(owner,s.id);assert.deepEqual([s.version,s.cash,s.items['life-seed:snap-pea']],[1,19,1]);const afterBuy=await fingerprint();await bb.action(owner,s.id,winner);assert.deepEqual(await fingerprint(),afterBuy);
  await execute(action('courtyard','travel-map'));const permit=landEntity('courtyard-common');await execute(action(permit.id,'life:permit-land',{verb:'permit-land',region:'courtyard-common'},permit.approach));
  const at={x:288,y:604},candidate=landEntity('courtyard-common',at);await execute(action(candidate.id,'life:cultivate',{verb:'cultivate',region:'courtyard-common',at},candidate.approach));
  const bedPosition={x:280,y:622};await execute(action('land-bed-1','life:plant',{verb:'plant',ref:snapPeaV2Ref,plot:'life-bed-1'},bedPosition));await execute(action('land-bed-1','life:water',{verb:'water',plot:'life-bed-1'},bedPosition));
  await execute(action('home','travel-map'));for(let i=0;i<4;i++)await execute(action('bed','rest'));await execute(action('courtyard','travel-map'));assert.equal(lifePlotStatus(s,'life-bed-1',createPlantsRegistry())!.ready,true);
  const harvest=action('land-bed-1','life:harvest',{verb:'harvest',plot:'life-bed-1'},bedPosition),harvest2={...harvest,action_id:randomUUID()};const harvestRace=await Promise.allSettled([aa.action(owner,s.id,harvest),bb.action(owner,s.id,harvest2)]);assert.equal(harvestRace.filter(r=>r.status==='fulfilled').length,1);s=await aa.get(owner,s.id);assert.equal(s.items['life-produce:snap-pea'],3);assert.equal(s.lifeV1.plots['life-bed-1'],undefined);
  const conversion=action('life-bag','life:save-seed',{verb:'save-seed',ref:snapPeaV2Ref});await execute(conversion);const record=structuredClone(s.lifeV1.collections['seed:crop:snap-pea']);assert.equal(record.ref.revision,2);
  await execute(action('home','travel-map'));await execute(action('bed','sleep'));await execute(action('grocery','travel-map'));for(let i=0;i<2;i++)await execute(action('crop-counter','life:sell',{verb:'sell',ref:snapPeaV2Ref}));assert.deepEqual([s.cash,s.items['life-produce:snap-pea'],s.items['life-seed:snap-pea']],[27,0,1]);assert.deepEqual(invariant(s),unchanged);
  await assert.rejects(bb.get('other-synthetic-owner',s.id),/SESSION_NOT_FOUND/);const final=structuredClone(s),rawBefore=await fingerprint();for(let i=0;i<3;i++){a.lifeProject(s);a.newsProject!(s);await bb.get(owner,s.id)}await bb.action(owner,s.id,conversion);assert.deepEqual(await fingerprint(),rawBefore);
  await first.close();first=await openPgAuthorityStore(options);aa=new AsyncSessionAuthority(first,assembled(false).runtime);assert.deepEqual(await aa.get(owner,s.id),final);await aa.action(owner,s.id,conversion);assert.deepEqual(await fingerprint(),rawBefore);
  const bad=action('crop-counter','life:buy-seed',{verb:'buy-seed',ref:snapPeaV2Ref});await assert.rejects(aa.action(owner,s.id,bad),/CONTENT_NOT_ENABLED/);assert.deepEqual(await aa.get(owner,s.id),final);assert.deepEqual(await fingerprint(),rawBefore);assert.deepEqual(s.lifeV1.collections['seed:crop:snap-pea'],record);assert.equal(modelCalls,0);
  console.log(JSON.stringify({locale,schema,version:s.version,actualExistingPG:true,nomadAnimalNewsUnchanged:true,rawTablesUnchangedOnReadReplayReject:true,modelCalls}));
 }finally{await first?.close();await second?.close();await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);assert.equal((await pool.query('select count(*)::int as n from information_schema.schemata where schema_name=$1',[schema])).rows[0].n,0);await pool.end()}
});
