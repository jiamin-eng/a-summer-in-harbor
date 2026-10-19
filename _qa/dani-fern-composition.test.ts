import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initial,applyAction,type Action} from '../src/story/state';
import {entityAt,rooms} from '../src/world/data';
import {createRuntime} from '../server/runtime';
import {relationshipStage} from '../src/story/relationship-growth';
import {assertOwnedFernReadable,moveOwnedFern,OWNED_FERN_POT,OWNED_FERN_RULES,type OwnedFernSave} from '../src/life/owned-fern-kernel';

// Synthetic coexistence only. This neither grants a player plant nor admits a
// real room slot. The two existing candidates retain their original rules.
function fixture():OwnedFernSave{
 const s:OwnedFernSave={...initial('en',randomUUID()),scene:'garden',position:{...entityAt('garden','dani')!.approach},flags:['key','unpacked','bag-returned'],visited:Object.keys(rooms)};
 const action=randomUUID();
 s.ownedFernV1={schema:1,rules:OWNED_FERN_RULES,source:{kind:'fixture-only',actionId:action,minute:540},instance:{id:'fern:'+action,species:'fern',ownerJourney:s.id,acquiredMinute:540,ageMinutesAtGrant:75,location:'bag',moveCount:0}};
 return s;
}
function step(s:OwnedFernSave,action:string,target='dani'):OwnedFernSave{
 return applyAction(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{...entityAt(s.scene,target)!.approach},target,action}).head as OwnedFernSave;
}

test('composed save preserves owned fixture through Dani observation and Dani evidence through fixture movement and ordinary rest',async()=>{
 let s=fixture();const fern=structuredClone(s.ownedFernV1);
 s=step(s,'introduce');s=step(s,'talk:rg-greet');s=step(s,'talk:rg-personal');
 s.townMinutes=1980;s=step(s,'talk:rg-greet');s=step(s,'talk:rg-request');
 s.townMinutes=2010;s=step(s,'relationship-observe:dani','growing-fern');
 assert.equal(relationshipStage(s,'dani'),'familiar');
 assert.ok(s.relationshipNextV1!.residents.dani.promise!.observedAt);
 assert.deepEqual(s.ownedFernV1,fern);
 assert.equal(s.fernStartedAt,undefined,'public fern was only observed');
 const dani=structuredClone(s.relationshipNextV1),items=structuredClone(s.items);
 s={...s,scene:'home',position:{...entityAt('home','bed')!.approach}};
 const before=structuredClone(s);
 const placed=moveOwnedFern(s,{actionId:randomUUID(),expectedVersion:s.version,to:OWNED_FERN_POT},{kind:'fixture-room-admission',scene:'home',slot:OWNED_FERN_POT});
 assert.deepEqual(s,before);
 assert.deepEqual(placed.relationshipNextV1,dani);
 assert.deepEqual(placed.items,items);
 const runtime=createRuntime();runtime.assertReadable(placed);assertOwnedFernReadable(placed);
 const next=(await runtime.prepare(placed,{action_id:randomUUID(),expected_version:placed.version,scene:'home',position:{...placed.position},target:'bed',action:'rest'})).head as OwnedFernSave;
 assert.deepEqual(next.relationshipNextV1,dani);assert.deepEqual(next.ownedFernV1,placed.ownedFernV1);
 assertOwnedFernReadable(next);runtime.assertReadable(next);
});

test('normal runtime still refuses the QA-only fern move and creates no owned root on ordinary play',async()=>{
 const runtime=createRuntime(),s=fixture(),before=structuredClone(s);
 s.scene='home';s.position={...entityAt('home','bed')!.approach};
 const command:Action={action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{...s.position},target:'qa-fern-pot',action:'qa:owned-fern-move'};
 await assert.rejects(runtime.prepare(s,command));
 assert.deepEqual(s.ownedFernV1,before.ownedFernV1);assert.equal(s.version,before.version);
 const plain={...initial('en',randomUUID()),scene:'home',position:{...s.position},flags:['key','unpacked'],visited:['station','home']};
 const result=await runtime.prepare(plain,{...command,action_id:randomUUID(),expected_version:plain.version,target:'bed',action:'rest'});
 assert.equal((result.head as OwnedFernSave).ownedFernV1,undefined);
});
