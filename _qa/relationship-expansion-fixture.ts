import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initial,applyAction,type Save,type Action} from '../src/story/state';
import {entityAt,rooms} from '../src/world/data';
import {relationshipStage,relationshipMemory} from '../src/story/relationship-growth';

export const fixture=(locale:'zh'|'en'='en'):Save=>({...initial(locale,randomUUID()),scene:'harbor',position:entityAt('harbor','owen')!.approach,flags:['key','unpacked','bag-returned'],visited:Object.keys(rooms),relations:{owen:-23},items:{key:1}});
export const at=(s:Save,scene:string,minute:number):Save=>({...structuredClone(s),scene,townMinutes:minute,position:{...rooms[scene].spawn}});
export const action=(s:Save,target:string,id:string):Action=>({action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:entityAt(s.scene,target)!.approach,target,action:id==='introduce'?id:id==='observe'?'relationship-observe:owen':'talk:'+id});
export const step=(s:Save,id:string,target='owen')=>applyAction(s,action(s,target,id)).head;
export function closeFriend(locale:'zh'|'en'='en'){
 let s=fixture(locale);assert.equal(relationshipStage(s,'owen'),'stranger');s=step(s,'introduce');assert.equal(relationshipStage(s,'owen'),'acquaintance');s=step(s,'rg-greet');s=step(s,'rg-personal');
 s=at(s,'harbor',1980);s=step(s,'rg-greet');assert.equal(relationshipStage(s,'owen'),'familiar');s=step(s,'rg-request');
 s=at(s,'weather',2010);s=step(s,'observe','logbook');assert.deepEqual(relationshipMemory(s,'owen').days,[0,1]);assert.ok(!s.flags.includes('weather-read'));assert.equal(s.animalNotebookV1,undefined);
 s=at(s,'harbor',2030);s=step(s,'rg-fulfill');s=step(s,'rg-invite');s=at(s,'coast',2520);s=step(s,'rg-company');
 s=at(s,'coast',3960);s=step(s,'rg-greet');assert.equal(relationshipStage(s,'owen'),'trusted');s=step(s,'rg-private');s=step(s,'rg-private-invite');s=step(s,'rg-private-event');s=step(s,'rg-recall');
 for(const minute of [5400,6840]){s=at(s,'coast',minute);s=step(s,'rg-greet')}
 return s;
}
