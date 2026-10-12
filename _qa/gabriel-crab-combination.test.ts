import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initial,applyAction,type Action,type Save} from '../src/story/state';
import {rooms} from '../src/world/data';
import {relationshipStory} from '../src/story/relationships';
import {advanceNativeCrab,validNativeCrabField} from '../src/animals/native-crab-game';
import {runtime} from '../server/runtime';

const priest='gabriel';
const chapelEntity=rooms.chapel.entities.find(e=>e.person===priest)!;
const command=(s:Save,verb:string):Action=>({
 action_id:randomUUID(),expected_version:s.version,scene:s.scene,
 position:{...chapelEntity.approach},target:priest,action:verb,
});

test('a legacy chapel save is readable without a Gabriel field or save migration',()=>{
 const s={...initial('en','synthetic-legacy-'+randomUUID()),scene:'chapel',position:{...rooms.chapel.spawn},
  flags:['chapel:visited','chapel:notice-read','chapel:participation:reading','chapel:completed','chapel:meeting-clue'],
  known:['dani','samira'],visited:['station','hill','chapel']};
 const before=structuredClone(s);
 runtime.assertReadable(s);
 assert.equal(runtime.upgrade(s),s);
 assert.deepEqual(s,before);
});

test('Gabriel chair memory and one relationship point survive an adjacent crab minute and runtime read',()=>{
 let s:Save={...initial('en','synthetic-combined-'+randomUUID()),scene:'chapel',position:{...rooms.chapel.spawn},
  flags:['chapel:visited'],visited:['station','hill','chapel']};
 for(const verb of ['introduce','talk:priest-life','talk:priest-table','talk:priest-chair'])s=applyAction(s,command(s,verb)).head;
 assert.equal(relationshipStory(s).leads.find(l=>l.id==='priest-extra-chair')?.state,'done');
 const memory={flags:[...s.flags],known:[...s.known],relations:{...s.relations},history:structuredClone(s.history),cash:s.cash,items:structuredClone(s.items)};
 s.scene='coast';s.position={...rooms.coast.spawn};s.visited.push('coast');
 advanceNativeCrab(s,1.2,true);
 const before=structuredClone(s.nativeCrabV1?.frame);
 assert.ok(before);
 runtime.assertReadable(s);
 const nextMinute=(s.townMinutes??540)+1;
 s.townMinutes=nextMinute;
 advanceNativeCrab(s,0,true);
 assert.deepEqual(s.nativeCrabV1?.frame,before);
 assert.ok(validNativeCrabField(s.nativeCrabV1,s.version,nextMinute));
 runtime.assertReadable(s);
 assert.deepEqual({flags:s.flags,known:s.known,relations:s.relations,history:s.history,cash:s.cash,items:s.items},memory);
 assert.equal(relationshipStory(s).leads.find(l=>l.id==='priest-extra-chair')?.state,'done');
});
