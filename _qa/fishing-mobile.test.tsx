import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Fishing} from '../src/ui/Fishing';
import {fishingInitial,fishingStep,recordFishing,type FishingRun} from '../src/challenges/fishing';
import {type ShoreEncounter,pendingShoreResult,pendingLegacyResult} from '../src/challenges/shore-fishing';
const encounter:ShoreEncounter={schema:1,rules:'shore-fishing-v1',scene:'dock',standing:{x:340,y:500},cast:{x:350,y:530},water:'saltwater',zone:'dock',minute:540,species:'bay-silverside',first:true,biteTick:45,hookWindow:180};
function render(props:Partial<Parameters<typeof Fishing>[0]>={},draft:unknown=null){
 Object.assign(globalThis,{document:{hidden:false,hasFocus:()=>true},window:{alteruLocalStorage:{getItem:()=>JSON.stringify(draft)}}});
 return renderToStaticMarkup(<Fishing locale="en" journeyId="synthetic" challengeId="cast" onFinish={()=>true} onLeave={()=>true} onReserve={async()=>true} {...props}/>);
}
function caught(profile:'first'|'regular'){let line=fishingInitial();const runs:FishingRun[]=[];while(line.result==='playing'){const held=line.tension<.68;recordFishing(runs,held);line=fishingStep(line,held,profile)}assert.equal(line.result,'caught');return runs}
test('shore recovery preserves bite/reeling input rather than resetting to a new cast',()=>{
 const base={schema:1,id:'cast',journey:'synthetic',waitTicks:45,hookTick:null,runs:[]};
 const bite=render({encounter},base);assert.match(bite,/data-fishing-phase="bite"/);assert.match(bite,/data-fishing-hook/);assert.doesNotMatch(bite,/data-fishing-reel/);
 const reel=render({encounter},{...base,hookTick:45,runs:[{reel:true,ticks:25}]});assert.match(reel,/data-fishing-phase="reeling"/);assert.match(reel,/data-fishing-reel/);assert.doesNotMatch(reel,/data-fishing-hook/);
 const foreign=render({encounter},{...base,journey:'other'});assert.match(foreign,/data-fishing-phase="waiting"/);
});
test('legacy draft has the same visible phases but retains regular replay, while old pending beats any draft',()=>{
 const draft={schema:1,legacy:true,id:'cast',journey:'synthetic',waitTicks:45,hookTick:45,runs:[{reel:true,ticks:25}]};
 assert.match(render({},draft),/data-fishing-phase="reeling"/);
 const pending=pendingLegacyResult(caught('regular')),html=render({pendingResult:pending},draft);
 assert.match(html,/data-fishing-phase="result"/);assert.match(html,/Fresh fish/);assert.match(html,/data-fishing-confirm/);assert.doesNotMatch(html,/data-fishing-leave/);assert.doesNotMatch(html,/data-fishing-reel/);
});
test('caught result cannot be confirmed until saved; server-pending result unlocks one confirmation and names its species in both languages',()=>{
 const input={hookTick:45,waitTicks:45,runs:caught('first')},draft={schema:1,id:'cast',journey:'synthetic',...input};
 const unsaved=render({encounter},draft);assert.match(unsaved,/data-fishing-confirm="true" disabled=""/);assert.match(unsaved,/Saving your fishing result/);
 const pendingResult=pendingShoreResult(encounter,input);
 for(const locale of ['en','zh']as const){const html=render({encounter,pendingResult,locale},draft);assert.match(html,/data-fishing-saved="true"/);assert.doesNotMatch(html,/data-fishing-confirm="true" disabled/);assert.equal((html.match(/data-fishing-confirm=/g)??[]).length,1);assert.ok(html.includes(locale==='en'?'Bay silverside':'海湾银鳞鱼'))}
});
