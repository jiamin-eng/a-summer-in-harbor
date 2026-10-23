import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {SceneStartupDetails} from '../src/ui/SceneStartupDetails';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {beginSceneStartup,readSceneStartup,sceneAssetDeadline,startupCode,type StartupTimers} from '../src/world/scene-startup';
function clock(){let next=0;const tasks=new Map<number,()=>void>();return {tasks,api:{set(fn:()=>void){tasks.set(++next,fn);return next},clear(id:unknown){tasks.delete(id as number)}} satisfies StartupTimers,tick(){for(const fn of [...tasks.values()])fn()}}}
const turn=()=>Promise.resolve();
test('startup diagnostic classifies without retaining exception text, URL, identities or getters',()=>{
 const secret='test-only-sensitive-marker';const a=beginSceneStartup();a.phase('renderer');a.fail(Error('private '+secret+' https://example.test/?token='+secret));
 assert.deepEqual(readSceneStartup(),{schema:'scene-start-v1',status:'failed',stage:'renderer',code:'RENDERER_FAILED',textureLoader:'main-thread',evalMode:'static-polyfills'});
 assert.ok(!JSON.stringify(readSceneStartup()).includes(secret));
 assert.equal(startupCode(Error('Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.'),'renderer'),'RENDERER_EVAL_UNAVAILABLE');
 assert.equal(startupCode(Error('MAP_LOAD_TIMEOUT'),'map'),'MAP_LOAD_TIMEOUT');
 const foreign=Object.defineProperty({},'message',{get(){throw Error(secret)}});assert.equal(startupCode(foreign,'scene-assets'),'SCENE_ASSET_FAILED');
 const copy=readSceneStartup()!;copy.code='NONE';assert.equal(readSceneStartup()?.code,'RENDERER_FAILED');
});
test('retired scene cannot fail or ready a newer attempt, and failed attempt cannot become ready',()=>{
 const old=beginSceneStartup(),current=beginSceneStartup();assert.equal(old.fail(Error('MAP_LOAD_TIMEOUT')),undefined);assert.equal(old.ready(),false);old.cancel();assert.equal(readSceneStartup()?.status,'loading');
 current.phase('map');assert.equal(current.fail(Error('MAP_LOAD_TIMEOUT')),'MAP_LOAD_TIMEOUT');assert.equal(current.signal.aborted,true);assert.equal(current.ready(),false);assert.equal(readSceneStartup()?.status,'failed');
});
test('asset timeout stays failed after late resolve and consumes the retired task',async()=>{
 const c=clock(),a=beginSceneStartup();let done!:(v:string)=>void,completed=false;const p=sceneAssetDeadline(()=>new Promise<string>(r=>done=r),a.signal,18,c.api);await turn();const rejected=assert.rejects(p,/SCENE_ASSET_TIMEOUT/);c.tick();await rejected;
 assert.equal(a.fail(Error('SCENE_ASSET_TIMEOUT')),'SCENE_ASSET_TIMEOUT');done('late');await turn();if(!a.signal.aborted)completed=true;assert.equal(completed,false);assert.equal(readSceneStartup()?.status,'failed');assert.equal(c.tasks.size,0);
});
test('late rejection is handled after deadline without changing the visible error',async()=>{
 const c=clock(),a=beginSceneStartup();let reject!:(e:unknown)=>void;const p=sceneAssetDeadline(()=>new Promise((_,r)=>reject=r),a.signal,18,c.api);await turn();const rejected=assert.rejects(p,/SCENE_ASSET_TIMEOUT/);c.tick();await rejected;a.fail('SCENE_ASSET_TIMEOUT');reject(Error('private late error'));await turn();assert.equal(readSceneStartup()?.code,'SCENE_ASSET_TIMEOUT');
});
test('cancel before work begins neither starts work nor leaves a timer',async()=>{
 const c=clock(),a=beginSceneStartup();let calls=0;const p=sceneAssetDeadline(async()=>{calls++},a.signal,18,c.api);const rejected=assert.rejects(p,/SCENE_START_CANCELLED/);a.cancel();await rejected;assert.equal(calls,0);assert.equal(c.tasks.size,0);assert.equal(readSceneStartup()?.status,'cancelled');
});
test('completed assets preserve their value, clear deadline, and ready remains ready on disposal',async()=>{
 const c=clock(),a=beginSceneStartup();assert.equal(await sceneAssetDeadline(async()=>42,a.signal,18,c.api),42);assert.equal(c.tasks.size,0);a.phase('renderer');assert.equal(a.ready(),true);a.cancel();assert.equal(readSceneStartup()?.status,'ready');
});
test('resource rejection remains resource failure, without succeeding or retrying in background',async()=>{
 const c=clock(),a=beginSceneStartup();let calls=0;await assert.rejects(sceneAssetDeadline(async()=>{calls++;throw Error('private URL')},a.signal,18,c.api),/private URL/);a.fail(Error('private URL'));assert.equal(calls,1);assert.equal(readSceneStartup()?.code,'SCENE_ASSET_FAILED');assert.equal(c.tasks.size,0);
});

test('visible failure details retain only the current sanitized codes in both languages',()=>{
 const a=beginSceneStartup();a.phase('renderer');a.fail(Error('Current environment does not allow unsafe-eval private-value'));
 for(const locale of ['zh','en'] as const){const html=renderToStaticMarkup(createElement(SceneStartupDetails,{locale}));assert.match(html,/RENDERER_EVAL_UNAVAILABLE/);assert.match(html,/scene-start-v1/);assert.ok(!html.includes('private-value'));assert.ok(!html.includes('token='));assert.match(html,locale==='zh'?/启动详情/:/Startup details/)}
});

test('asset timeout offers explicit page reload rather than pretending cached pending textures recovered',()=>{
 const a=beginSceneStartup();a.fail(Error('SCENE_ASSET_TIMEOUT'));const html=renderToStaticMarkup(createElement(SceneStartupDetails,{locale:'en'}));assert.match(html,/Reload game/);assert.match(html,/SCENE_ASSET_TIMEOUT/);assert.equal(readSceneStartup()?.status,'failed');
});
