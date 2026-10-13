import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createHarborLife} from '../server/life-assembly';
import {createRuntime} from '../server/runtime';
import {sampleAnimal} from '../server/animal-life';
import {AnimalContentRegistry} from '../server/animal-content';
import {initial,type Action} from '../src/story/state';
import {rooms,people} from '../src/world/data';
import {acceptedAnimals} from '../src/animals/art';
import {currentAnimalSample} from '../src/animal-life/presentation';
import {AnimalInteraction} from '../src/ui/AnimalNotebook';
import {lifeSnapshotKey,lifeViewMatchesHead} from '../src/life/snapshot';
import type {AnimalLifeSave,AnimalCommand} from '../src/animal-life/types';
let modelCalls=0;
const assembled=createHarborLife(createRuntime(async()=>{modelCalls++;throw Error('MODEL_FORBIDDEN')}));
const placed=():AnimalLifeSave=>({...initial('en',randomUUID()),scene:'station',townMinutes:540,position:{x:750,y:680},visited:Object.keys(rooms),known:['mara','ruth'],flags:['key','unpacked','route-open'],items:{key:1}});
const command=(s:AnimalLifeSave,target:string,c:AnimalCommand,position=s.position):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position,target,action:'animal-life:'+c.verb,payload:{command:c},...(target.startsWith('person-')?{actorPosition:rooms[s.scene].entities.find(e=>e.id===target)!.at}:{})});
function point(s:AnimalLifeSave){for(let y=680;y<=840;y+=4)for(let x=720;x<=840;x+=4){const p={x,y};try{assembled.runtime.position(s,p);sampleAnimal(s,'harbor-cat-1',p);return p}catch{}}throw Error('OBSERVATION_FIXTURE_UNAVAILABLE')}
const sample=async(s:AnimalLifeSave)=>(await assembled.runtime.prepare(s,command(s,'harbor-cat-1',{verb:'sample'},point(s)))).head;

test('formal public life factory exposes both pinned crops and existing seven animals; closed starts preserve reads',()=>{
 const s=placed(),before=structuredClone(s),view=assembled.lifeProject(s);
 assert.equal(Object.keys(people).length,23);assert.equal(acceptedAnimals.length,7);
 assert.equal(view.plants!.ref.revision,2);assert.equal(view.animals.commissions.length,2);
 assert.equal(createHarborLife(createRuntime(),false).lifeProject(s).plants!.newStarts,false);
 assert.deepEqual(s,before);assert.equal(modelCalls,0);
});
test('sample proof remains tied to actual player point; checkpoint-style movement suppresses projected/UI record without renewing proof',async()=>{
 const s=await sample(placed()),before=structuredClone(s),q=s.animalNotebookV1!.sample!;
 assert.ok(currentAnimalSample(s));assert.ok(assembled.lifeProject(s).animals.sample);
 const moved={...s,position:{x:s.position.x+8,y:s.position.y}};
 assembled.runtime.assertReadable(moved);assert.equal(assembled.lifeProject(moved).animals.sample,null);
 assert.equal(currentAnimalSample(s,q,moved.position),undefined);
 const markup=renderToStaticMarkup(createElement(AnimalInteraction,{save:s,view:assembled.lifeProject(s).animals,target:{id:'harbor-cat-1',kind:'prop',at:q.frame.foot,approach:s.position,label:['猫','Cat'],animalId:'harbor-cat-1'} as any,locale:'en',busy:false,ready:true,playerPosition:moved.position,onCommand:()=>{}}));
 assert.match(markup,/Watch quietly/);assert.doesNotMatch(markup,/Record this observation/);
 await assert.rejects(assembled.runtime.prepare(moved,command(moved,'harbor-cat-1',{verb:'record'})),/OBSERVATION_STALE/);
 assert.deepEqual(s,before);assert.equal(moved.animalNotebookV1!.sample!.sourceAction,q.sourceAction);
});
test('known residents and notebook accept/cancel change guarded projection; same stamps from another journey cannot reuse it',async()=>{
 let s=placed();const unknown={...s,known:[]};assert.equal(assembled.lifeProject(unknown).animals.commissions.length,0);
 assert.notEqual(lifeSnapshotKey(s),lifeSnapshotKey(unknown));
 const ref=new AnimalContentRegistry().ref('animals:station-cat'),m=rooms.station.entities.find(e=>e.person==='mara')!;
 s=(await assembled.runtime.prepare(s,command(s,m.id,{verb:'brief',ref},m.approach))).head;
 const briefKey=lifeSnapshotKey(s),briefView=assembled.lifeProject(s);
 s=(await assembled.runtime.prepare(s,command(s,m.id,{verb:'accept',ref},m.approach))).head;
 assert.notEqual(lifeSnapshotKey(s),briefKey);assert.equal(lifeViewMatchesHead(s,briefView),false);
 assert.equal(assembled.lifeProject(s).animals.commissions.find(e=>e.ref.id===ref.id)!.active,true);
 const accepted=structuredClone(s),oldView=assembled.lifeProject(s);
 s=(await assembled.runtime.prepare(s,command(s,'animal-notebook',{verb:'cancel',ref}))).head;
 assert.equal(assembled.lifeProject(s).animals.commissions.find(e=>e.ref.id===ref.id)!.active,false);
 assert.equal(lifeViewMatchesHead(s,oldView),false);assert.deepEqual(s.items,accepted.items);
 const view=assembled.lifeProject(s);assert.ok(lifeViewMatchesHead(s,view));
 assert.equal(lifeViewMatchesHead(s,{...view,animals:{...view.animals,snapshotVersion:s.version-1}}),false);
 assert.notEqual(lifeSnapshotKey(s),lifeSnapshotKey({...s,id:randomUUID()}));
 const staleKnownMarkup=renderToStaticMarkup(createElement(AnimalInteraction,{save:{...s,known:[]},view:view.animals,target:m,locale:'en',busy:false,ready:true,onCommand:()=>{}}));
 assert.doesNotMatch(staleKnownMarkup,/Ask about animal routines|Share observations/);
});
test('an ordinary action clears a sampled observation; town minute, version, scene changes reject the old proof',async()=>{
 const s=await sample({...placed(),known:[]}),before=structuredClone(s),m=rooms.station.entities.find(e=>e.person==='mara')!;
 const a:Action={action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:m.approach,target:m.id,actorPosition:m.at,action:'introduce'};
 const next=(await assembled.runtime.prepare(s,a)).head;assert.equal(next.animalNotebookV1!.sample,undefined);
 for(const changed of [{...s,version:s.version+1},{...s,townMinutes:541},{...s,scene:'courtyard'}])assert.equal(currentAnimalSample(changed),undefined);
 assert.deepEqual(s,before);assert.equal(modelCalls,0);
});
