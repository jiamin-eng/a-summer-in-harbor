/** Offline real React component/content review. No HTTP listener, browser or player account. */
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context)}});
globalThis.React=React;
const {Relationships}=await import('../src/ui/Relationships.tsx');
const {fixture,step,at,closeFriend}=await import('./relationship-expansion-fixture.ts');
const {relationshipStage,growthTopics,relationshipProfiles}=await import('../src/story/relationship-growth.ts');
const {description}=await import('../src/story/descriptions.ts');
const {entityAt}=await import('../src/world/data.ts');
const out='../evidence',report={mode:'actual React SSR + reducer states; CSS loading stubbed in Node, actual dist CSS linked for review; no visual-layout or renderer claim',cases:[],networkCalls:0,browserLaunches:0};await mkdir(out,{recursive:true});
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const css=(await readFile('dist/index.html','utf8')).match(/href="\.\/([^\"]+\.css)"/)[1];
const blocks=[];
for(const locale of ['en','zh']){
 const legacy=fixture(locale);legacy.history.push({id:'journal-only-owen',person:'owen',kind:'talk',text:['旧时的一段谈话','An earlier conversation']});let s=step(fixture(locale),'introduce');const states=[['legacy-journal-only',legacy],['acquaintance',s]];s=step(s,'rg-greet');s=step(s,'rg-personal');s=at(s,'harbor',1980);s=step(s,'rg-greet');states.push(['familiar',s]);s=step(s,'rg-request');states.push(['promise',s]);states.push(['close',closeFriend(locale)]);
 for(const [name,save] of states){
  const markup=renderToStaticMarkup(React.createElement(Relationships,{save,locale,initialPerson:'owen',onMap:()=>{},onPortrait:()=>{}}));assert.ok(markup.includes('data-relationship="owen"'));assert.ok(markup.includes(locale==='en'?'Owen Price':'欧文'));assert.ok(!markup.includes('NaN'));assert.ok(!markup.includes('undefined'));
  const words=description(save,entityAt(save.scene,'owen')),topics=growthTopics(save,'owen').map(t=>({id:t.id,label:t.label[locale==='en'?1:0],reply:t.reply[locale==='en'?1:0]}));
  blocks.push(`<section><h2>${escape(locale+' · '+name+' · '+relationshipStage(save,'owen'))}</h2><div class="review-card">${markup.replaceAll('src="./art/','src="../source/dist/art/')}</div><details><summary>当前实体描述与可用话题</summary><pre>${escape(JSON.stringify({description:words[locale==='en'?1:0],topics},null,2))}</pre></details></section>`);report.cases.push({locale,state:name,stage:relationshipStage(save,'owen'),component:'Relationships',containsOwen:true,availableTopics:topics.map(t=>t.id)});
 }
 const p=relationshipProfiles.owen;blocks.push(`<section><h2>${locale} · 作者内容完整对照</h2>${['personal','request','observation','thanks','company','private','privateEvent','recall'].map(k=>`<h3>${k}</h3><p>${escape(p[k][locale==='en'?1:0])}</p>`).join('')}</section>`);
}
await writeFile(out+'/content-review.html',`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owen关系切片内容评审</title><link rel="stylesheet" href="../source/dist/${css}"><style>html,body{overflow:auto!important;height:auto!important}body{position:static!important;background:#f5efdc;color:#183f40;padding:24px;font:16px/1.6 system-ui}main{max-width:1050px;margin:auto}section{margin:32px 0;padding:24px;background:#fff6dc;border:1px solid #8b9d88}.review-card{max-width:390px;padding:16px;border:2px solid #183f40}pre{white-space:pre-wrap;overflow-wrap:anywhere}h2{font:700 22px/1.4 system-ui}</style><main><h1>Owen关系切片：离线内容评审</h1><p>实际React组件与合成规则流程。没有浏览器、网络或真实存档；不能代替320/390 renderer及触控验收。下面提供10个组件状态及完整中英文作者对白。</p>${blocks.join('')}</main></html>`);
await writeFile(out+'/content-review.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:report.cases.length,networkCalls:0,browserLaunches:0,output:out+'/content-review.html'}));
