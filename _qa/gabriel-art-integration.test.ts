import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Direction} from '@rpgjs/common';
import {people,rooms} from '../src/world/data';
import {npcSheets} from '../src/world/sheets';
import {residentHere} from '../src/world/residents';
import crops from '../src/ui/people-avatar-crops.json';
import provenance from '../public/art/people-avatars/PROVENANCE.json';

const files=[
 ['public/art/npc-gabriel.png','ce3fb4ff2557838f1d9cb9b1fb887ef326811dfd3fb9264f1e3c2af80a955090',384,512],
 ['public/art/gabriel-avatar.png','8dd9261e7fb5ae3c8b9bbc9bd7adef6c89ba424ba39ed5163ded9241fdae153d',256,256],
 ['public/art/people-avatars/gabriel.png','8dd9261e7fb5ae3c8b9bbc9bd7adef6c89ba424ba39ed5163ded9241fdae153d',256,256],
 ['public/art/gabriel-root-v2.png','d2624d420def238b1d6f1dd8b6099f6aceccb9638bf3cfa26d348d4ecddd2082',512,512],
] as const;

test('only the reviewed Gabriel consumer files replace his placeholder',()=>{
 for(const [path,hash,width,height] of files){const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,path);assert.equal(bytes.toString('ascii',1,4),'PNG');assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height)}
 assert.equal(people.gabriel.art,'gabriel');assert.equal(people.gabriel.mapArt,'gabriel');assert.equal(people.gabriel.portraitShape,'square');
 assert.equal(people.arthur.art,'arthur');assert.equal(rooms.weather.entities.find(e=>e.person==='arthur')?.person,'arthur');
 assert.deepEqual(crops.gabriel,[32,12,192,240]);
 assert.equal(provenance.sources.find(x=>x.person==='gabriel')?.sha256,files[1][1]);
});

test('Gabriel has his own four-row native atlas contract while older NPC rows stay unchanged',()=>{
 const gabriel=npcSheets.find(s=>s.id==='npc-gabriel');assert.ok(gabriel);assert.equal(gabriel.image,'./art/npc-gabriel.png');
 assert.deepEqual([gabriel.width,gabriel.height,gabriel.framesWidth,gabriel.framesHeight],[384,512,3,4]);
 const rows={down:0,up:1,left:2,right:3},columns={'stride-0':0,stand:1,'stride-2':2,'stride-1':1} as const;
 for(const direction of Object.keys(rows) as Direction[])for(const [animation,column] of Object.entries(columns)){
  const row=rows[direction as keyof typeof rows],frame:any=gabriel.textures[animation].animations({direction})[0][0];
  assert.deepEqual([frame.frameX,frame.frameY,frame.x,frame.y],[column,row,0,0]);
  assert.deepEqual(frame.anchor,[.5,.953125]);assert.deepEqual(frame.scale,[56/108,56/108]);
 }
 const arthur=npcSheets.find(s=>s.id==='npc-arthur');assert.ok(arthur);
 assert.deepEqual((['down','left','right','up'] as Direction[]).map(direction=>arthur.textures.stand.animations({direction})[0][0].frameY),[0,1,2,3]);
});

test('Gabriel continues the existing chapel, hill and evening schedule without changing old identity',()=>{
 assert.equal(Object.keys(people).length,23);
 for(const [minute,scene] of [[540,'chapel'],[780,'hill'],[1080,'chapel']] as const){
  assert.equal(residentHere({townMinutes:minute},'gabriel',scene),true);
  assert.equal(rooms[scene].entities.filter(e=>e.person==='gabriel').length,1);
 }
});
