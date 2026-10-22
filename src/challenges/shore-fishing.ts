import {fishCatalog,type SpeciesId} from './fishing-catalog';
import {fishingTicket,validFishingV2,type FishingTicket} from './fishing-v2';
import {landWorld} from '../life/land';
import type {Point,World} from '../engine/world';
import {checkShore,type WaterKind} from '../world/shore-water';
import {replayFishing,type FishingRun} from './fishing';
import type {Save,Action} from '../story/state';
export const basicRod='basic-fishing-rod',basicLure='reusable-fishing-lure';
export type ShoreEncounter={schema:1;rules:'shore-fishing-v1'|'shore-fishing-v2';ticket?:FishingTicket;scene:string;standing:Point;cast:Point;water:WaterKind;zone:string;minute:number;species:SpeciesId;first:boolean;biteTick:number;hookWindow:number};
export type ShoreInput={hookTick:number|null;waitTicks:number;runs:FishingRun[]};
export type PendingShoreResult={schema:1;input:ShoreInput;result:'caught'|'escaped';legacy?:false};
export type PendingLegacyResult={schema:1;input:{runs:import('./fishing').FishingRun[]};result:'caught'|'escaped';legacy:true};
export type PendingFishingResult=PendingShoreResult|PendingLegacyResult;
export function pendingLegacyResult(runs:import('./fishing').FishingRun[]):PendingLegacyResult{const replay=replayFishing(runs);if(replay.result==='playing')throw Error('CHALLENGE_NOT_FINISHED');return {schema:1,input:{runs:structuredClone(runs)},result:replay.result,legacy:true}}
export function pendingShoreResult(encounter:ShoreEncounter,input:ShoreInput):PendingShoreResult{const replay=replayShore(encounter,input);if(replay.result==='playing')throw Error('CHALLENGE_NOT_FINISHED');return {schema:1,input:structuredClone({hookTick:input.hookTick,waitTicks:input.waitTicks,runs:input.runs}),result:replay.result}}
export type FishingMemory={schema:1;kit:true;caught:number;lastCatch?:{action:string;species:ShoreEncounter['species'];water:WaterKind;minute:number}};
const gate=(v:unknown,code:string)=>{if(!v)throw Error(code)};
export const hasFishingKit=(s:Pick<Save,'items'>)=>(s.items[basicRod]??0)>0&&(s.items[basicLure]??0)>0;
export function claimFishingKit(s:Save){gate(!s.activeChallenge&&(!s.turnBattle||s.turnBattle.phase==='paused'),'CHALLENGE_ACTIVE');s.items[basicRod]=Math.max(1,s.items[basicRod]??0);s.items[basicLure]=Math.max(1,s.items[basicLure]??0);s.fishingV1??={schema:1,kit:true,caught:0};return s.turnBattle?.phase==='paused'?['基础钓具已免费放进行囊。对练仍保留暂停进度；开钓前请先在地图的探索事项中处理对练。','Your free fishing kit is in your bag. Your paused bout is preserved; manage it in Map → Exploration before casting.']as[string,string]:['基础竿和可重复使用的拟饵已放进行囊，免费。走近可达无遮挡水边就能试竿。','Your free basic rod and reusable lure are in your bag. Try them from a reachable, clear water edge.']as[string,string]}
export function makeShoreEncounter(s:Save,a:Action,world:World):ShoreEncounter{
 gate(!s.turnBattle,'FISHING_PRACTICE_PAUSED');
 gate(hasFishingKit(s),'FISHING_KIT_NEEDED');gate(s.energy>=10,'REST_NEEDED');const aim=(a.payload as {cast?:Point}|undefined)?.cast;gate(aim&&Number.isFinite(aim.x)&&Number.isFinite(aim.y),'FISHING_AIM_REQUIRED');const check=checkShore(s.scene,s.position,landWorld(world,s.landV1),aim);if(!check.ok)throw Error('FISHING_'+check.reason);
 const minute=s.townMinutes??540,first=(s.fishingV1?.caught??0)===0,ticket=fishingTicket(s,check.target.water,check.target.zone,minute);
 return {schema:1,rules:'shore-fishing-v2',ticket,scene:s.scene,standing:{...s.position},cast:{...check.target.at},water:check.target.water,zone:check.target.zone,minute,species:ticket.species,first,biteTick:45,hookWindow:first?180:120};
}
export function replayShore(encounter:ShoreEncounter,input:ShoreInput){
 gate(input&&Number.isSafeInteger(input.waitTicks)&&input.waitTicks>=0&&input.waitTicks<=encounter.biteTick+encounter.hookWindow,'INVALID_FISHING_INPUT');
 if(input.hookTick===null){gate(input.waitTicks===encounter.biteTick+encounter.hookWindow&&Array.isArray(input.runs)&&input.runs.length===0,'FISHING_NOT_FINISHED');return {result:'escaped' as const}}
 gate(Number.isSafeInteger(input.hookTick)&&input.hookTick>=encounter.biteTick&&input.hookTick<encounter.biteTick+encounter.hookWindow&&input.waitTicks===input.hookTick,'INVALID_FISHING_HOOK');
 const result=replayFishing(input.runs,encounter.first?'first':'regular');gate(result.result!=='playing','CHALLENGE_NOT_FINISHED');return result;
}
export const speciesNames=Object.fromEntries(Object.entries(fishCatalog).map(([id,f])=>[id,f.name])) as Record<SpeciesId,[string,string]>;
export function validFishingMemory(s:Save){if(!validFishingV2(s))return false;const pending=s.activeChallenge?.fishingPending;if(pending){try{if(s.activeChallenge?.kind!=='fishing'||pending.schema!==1)return false;const expected=pending.legacy===true?(!s.activeChallenge.fishing?pendingLegacyResult(pending.input.runs):null):(s.activeChallenge.fishing?pendingShoreResult(s.activeChallenge.fishing,pending.input):null);if(!expected||expected.result!==pending.result)return false}catch{return false}}const m=s.fishingV1,c=s.activeChallenge?.fishing;if(m&&(m.schema!==1||m.kit!==true||!Number.isSafeInteger(m.caught)||m.caught<0||!hasFishingKit(s)||m.lastCatch&&(!speciesNames[m.lastCatch.species]||!['saltwater','stream'].includes(m.lastCatch.water)||!Number.isSafeInteger(m.lastCatch.minute)||typeof m.lastCatch.action!=='string')))return false;if(c&&(c.schema!==1||!['shore-fishing-v1','shore-fishing-v2'].includes(c.rules)||(c.rules==='shore-fishing-v1'&&!['bay-silverside','night-mullet','stream-minnow'].includes(c.species))||s.activeChallenge?.kind!=='fishing'||c.scene!==s.scene||!speciesNames[c.species]||!['saltwater','stream'].includes(c.water)||typeof c.first!=='boolean'||c.biteTick!==45||![120,180].includes(c.hookWindow)||![c.cast.x,c.cast.y,c.standing.x,c.standing.y].every(Number.isFinite)))return false;return true}
