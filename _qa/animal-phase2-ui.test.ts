import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {initial} from '../src/story/state';
import {rooms} from '../src/world/data';
import {AnimalInteraction} from '../src/ui/AnimalNotebook';
import {createReviewedAnimalArcLife} from '../server/reviewed-animal-life';
import {runtime} from '../server/runtime';
import first from '../server/content/reviewed-evening-gull-watch.json';
import second from '../server/content/phase2-quiet-after-gulls.json';

test('Dani sees the authored continuation in both languages only after the first pinned page',()=>{
 const life=createReviewedAnimalArcLife(runtime),target=Object.values(rooms).flatMap(r=>r.entities).find(e=>e.person==='dani');
 assert.ok(target);
 const head={...initial('en','animal-phase2-ui-fixture'),known:['dani']};
 const render=(locale:'en'|'zh')=>renderToStaticMarkup(createElement(AnimalInteraction,{save:{...head,locale},view:life.animalProject(head),target,locale,busy:false,ready:true,projectionCurrent:true,onCommand:()=>{}}));
 assert.ok(!render('en').includes(second.ref.id));
 head.animalNotebookV1={schema:1,briefs:[],pages:[{ref:first.ref,sourceAction:'a'.repeat(16),minute:540}]} as any;
 const en=render('en'),zh=render('zh');
 assert.ok(en.includes(second.ref.id));assert.ok(en.includes(second.continuation[1]));
 assert.ok(zh.includes(second.continuation[0]));
});
