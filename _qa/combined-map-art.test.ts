import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {rooms,world} from '../src/world/data';
import {findPath,walkable} from '../src/engine/world';
import {sheets,propId} from '../src/world/sheets';
import {gardenStaticAnchors,gardenStaticProps} from '../src/world/garden-static';
import rope from '../src/world/pier-rope-layout.json';

const art=(name:string)=>readFileSync(fileURLToPath(new URL(`../public/art/${name}.png`,import.meta.url)));
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const approved:Record<string,string>={
 'chapel-stained-glass-window':'a3dca35645a1afdc0a0e8613edfb327ee8bc97b074771b09132d84b781586d5b',
 'chapel-wood-pew':'35de66524ce7a40c988048222eea5dda84f682b80a0e2f97e4a55f95a1719572',
 'chapel-altar':'233117902a5f8d2972f0f611156b74201a45ab8cac483a446a346dad5c3eab5b',
 'chapel-floor-candlestick':'e2ab753aaa0facab254e4c120c390febaaa300fc4d814efc99aa0d68b36fe495',
 'pedestal-sundial':'c6fdfc5c4b466daa9a6d5972083a79678ccf147714de56eb893b21d8f6aa0264',
 'clay-chiminea':'097f8e66a3bda9c8ed6ab0f4ad47ebf55c43d0f6247dcce6fd006f19bd12bd9a',
 'nest-birdhouse':'ac9a4f156b07e94f4c3f940e743087d37faf3291078f9d88b505d46a2675cff6',
 'wooden-beehive-box':'20fc951549abec464a968da794dc824ddb097f47af9c39d7c9251c3ebc74b547',
 'pier-rope-v1':'f163b519f49b804a8a4141ef39421cf8364e708aae9274fb329e9c142f28e5e1',
 'existing-C-post-5x26':'d6cce4d299c86aacf59565a1a20f1a3366c0ee2eaf4186d245f493f3a874971a'
};

test('consumer art is byte-identical to pinned approved files',()=>{
 for(const [name,digest] of Object.entries(approved))assert.equal(hash(art(name)),digest,name);
});

test('chapel furniture uses four native sources without breaking the aisle and original actions',()=>{
 const room=rooms.chapel;
 assert.equal(room.props.filter(p=>p.art==='chapel-wood-pew').length,5);
 for(const name of Object.keys(approved).filter(n=>n.startsWith('chapel-'))){
  const props=room.props.filter(p=>p.art===name);
  assert.ok(props.length>0,name);
  assert.ok(props.every(p=>sheets.some(s=>s.id===propId('chapel',p)&&s.image===`./art/${name}.png`)),name);
 }
 assert.equal(room.props.find(p=>p.id==='stained-window')?.footprint,undefined);
 assert.deepEqual(room.props.find(p=>p.id==='altar')?.footprint,{x:433,y:253,w:84,h:22});
 for(const id of ['exit','chapel-note','chapel-reading','chapel-seat']){
  const e=room.entities.find(x=>x.id===id)!;
  assert.ok(walkable(world,'chapel',e.approach),id);
  assert.ok(findPath(world,'chapel',room.spawn,e.approach).length,id);
 }
});

test('garden four static slots stay grounded and leave planted beds and exit reachable',()=>{
 const room=rooms.garden;
 assert.equal(gardenStaticProps.length,4);
 for(const p of gardenStaticProps){
  assert.ok(room.props.some(q=>q.id===p.id&&q.art===p.art));
  assert.ok(world.scenes.garden.obstacles.some(q=>JSON.stringify(q)===JSON.stringify(p.footprint)),p.id);
  const sheet=sheets.find(s=>s.id===propId('garden',p))!;
  const frame=sheet.textures.stand.animations({direction:'down'})[0][0];
  assert.deepEqual(frame.anchor,gardenStaticAnchors[p.art],p.id);
 }
 for(const id of ['exit','gate-hours','crop-bed-1','crop-bed-2','crop-bed-3']){
  const e=room.entities.find(x=>x.id===id)!;
  assert.ok(walkable(world,'garden',e.approach),id);
  assert.ok(findPath(world,'garden',room.spawn,e.approach).length,id);
 }
});

test('rope uses sixteen floor roles and seven through posts outside the old walk strip',()=>{
 assert.equal(rope.pieces.length,16);
 assert.equal(Object.keys(rope.roles).length,16);
 assert.equal(rope.displayYOffset,-23);
 const posts=rooms.harbor.props.filter(p=>p.id.startsWith('pier-rope-post-'));
 assert.equal(posts.length,7);
 assert.ok(posts.every(p=>!p.footprint&&p.width===5));
 assert.ok(rope.posts.every(p=>p.x<750||p.x>860||p.x===821&&p.y===934));
 assert.ok(rope.pieces.every(p=>p.x<895&&p.y>=754&&p.y<=914));
 assert.ok(rope.pieces.every(p=>Object.hasOwn(rope.roles,p.role)));
 assert.equal(world.scenes.harbor.obstacles.length,46);
});
