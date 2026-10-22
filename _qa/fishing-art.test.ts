import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {fishingItemImages} from '../src/ui/fishing-art';import provenance from '../src/ui/fishing-art/provenance.json';import {itemArt} from '../src/ui/bag-art';import {bagRows} from '../src/ui/Bag';import {initial} from '../src/story/state';import {speciesIds,fishItem} from '../src/challenges/fishing-catalog';
test('four READY source pins map to exact256RGBA item files; held lure and unmade fish are excluded',()=>{
 assert.deepEqual(Object.keys(fishingItemImages).sort(),provenance.items.map(x=>x.itemId).sort());assert.equal(provenance.items.length,4);
 for(const a of provenance.items){assert.equal(a.aiVerdict,'READY');assert.equal(a.formalAdmitted,false);const file=new URL(itemArt(a.itemId)!);const bytes=readFileSync(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.equal(bytes.readUInt32BE(16),256);assert.equal(bytes.readUInt32BE(20),256);assert.equal(bytes[24],8);assert.equal(bytes[25],6)}
 assert.equal(itemArt('reusable-fishing-lure'),undefined);assert.equal(itemArt('fish'),undefined);for(const id of speciesIds)assert.equal(itemArt(fishItem(id)),undefined);
});
test('actual bag row projection picks four matching images without changing inventory or borrowing held art',()=>{
 const save=initial('en','synthetic-art-only');for(const id of [...Object.keys(fishingItemImages),'reusable-fishing-lure','fish'])save.items[id]=1;const before=structuredClone(save);const rows=bagRows(save,null);
 for(const a of provenance.items){const row=rows.find(x=>x.item===a.itemId)!;assert.equal(row.image,itemArt(a.itemId));assert.equal(row.transparent,true);assert.equal(row.quantity,1)}
 assert.equal(rows.find(x=>x.item==='reusable-fishing-lure')!.image,undefined);assert.deepEqual(save,before);
});
