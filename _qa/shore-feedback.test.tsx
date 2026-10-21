import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {initial,applyAction,type Save,type Action} from '../src/story/state';
import {entityAt,worldWithFlags} from '../src/world/data';
import {createRuntime} from '../server/runtime';
import {basicRod,basicLure,claimFishingKit} from '../src/challenges/shore-fishing';
import {checkShore,waterAt,type ShoreCheck} from '../src/world/shore-water';
import {globalPoint,localPoint,clusters,COASTAL,traceZone} from '../src/candidate/continuity';
import {projectShorePreview,sampledShore} from '../src/world/shore-preview';
import {FishingKit,ShoreFishingAccess,shoreActionLabel,shoreReasons} from '../src/ui/ShoreFishingAccess';
// @ts-expect-error pinned local authority
import {AsyncSessionAuthority,openAsyncSqliteAuthorityStore} from '../vendor/dynamic-runtime/packages/authority-session/async.mjs';

const command=(s:Save,action:string,payload?:unknown,target=s.turnBattle?.id??'fishing-kit'):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:s.position,target,action,payload});
const run=(s:Save,a:string,p?:unknown,target?:string)=>applyAction(s,command(s,a,p,target)).head;
function paused(){let s:Save={...initial('en',randomUUID()),scene:'gym',position:entityAt('gym','idris')!.approach,known:['idris'],flags:['key','unpacked']};s=run(s,'battle-start',{encounter:'training'},'idris');s=run(s,'battle-move',{round:0,move:'guard'});return run(s,'battle-pause')}

test('paused bout: free gear is authority committed, replayed once and reopened without ending or changing the bout',async()=>{
 const template=paused(),runtime=createRuntime(),dir=mkdtempSync('/tmp/harbor-shore-feedback-'),config={path:join(dir,'synthetic.sqlite'),worldId:'shore-feedback-only',gameId:'shore-feedback-only'},owner='synthetic-only';
 let store=openAsyncSqliteAuthorityStore(config),authority=new AsyncSessionAuthority(store,{...runtime,initial:(_l:unknown,id:string)=>({...structuredClone(template),id,version:0,cursor:0})});
 try{let s:Save=await authority.create(owner,randomUUID(),'en');const before=structuredClone(s),claim=command(s,'fishing-kit:claim'),receipt=await authority.action(owner,s.id,claim);assert.deepEqual(await authority.action(owner,s.id,claim),receipt);s=receipt.head;assert.equal(s.items[basicRod],1);assert.equal(s.items[basicLure],1);assert.deepEqual(s.turnBattle,before.turnBattle);for(const k of ['cash','energy','townMinutes','flags','relations','standing']as const)assert.deepEqual(s[k],before[k]);runtime.assertReadable(s);
 s=(await authority.action(owner,s.id,command(s,'fishing-kit:claim'))).head;assert.equal(s.items[basicRod],1);assert.equal(s.items[basicLure],1);assert.deepEqual(s.turnBattle,before.turnBattle);
 await store.close();store=openAsyncSqliteAuthorityStore(config);authority=new AsyncSessionAuthority(store,runtime);assert.deepEqual(await authority.get(owner,s.id),s);
 // Rejected fishing is an explicit early refusal; no invalid combined save is committed.
 const snapshot=structuredClone(s);await assert.rejects(authority.action(owner,s.id,command(s,'fishing:start',{cast:{x:300,y:506}},'shore-water')),/FISHING_PRACTICE_PAUSED/);assert.deepEqual(await authority.get(owner,s.id),snapshot);
 const invalid=structuredClone(s);invalid.activeChallenge={id:randomUUID(),scene:s.scene,kind:'fishing'};assert.throws(()=>runtime.assertReadable(invalid),/UNSUPPORTED_SAVE/);
 s=(await authority.action(owner,s.id,command(s,'battle-resume'))).head;assert.equal(s.turnBattle!.phase,'active');assert.equal(s.items[basicRod],1);assert.equal(s.items[basicLure],1);assert.deepEqual(s.turnBattle!.bout,before.turnBattle!.bout);
 }finally{await store.close()}
});

test('free kit remains unavailable during an active bout or challenge; paused legacy borrowing stays refused',()=>{
 const s=paused(),active=run(s,'battle-resume');assert.throws(()=>claimFishingKit(active),/CHALLENGE_ACTIVE/);const challenge={...initial('en',randomUUID()),activeChallenge:{id:randomUUID(),scene:'dock',kind:'fishing' as const}};assert.throws(()=>claimFishingKit(challenge),/CHALLENGE_ACTIVE/);const byRuth={...s,scene:'dock',position:entityAt('dock','ruth')!.approach};assert.throws(()=>run(byRuth,'challenge-start:fishing',undefined,'ruth'),/BATTLE_EXISTS/);
});

test('English/Chinese paused UI enables free claim but disables casting and explains the existing user-controlled bout exit',()=>{
 const s=paused(),shore:ShoreCheck={ok:true,target:{at:{x:300,y:506},water:'saltwater',zone:'dock',distance:48}};
 for(const locale of ['en','zh']as const){const html=renderToStaticMarkup(<ShoreFishingAccess save={s} locale={locale} busy={false} shore={shore} onClaim={()=>{}} onCast={()=>{}} onPractice={()=>{}} onPreview={()=>{}}/>);assert.match(html,/<button[^>]*data-shore-cast="true"[^>]*disabled=""/);assert.match(html,/<button[^>]*data-preview-shore="true"/);const kit=renderToStaticMarkup(<FishingKit save={s} locale={locale} busy={false} onClaim={()=>{}} onPractice={()=>{}}/>);assert.doesNotMatch(kit,/<button[^>]*disabled/);assert.match(kit,locale==='en'?/keep it and fish later/:/保留练习，稍后再钓/);assert.match(kit,locale==='en'?/View paused bout/:/查看暂停对练/)}
 const equipped=structuredClone(s);claimFishingKit(equipped);const pausedUI=renderToStaticMarkup(<ShoreFishingAccess save={equipped} locale="en" busy={false} shore={shore} onClaim={()=>{}} onCast={()=>{}}/>);assert.match(pausedUI,/<button[^>]*data-shore-cast="true"[^>]*disabled=""/);delete equipped.turnBattle;const readyUI=renderToStaticMarkup(<ShoreFishingAccess save={equipped} locale="en" busy={false} shore={shore} onClaim={()=>{}} onCast={()=>{}}/>);assert.doesNotMatch(readyUI,/<button[^>]*data-shore-cast="true"[^>]*disabled/);
 const blocked:ShoreCheck={ok:false,reason:'CAST_BLOCKED'},html=renderToStaticMarkup(<ShoreFishingAccess save={initial('en',randomUUID())} locale="en" busy={false} shore={blocked} onClaim={()=>{}} onCast={()=>{}} onPreview={()=>{}}/>);assert.doesNotMatch(html,/data-preview-shore/);assert.match(html,/line is blocked/);
 for(const reason of ['NO_WATER','WATER_TOO_FAR','CAST_BLOCKED','INVALID_STANDING']as const){assert.ok(shoreActionLabel({ok:false,reason})[0]);assert.ok(shoreReasons[reason][1])}
});

test('loading/new journey/scene never reuses a stale shore sample',()=>{
 const empty={ok:false,reason:'WATER_TOO_FAR'},sample={journey:'A',scene:'dock',standing:{x:340,y:500},value:{ok:false,reason:'CAST_BLOCKED'}as ShoreCheck};
 assert.deepEqual(sampledShore(null,null),empty);assert.deepEqual(sampledShore(sample,null),empty);assert.deepEqual(sampledShore(sample,{id:'B',scene:'dock'}),empty);assert.deepEqual(sampledShore(sample,{id:'A',scene:'beach'}),empty);assert.equal(sampledShore(sample,{id:'A',scene:'dock'}),sample.value);
});

test('preview projects the authority-selected water point with the current camera, hides stale samples and survives logical seam coordinate changes',()=>{
 const world=worldWithFlags([]);for(const [scene,standing]of [['dock',{x:340,y:500}],['harbor',{x:780,y:870}],['coast',{x:100,y:100}],['beach',{x:500,y:590}],['path',{x:410,y:170}]]as const){const shore=checkShore(scene,standing,world);assert.ok(shore.ok);assert.ok(waterAt(scene,shore.target.at));const camera={x:111,y:234,scale:1.25},project=(p:{x:number;y:number})=>{const g=globalPoint(scene,p);return{x:g.x*camera.scale-camera.x,y:g.y*camera.scale-camera.y}},preview={scene,standing,target:shore.target.at};assert.deepEqual(projectShorePreview(preview,scene,standing,project),project(shore.target.at));assert.equal(projectShorePreview(preview,'station',standing,project),null);assert.equal(projectShorePreview(preview,scene,{x:standing.x+25,y:standing.y},project),null);assert.equal(projectShorePreview(preview,scene,standing,()=>({x:NaN,y:0})),null)}
 // At each authored seam, both logical-local frames must describe one identical visual point.
 for(const seam of clusters[COASTAL].seams){const [from,to]=seam.zones,a=seam.gates[from],b=seam.gates[to];assert.equal(traceZone(from,a,[b]),to);const target={x:(a.x+b.x)/2,y:(a.y+b.y)/2},camera=(p:{x:number;y:number})=>({x:p.x*.8-17,y:p.y*.8-33});const screen=(scene:string)=>projectShorePreview({scene,standing:localPoint(scene,a),target:localPoint(scene,target)},scene,localPoint(scene,a),p=>camera(globalPoint(scene,p)));assert.deepEqual(screen(from),screen(to))}
});
