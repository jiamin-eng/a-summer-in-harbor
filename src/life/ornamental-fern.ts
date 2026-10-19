import type {Save} from '../story/state';
import {advanceAwake} from '../story/fatigue';
import {battleLocksWorld} from '../story/turn-battle';
import {findPath,walkable,type World} from '../engine/world';
import {fernRules,fernGiftEvent,fernOwnedFlag,fernDisplayFlag,fernSlot,fernMoveCost,fernVerbs,type OrnamentalFernVerb} from './ornamental-fern-config';
export {fernSlot,fernImage,fernMoveCost} from './ornamental-fern-config';
type Source={actionId:string;minute:number};
export type OrnamentalFernState={schema:1;rules:typeof fernRules;offer:Source;plant?:{id:string;ownerJourney:string;source:Source&{event:typeof fernGiftEvent};ageMinutesAtGrant:1440;holder:'bag'|typeof fernSlot.id;moveCount:number;lastMove?:Source&{to:'bag'|typeof fernSlot.id}}};
export type OrnamentalFernSave=Save&{ornamentalFernV1?:OrnamentalFernState};
const ok=(v:unknown,e:string)=>{if(!v)throw Error(e)};
const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=max;
const aid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const fernEligible=(s:Save)=>s.known.includes('mara')&&['key','unpacked','bag-returned'].every(f=>s.flags.includes(f))&&s.visited.includes('home');
export function assertOrnamentalFernReadable(s:OrnamentalFernSave){
 const root=s.ornamentalFernV1,owned=s.flags.filter(f=>f===fernOwnedFlag).length,displayed=s.flags.filter(f=>f===fernDisplayFlag).length,bad='UNSUPPORTED_ORNAMENTAL_FERN_SAVE',now=s.townMinutes??540;
 if(root===undefined){ok(!owned&&!displayed,bad);return}
 ok(obj(root)&&exact(root,root.plant===undefined?['schema','rules','offer']:['schema','rules','offer','plant'])&&root.schema===1&&root.rules===fernRules&&fernEligible(s),bad);
 ok(obj(root.offer)&&exact(root.offer,['actionId','minute'])&&aid(root.offer.actionId)&&integer(root.offer.minute,now),bad);
 const p=root.plant;if(p===undefined){ok(!owned&&!displayed,bad);return}
 ok(obj(p)&&exact(p,p.moveCount===0?['id','ownerJourney','source','ageMinutesAtGrant','holder','moveCount']:['id','ownerJourney','source','ageMinutesAtGrant','holder','moveCount','lastMove']),bad);
 ok(obj(p.source)&&exact(p.source,['actionId','minute','event'])&&p.source.event===fernGiftEvent&&aid(p.source.actionId)&&p.source.actionId!==root.offer.actionId&&integer(p.source.minute,now)&&p.source.minute>=root.offer.minute&&p.id==='potted-fern:'+p.source.actionId&&p.ownerJourney===s.id&&p.ageMinutesAtGrant===1440&&integer(p.moveCount)&&p.moveCount<=Math.floor((now-p.source.minute)/20)&&p.holder===(p.moveCount%2?fernSlot.id:'bag')&&owned===1&&displayed===(p.holder===fernSlot.id?1:0),bad);
 if(p.moveCount){const m=p.lastMove;ok(obj(m)&&exact(m,['actionId','minute','to'])&&aid(m.actionId)&&![root.offer.actionId,p.source.actionId].includes(m.actionId)&&integer(m.minute,now)&&m.minute>=p.source.minute+p.moveCount*20&&m.to===p.holder,bad)}
}
export function fernAge(s:OrnamentalFernSave){const p=s.ornamentalFernV1?.plant;return p?1440+(s.townMinutes??540)-p.source.minute:undefined}
const overlap=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
/** Pure candidate update; caller supplies real spatial admission and commits via
 * the original authority transaction. No fixture rule/source is accepted. */
export function applyOrnamentalFern(previous:OrnamentalFernSave,verb:OrnamentalFernVerb,actionId:string,world:World,newStarts=true){
 assertOrnamentalFernReadable(previous);ok(fernVerbs.includes(verb)&&aid(actionId),'ORNAMENTAL_FERN_ACTION');ok(!previous.activeChallenge&&!battleLocksWorld(previous),'CHALLENGE_ACTIVE');
 const s=structuredClone(previous),now=s.townMinutes??540;let text:[string,string];
 if(verb==='read-offer'){
  ok(newStarts,'ORNAMENTAL_FERN_STARTS_CLOSED');ok(fernEligible(s),'ORNAMENTAL_FERN_SETTLE_FIRST');ok(!s.ornamentalFernV1,'ORNAMENTAL_FERN_OFFER_READ');
  s.ornamentalFernV1={schema:1,rules:fernRules,offer:{actionId,minute:now}};
  text=['“我另备了一盆已经长好的小蕨，想带回租屋吗？这是给你的，不是花园那株。房间右侧有个位置；以后放下或收回，每次要4精力、20游戏分钟，不花钱，也不需要浇水。你可以以后再决定。”','“I have a separate, fully grown potted fern for you, if you would like it. It is not the garden fern. There is a spot on the right side of your room. Placing it or taking it back costs 4 energy and 20 game minutes each time, with no cash cost or watering. You can decide later.”'];
 }else if(verb==='accept'){
  ok(newStarts,'ORNAMENTAL_FERN_STARTS_CLOSED');ok(fernEligible(s),'ORNAMENTAL_FERN_SETTLE_FIRST');ok(s.ornamentalFernV1,'ORNAMENTAL_FERN_OFFER_FIRST');ok(!s.ornamentalFernV1!.plant,'ORNAMENTAL_FERN_ALREADY_OWNED');ok(s.ornamentalFernV1!.offer.actionId!==actionId,'ORNAMENTAL_FERN_ACTION');
  s.ornamentalFernV1!.plant={id:'potted-fern:'+actionId,ownerJourney:s.id,source:{event:fernGiftEvent,actionId,minute:now},ageMinutesAtGrant:1440,holder:'bag',moveCount:0};s.flags.push(fernOwnedFlag);
  text=['玛拉把另备的盆蕨交给你。它已放进行囊，属于这个旅程；回租屋后可走到房间右侧的位置摆放。领取不额外耗精力、时间或现金。','Mara gives you the separate potted fern. It is now in your bag, yours for this journey. Back in Your Room, approach the spot on the right to place it. Accepting adds no energy, time or cash cost.'];
 }else{
  const p=s.ornamentalFernV1?.plant;ok(p,'ORNAMENTAL_FERN_NOT_OWNED');ok(s.scene===fernSlot.scene&&fernEligible(s),'ORNAMENTAL_FERN_ROOM');
  const to=verb==='place'?fernSlot.id:'bag';ok(p!.holder!==to,'ORNAMENTAL_FERN_ALREADY_THERE');ok(![s.ornamentalFernV1!.offer.actionId,p!.source.actionId,p!.lastMove?.actionId].includes(actionId),'ORNAMENTAL_FERN_ACTION');ok(s.energy>=4,'REST_NEEDED');ok(Number.isSafeInteger(now+20),'ORNAMENTAL_FERN_TIME');
  if(verb==='place'){
   const scene=world.scenes.home,foot=fernSlot.footprint;ok(!!scene&&foot.x>=scene.interior.x&&foot.y>=scene.interior.y&&foot.x+foot.w<=scene.interior.x+scene.interior.w&&foot.y+foot.h<=scene.interior.y+scene.interior.h,'ORNAMENTAL_FERN_SLOT');
   ok(!scene.obstacles.some(b=>overlap(foot,b)),'ORNAMENTAL_FERN_OCCUPIED');ok(!overlap(foot,{...s.position,...world.actor}),'ORNAMENTAL_FERN_PLAYER_SPACE');
   const occupied={...world,scenes:{...world.scenes,home:{...scene,obstacles:[...scene.obstacles,foot]}}};
   ok(walkable(occupied,'home',fernSlot.approach)&&findPath(occupied,'home',s.position,fernSlot.approach).length>0,'ORNAMENTAL_FERN_UNREACHABLE');
  }
  s.energy-=fernMoveCost.energy;advanceAwake(s,fernMoveCost.minutes);s.townMinutes=now+fernMoveCost.minutes;
  p!.holder=to;p!.moveCount++;p!.lastMove={actionId,minute:s.townMinutes,to};s.flags=s.flags.filter(f=>f!==fernDisplayFlag);if(to===fernSlot.id)s.flags.push(fernDisplayFlag);
  text=verb==='place'?['盆蕨安放在房间右侧。它仍是玛拉赠你的同一株。消耗4精力、20游戏分钟，现金不变；原有疲劳照常结算。','The fern is placed on the right side of your room, the same plant Mara gave you. Cost: 4 energy and 20 game minutes, no cash. Existing fatigue still applies.']:['你把同一盆蕨收回行囊，房内位置空出来了。消耗4精力、20游戏分钟，现金不变；原有疲劳照常结算。','You return the same potted fern to your bag, leaving its room spot empty. Cost: 4 energy and 20 game minutes, no cash. Existing fatigue still applies.'];
 }
 assertOrnamentalFernReadable(s);return {head:s,text};
}
