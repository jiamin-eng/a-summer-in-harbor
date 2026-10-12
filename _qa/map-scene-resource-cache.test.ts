import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneResourceCache} from '../src/engine/scene-resource-cache';

test('native floor resources are reused across 36 restores and released on dispose',()=>{
 const created:Record<string,number>={},destroyed:Record<string,number>={},detached:Record<string,number>={};
 const cache=createSceneResourceCache(scene=>{created[scene]=(created[scene]??0)+1;return{scene,reusable:['hill','station','harbor','coast-beach-path'].includes(scene),destroyed:false}},
  value=>{detached[value.scene]=(detached[value.scene]??0)+1},
  value=>{assert.equal(value.destroyed,false);value.destroyed=true;destroyed[value.scene]=(destroyed[value.scene]??0)+1},
  value=>!value.destroyed);
 const scenes=['hill','station','harbor','coast-beach-path','room','garden'];
 for(let round=0;round<6;round++)for(const scene of scenes)cache.enter(scene);
 assert.deepEqual(Object.fromEntries(scenes.slice(0,4).map(s=>[s,created[s]])),{hill:1,station:1,harbor:1,'coast-beach-path':1});
 assert.equal(created.room,6);assert.equal(created.garden,6);
 assert.deepEqual(cache.cachedScenes().sort(),['coast-beach-path','harbor','hill','room','station'].filter(s=>s!=='room').sort());
 cache.dispose();
 for(const scene of scenes)assert.equal(destroyed[scene],created[scene],scene+' must release every owned resource');
 assert.deepEqual(cache.cachedScenes(),[]);
 assert.equal(detached.hill,6);
});

test('an engine-destroyed cached scene is reconstructed without reusing dead nodes',()=>{
 const values:{reusable:boolean;destroyed:boolean}[]=[];
 const cache=createSceneResourceCache(()=>{const value={reusable:true,destroyed:false};values.push(value);return value},()=>{},value=>{value.destroyed=true},value=>!value.destroyed);
 const first=cache.enter('coast-beach-path');cache.leave();first.destroyed=true;
 const second=cache.enter('coast-beach-path');assert.notEqual(second,first);assert.equal(values.length,2);
 cache.dispose();assert.equal(second.destroyed,true);
});
