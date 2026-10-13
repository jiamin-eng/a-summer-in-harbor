import {newNeighborChapter,neighborTopics,applyNeighborTopic,applyNeighborAction,neighborActionLabels,recordNeighborProgress,neighborObjective} from './neighbor-chapter';
import {priestTopics,applyPriestTopic,priestChoiceTopicIds} from './chapel-priest';
import type {NeighborChapter} from '../world/neighbor-gathering';
import {chapelTopics,applyChapelAction,chapelObjective} from './chapel';
import {mapRoute,entranceFailure} from '../world/map-navigation';
import {growthTopics,applyGrowthTopic,applyGrowthObservation,recordRelationshipMeeting,recordRelationshipStory,growthTopicIds,type RelationshipGrowth} from './relationship-growth';
import {nomadTopics,applyNomadTopic,type NomadMemory} from './tech-nomads';
import type {AnimalSave} from '../animals/types';
import {gameAnimalInteraction} from '../animals/game';
import {applyBattle,battleLocksWorld,battleItems,battleTopics,applyBattleTopic,type TurnBattle} from './turn-battle';
import {nextTopics,applyNextTopic} from './next-neighbors';
import {advanceTown,presentEntity,sleepToMorning,townMinutes,observedActor} from '../world/residents';
import {cropItems,cropVerbs,shopVerbs,applyCrop,type Plot} from './crops';
import {newsTopics,applyNewsTopic} from './town-news';
import {advanceAwake} from './fatigue';
import {lifeTopics,applyLifeTopic} from './resident-life';
import {replayFishing,type FishingRun} from '../challenges/fishing';
import {rooms,people,entityAt,tx,type Words,type Locale} from '../world/data';
import {walkable,type Point,type World} from '../engine/world';import {world,worldWithFlags} from '../world/data';
import {encounterPresets} from '../combat/presets';import {replayEncounter,type InputRun} from '../combat/core';
export type Entry={id:string;kind:'talk'|'action';person?:string;question?:string;text:Words};
import type {FieldNotes} from './fieldnotes-types';
import {questProgress} from './progress';
import type {NewsState} from './news-edition';
import type {MovingClock} from '../candidate/clock-types';
import type {ActivePlayClock} from '../candidate/active-play-types';
import {longTravelMinutes} from '../candidate/continuity';
export type Save=NewsState&{neighborChapterV1?:NeighborChapter;weatherEcologyV1?:import('../weather/ecology').WeatherEcologyState;weatherV1?:import('../weather/state').WeatherState;nativeCrabV1?:import('../animals/native-crab-game').NativeCrabSave;relationshipsV1?:RelationshipGrowth;movingClock?:MovingClock;activePlayClock?:ActivePlayClock;animalNotebookV1?:import('../animal-life/types').AnimalNotebook;techNomadsV1?:NomadMemory;landV1?:import('../life/land').LandState;animalsV1?:AnimalSave;turnBattle?:TurnBattle;awakeMinutes?:number;plots?:Record<string,Plot>;townMinutes?:number;fernStartedAt?:number;dynamicAssetRooms?:string[];roomAssetAttachments?:any[];dynamicAssetAvailable?:boolean;fieldNotes?:FieldNotes;id:string;version:number;cursor:number;mapVersion:1;locale:Locale;scene:string;position:Point;flags:string[];known:string[];visited:string[];items:Record<string,number>;energy:number;cash:number;standing:number;relations:Record<string,number>;history:Entry[];activeChallenge?:{id:string;kind:string;scene:string};};
export type Action={action_id:string;expected_version:number;scene:string;position:Point;target:string;action:string;payload?:unknown;activePlay?:{client:string;lease?:string;activeMs?:number};actorPosition?:Point};
export const has=(s:Save,id:string)=>s.flags.includes(id);
export function initial(locale:Locale,id:string):Save{return {neighborChapterV1:newNeighborChapter(),townMinutes:540,id,version:0,cursor:0,mapVersion:1,locale,scene:'station',position:{...rooms.station.spawn},flags:[],known:[],visited:['station'],items:{},energy:100,cash:25,standing:0,relations:{},history:[]}}
const requireState=(value:unknown,code:string)=>{if(!value)throw Error(code)};
const flag=(s:Save,id:string)=>{if(!s.flags.includes(id))s.flags.push(id)};
const give=(s:Save,id:string,n=1)=>s.items[id]=(s.items[id]??0)+n;
function take(s:Save,id:string,n=1){requireState(s.items[id]>=n,'MISSING_ITEM');s.items[id]-=n;if(!s.items[id])delete s.items[id]}
const relate=(s:Save,id:string,n:number)=>s.relations[id]=Math.max(-100,Math.min(100,(s.relations[id]??0)+n));
export const items:Record<string,{name:Words;description:Words;kind:'tools'|'objects'|'notes'}>={...battleItems,...cropItems,key:{name:['租屋钥匙','Room key'],description:['玛拉给你的钥匙，门在车站街。','Mara’s spare key. Your door is on Station Street.'],kind:'tools'},toolbag:{name:['玛拉的工具袋','Mara’s tool bag'],description:['西奥替她收好了。','Theo kept it safe behind the counter.'],kind:'objects'},toolkit:{name:['借来的工具','Borrowed tools'],description:['琼借给你的，可以修桥，也可以用于小修理。','June’s tools for repairs around town.'],kind:'tools'},wood:{name:['结实的木板','Sound timber'],description:['沙滩上的旧木板，修桥需要两块。','Salvaged at the beach. Two planks will mend the bridge.'],kind:'objects'},fish:{name:['新鲜的鱼','Fresh fish'],description:['可交给咖啡馆做当日特餐。','Theo can use it for the daily special.'],kind:'objects'},photo:{name:['旧桥照片','Bridge photograph'],description:['过去的海岸小桥与公共路线。','The old footbridge and its public approach.'],kind:'notes'},route:{name:['山坡路线图','Hillside route map'],description:['一条经过气象站下方的公共小路。','A public trail below the weather station.'],kind:'notes'}};
export const hasCoastRoute=(s:Save)=>has(s,'bridge-fixed')||has(s,'alternative-route')||has(s,'garden-agreed');
export function objective(s:Save):Words{
 const neighbor=neighborObjective(s);if(neighbor)return neighbor;
 if(s.scene==='chapel')return chapelObjective(s);
 if(has(s,'market-open'))return ['夏日在继续 · 探索、钓鱼，或回家歇一会儿','Summer continues · Explore, fish, or head home'];
 if(!s.known.includes('mara')&&!has(s,'key'))return ['车站街 · 和提钥匙的女士打个招呼','Station Street · Say hello to the woman with the keys'];
 if(!has(s,'key'))return ['车站街 · 向玛拉领取租屋钥匙','Station Street · Ask Mara for your key'];
 if(!has(s,'unpacked'))return ['你的租屋 · 放下行李','Your Room · Put your bag down'];
 if(!has(s,'talk:mara:settle')&&!s.items.toolbag&&!has(s,'bag-returned'))return ['车站街 · 回去告诉玛拉，你安顿好了','Station Street · Let Mara know you are settled'];
 if(!has(s,'bag-returned'))return s.items.toolbag?['车站街 · 把工具袋交还玛拉','Station Street · Return Mara’s tool bag']:['潮间咖啡馆 · 找回玛拉的工具袋','Tide & Table · Pick up Mara’s tool bag'];
 if(!has(s,'market-known'))return ['自由探索 · 去集市看看夏日活动告示','Explore freely · Read the summer notice in Market Square'];
 if(!has(s,'bridge-seen')&&!hasCoastRoute(s))return ['滨海道 · 看看海岸小桥出了什么问题','Coastal Path · Inspect the damaged footbridge'];
 if(!hasCoastRoute(s)){if(!s.items.toolkit)return ['琼的修理铺 · 借工具；也可以去山坡找绕路','June’s Workshop · Borrow tools, or explore the hill for another route'];if((s.items.wood??0)<2)return ['贝壳海滩 · 找两块结实的木板','Shell Beach · Find two sound planks'];return ['滨海道 · 带上工具和木板修桥','Coastal Path · Repair the bridge with your tools and planks'];}
 if(!has(s,'route-open'))return ['灯塔 · 确认通行安排，开放海岸路线','Lighthouse · Set the access arrangements'];
 if(!has(s,'market-open'))return ['集市广场 · 告诉大家路线已经准备好','Market Square · Share the good news'];
 return ['夏日在继续 · 探索、钓鱼，或回家歇一会儿','Summer continues · Explore, fish, or head home'];
}
export const topics:Record<string,{id:string;label:Words;reply:Words;requires?:string;all?:string[];once?:boolean}[]>={
 mara:[{id:'key',label:['领取钥匙','Collect your key'],reply:['“楼上的小房间是你的。先去放下包，回来再说别的。”她把钥匙放进你手里。','“The little room is yours. Put your bag down first. Everything else can wait.” She places the key in your hand.'],once:true},{id:'settle',label:['附近有什么可以去的？','Where should I start?'],reply:['“想认识人就去咖啡馆，想清静就沿海走。咖啡馆替我保管着工具袋，路过时替我带回来就好。”','“The café for company, the coast for quiet. The café is keeping my tool bag. Bring it back if you pass that way.”'],requires:'unpacked',once:true},{id:'return-bag',label:['交还工具袋','Return the tool bag'],reply:['她拉开袋子，松了口气：“正要用呢。谢谢。往后你不必事事问我，这个夏天是你的。”','She opens the bag with relief. “Just what I needed. Thank you. You don’t need my permission for every outing. This summer is yours.”'],once:true},{id:'town',label:['你在这里住了多久？','How long have you lived here?'],reply:['“三十二年。还是会发现没走过的巷子。有人说这里没有变化，我想只是他们不再出门了。”','“Thirty-two years. I still find lanes I haven’t walked. People say nothing changes here. Perhaps they’ve stopped looking.”'],once:true}],
 theo:[{id:'bag',label:['玛拉落下了工具袋','Mara left a tool bag'],reply:['“就在这里。”他把帆布袋递给你。“别急着走，那盏露台灯送进来检修，可一直没时间弄。”','“Right here.” He hands you a canvas bag. “No rush. The terrace lantern came in for repairs, but I haven’t had time to look at it.”'],requires:'unpacked',once:true},{id:'repair',label:['你这里有什么需要帮忙的吗？','Is there anything I could help with?'],reply:['“那盏露台灯不亮了，我一直抽不开身。接头松了，零件都在旁边。想试就看看，随时可以停下来。”','“The terrace lantern is out, and I haven’t found a minute for it. The connectors are loose; the parts are beside it. Have a look if you like. You can stop whenever you want.”'],once:true},{id:'fish',label:['把一条鱼交给厨房','Give the kitchen a fish'],reply:['“今天的特餐有着落了。”他付给你六美元。','“That’s today’s special sorted.” He pays you six dollars.']},{id:'coast',label:['从这里能走到海边吗？','Can I walk to the coast from here?'],reply:['“小桥坏了。近路经过一户人家的院子，但家里有位老人需要安静。我希望有个大家都舒服的办法。”','“The bridge broke. The shortcut crosses someone’s yard, where an older resident needs quiet. I hope there’s a way that works for everyone.”'],once:true}],
 june:[{id:'tools',label:['借一套工具','Borrow a toolkit'],reply:['她递来一只工具箱：“记得带回来。镇上的小修小补都用得上。你先看看要修的东西，别急着拆。”','She hands you a toolkit. “Bring it back sometime. Good for little repairs around town. Have a look at what is broken before taking anything apart.”'],once:true},{id:'bridge',label:['我看过小桥了，该怎么修？','I inspected the bridge. How would you repair it?'],reply:['“桥基没坏，换两块结实的桥板就行。沙滩上或许能找到合适的木头。先看有没有朽烂，再动手。”','“The supports are sound. Two sturdy boards should do it. You may find timber at the beach. Check for rot before you start.”'],requires:'bridge-seen',once:true}],
 idris:[{id:'training',label:['我想试试切磋','Try a friendly spar'],reply:['“先看我肩膀，我抬手才会出拳。闪开，等我收拳时再回来。准备好再开始。”','“Watch my shoulders. I raise my hands before I punch. Move out, then come back while I recover. Start when you’re ready.”']},{id:'footwork',label:['只练躲避和走位','Practice footwork'],reply:['“绕过练习垫，到另一头去。看准球的方向，不必打倒任何东西。”','“Go around the pads and reach the far end. Read the ball’s direction. You don’t have to knock anything down.”']},{id:'why',label:['你为什么开拳馆？','Why run this club?'],reply:['“因为有些人需要一个地方，把紧张放下来。赢不赢倒是第二位。”','“Some people need somewhere to put their nerves down. Winning comes after that.”'],once:true}],
 ruth:[{id:'fishing',label:['试试钓鱼','Try fishing'],reply:['“鱼往外跑就松一点，安静下来再收。线绷得太紧会断。今天先不收你租竿的钱。”','“Let it run when it pulls. Reel when it settles. Too much tension breaks the line. No rod hire today.”']},{id:'ferry',label:['那艘旧渡轮还开吗？','Does the old ferry still run?'],reply:['“不开了。我有时还是会来等，不过等的是傍晚，不是船。”','“No. I still come to wait sometimes. For the evening, though, not the boat.”'],once:true}],
 luis:[{id:'packed-snack',label:['买一份打包点心 · $4','Buy a packed snack · $4'],reply:['“装好了。想吃时再打开。”','“Wrapped up. Open it when you need it.”']},{id:'snack',label:['买份点心 · $4','Buy a snack · $4'],reply:['他递来热乎的面包。“先吃了再往山上走。”','He hands you warm bread. “Eat before you climb the hill.”']},{id:'water',label:['接杯水','Have some water'],reply:['凉水从水龙头流出。你坐了一会儿，感觉精神好多了。','Cool water runs from the tap. A short sit leaves you feeling better.']}],
 nell:[{id:'photo',label:['仔细看看旧桥照片','Look at the bridge photograph'],reply:['照片里，一条公共小路从山坡绕到桥的另一端。内尔把照片递给你：“也许气象站的人还记得。”','In the photograph, a public trail winds down the hill to the far side of the bridge. Nell gives you the print. “Someone at the weather station may remember.”'],once:true}],
 elena:[{id:'quiet',label:['你希望路过的人注意些什么？','What would you like people passing through to consider?'],reply:['“不只是声音。那个院子是我们的家。大家需要去海边，我理解，但不能默认这道门永远为他们开着。”','“It isn’t just noise. That courtyard is our home. I understand people need the coast, but that doesn’t make our gate a public road.”'],once:true},{id:'hours',label:['只在上午借道，可以吗？','Could people pass in the morning?'],reply:['“上午十点到十二点，贴清楚时间。我愿意试一天，不是把院子交出去。”','“Ten to twelve, with a clear sign. I’ll try it for one day. I’m not giving the garden away.”'],requires:'bridge-seen',all:['talk:elena:quiet'],once:true}],
 arthur:[{id:'trail',label:['还有别的路到海边吗？','Is there another way to the coast?'],reply:['“营地那张旧图上的路还在。拼好它，你就看得出转弯处。那是公共小路，不必穿过别人的院子。”','“The trail on the old camp map is still there. Put the pieces together and you’ll see the turn. Public land. No need to cross anyone’s garden.”'],once:true}]
};
function currentTopic(s:Save,p:string,t:(typeof topics)[string][number]){
 const q=questProgress(s);let reply:Words|undefined;
 switch(p+':'+t.id){
  case 'mara:settle':
   if(q.toolbag==='returned')reply=['“工具袋已经收好了，谢谢你。想热闹就去咖啡馆，想清静就沿海走。慢慢逛，不用急着替谁办事。”','“The tool bag is safely back, thanks to you. The café for company, the coast for quiet. Take your time; you don’t owe anyone an errand.”'];
   else if(q.toolbag==='carried'||q.toolbag==='collected')reply=['“想认识人就去咖啡馆，想清静就沿海走。你已经替我取到工具袋了，方便时交给我就好。”','“The café for company, the coast for quiet. You’ve already collected my tool bag; hand it over when you’re ready.”'];break;
  case 'theo:repair':if(q.terrace==='repaired')reply=['“灯已经修好了，多亏你。今晚露台终于能亮起来。先坐会儿吧，不用再修一次。”','“The lantern is fixed, thanks to you. We’ll have light on the terrace tonight. Take a seat; there’s nothing to fix again.”'];break;
  case 'theo:bag':if(q.terrace==='repaired')reply=['“就在这里。”他把帆布袋递给你。“灯也多亏你修好了，替我向玛拉问好。”','“Right here.” He hands you the canvas bag. “And thanks for fixing the lantern. Give Mara my regards.”'];break;
  case 'theo:coast':
   if(q.access==='open')reply=['“海岸通行安排已经贴好了，按指路牌走就行。要是选了庭院那条路，别忘了约好的时段。”','“The coast access arrangements are posted. Follow the signs. If you take the garden route, keep to the agreed hours.”'];
   else if(q.access==='ready')reply=['“你已经找到了可行的路。去灯塔确认通行安排，就能把路线告诉大家了。”','“You’ve found a workable route. Confirm the access arrangements at the lighthouse, then let everyone know.”'];break;
  case 'june:bridge':if(q.bridge==='repaired')reply=['“新桥板已经固定好了。做得不错。以后留意木板的状况就行，不用再找两块来换。”','“The new boards are secure. Good work. Just keep an eye on them; you don’t need another pair.”'];break;
  case 'arthur:trail':if(q.trail==='mapped')reply=['“你已经把公共小路拼出来了。沿气象站下面走，不需要经过私人院子。”','“You’ve already pieced together the public trail. It runs below the weather station, clear of the private garden.”'];break;
  case 'nell:photo':if(q.trail==='mapped')reply=['内尔把照片递给你：“留着吧。照片里就是你找到的那条公共小路，往后也能作个纪念。”','Nell gives you the photograph. “Keep it. That’s the public trail you found. A little memento, too.”'];break;
 }
 return reply?{...t,reply}:t;
}
export function availableTopics(s:Save,p:string){return [...(topics[p]??[]),...neighborTopics(s,p),...chapelTopics(s,p),...priestTopics(s,p),...lifeTopics(s,p),...newsTopics(s,p),...nextTopics(s,p),...nomadTopics(s,p),...battleTopics(s,p),...growthTopics(s,p)].filter(t=>(!t.requires||has(s,t.requires))&&(!t.all||t.all.every(f=>has(s,f)))&&(!t.once||!has(s,`talk:${p}:${t.id}`))&&(t.id!=='return-bag'||(!!s.items.toolbag&&!has(s,'bag-returned')))&&(t.id!=='fish'||!!s.items.fish)&&(t.id!=='key'||!has(s,'key'))&&!(p==='theo'&&t.id==='bag'&&(!!s.items.toolbag||has(s,'bag-returned')))&&!(p==='june'&&t.id==='tools'&&!!s.items.toolkit)&&!(p==='elena'&&t.id==='hours'&&has(s,'garden-agreed'))).filter(t=>!(p==='luis'&&['snack','water','packed-snack'].includes(t.id)&&s.scene!=='grocery')&&!(p==='theo'&&['bag','fish'].includes(t.id)&&s.scene!=='cafe')).map(t=>currentTopic(s,p,t))}
export function validateQuestion(s:Save,a:Action){
 requireState(a.expected_version===s.version,'VERSION_CONFLICT');requireState(a.scene===s.scene&&walkable(worldWithFlags(s.flags),s.scene,a.position),'INVALID_POSITION');requireState(!s.activeChallenge&&!battleLocksWorld(s),'CHALLENGE_ACTIVE');const e=entityAt(s.scene,a.target);requireState(e?.person&&s.known.includes(e.person),'INTRODUCE_FIRST');requireState(presentEntity(s,e!),'PERSON_AWAY');requireState(Math.hypot(a.position.x+8-observedActor(e!,a.actorPosition).x,a.position.y+6-observedActor(e!,a.actorPosition).y)<=75,'TOO_FAR');const text=(a.payload as {text?:unknown})?.text;requireState(typeof text==='string'&&text.trim().length>0&&text.length<=400,'INVALID_QUESTION');return {person:e!.person!,question:(text as string).trim()};
}
export type DialogueResolution={topic:string|null;reply:Words};
export function applyAction(before:Save,a:Action,resolution?:DialogueResolution,spatialWorld:World=worldWithFlags(before.flags),relationshipClock:(s:Save)=>number=townMinutes):{head:Save;text:Words}{
 requireState(a.expected_version===before.version,'VERSION_CONFLICT');requireState(a.scene===before.scene,'WRONG_SCENE');requireState(walkable(spatialWorld,before.scene,a.position),'INVALID_POSITION');
 if(!a.action.startsWith('battle-')&&a.action!=='snack-eat')requireState(!battleLocksWorld(before),'BATTLE_ACTIVE');
 if(a.action==='ask'){const {person,question}=validateQuestion(before,a);requireState(resolution,'DIALOGUE_RESOLUTION_REQUIRED');if(resolution!.topic){requireState(!growthTopicIds.includes(resolution!.topic)&&resolution!.topic!=='neighbor-chat'&&!priestChoiceTopicIds.includes(resolution!.topic),'RELATIONSHIP_EXPLICIT_ACTION_REQUIRED');const result=applyAction(before,{...a,action:'talk:'+resolution!.topic},undefined,spatialWorld,relationshipClock);result.head.history.at(-1)!.question=question;flag(result.head,'free-dialogue-experienced');return result}const next=structuredClone(before);flag(next,'free-dialogue-experienced');next.position={...a.position};next.version++;next.cursor++;next.history.push({id:a.action_id,kind:'talk',person,question,text:resolution!.reply});next.history=next.history.slice(-500);return {head:next,text:resolution!.reply};}
 const s=structuredClone(before);const relationshipMinute=relationshipClock(s);requireState(relationshipMinute===townMinutes(s),'RELATIONSHIP_CLOCK_NOT_COMMITTED');s.position={...a.position};let text:Words=['完成了。','Done.'];const e=entityAt(s.scene,a.target);
 if(a.action.startsWith('battle-')||a.action==='snack-eat'){text=applyBattle(s,a)}
 else if(a.action==='travel-map'){requireState(!s.activeChallenge,'CHALLENGE_ACTIVE');const route=mapRoute(s,a.target,true);requireState(!route.failure,route.failure??'TRAVEL_ROUTE_UNAVAILABLE');s.scene=a.target;s.position={...rooms[a.target].spawn};text=['你沿熟悉的路抵达目的地。','You follow the familiar route back.'];}
 else if(a.action==='challenge-finish'){
  requireState(s.activeChallenge?.id===a.target,'CHALLENGE_MISMATCH');const active=s.activeChallenge!;const p=a.payload as {runs?:InputRun[];solution?:number[];fishing?:FishingRun[];withdraw?:boolean};requireState(p&&typeof p==='object','INVALID_RESULT');
  if(p.withdraw){text=['你停了下来，可以准备好后再试。','You stop for now. You can try again whenever you like.'];}
  else if(['sparring','footwork','endurance'].includes(active.kind)){
   const result=replayEncounter(encounterPresets[active.kind],p.runs!);requireState(result.result!=='playing','CHALLENGE_NOT_FINISHED');text=result.result==='won'?['练习完成。教练碰了碰你的手套：“比刚才稳多了。”','Practice complete. The coach taps your glove. “Steadier already.”']:['教练收手，让你喘口气。“先看动作，准备好了再来。”','The coach steps back. “Take a breath. Watch the movement next time.”'];
   if(result.result==='won'&&!has(s,'challenge:'+active.kind)){flag(s,'challenge:'+active.kind);s.standing+=2;relate(s,'idris',2)}
  }else if(active.kind==='repair'){
   requireState(JSON.stringify(p.solution)==='[1,3,2]','PUZZLE_NOT_SOLVED');flag(s,'terrace-fixed');s.standing+=3;text=['灯亮了。西奥把一杯咖啡放在你面前，冲你举起杯子。','The lantern lights up. Theo sets a coffee down for you and raises his own cup.'];
  }else if(active.kind==='map'){
   requireState(JSON.stringify(p.solution)==='[0,1,2,3]','PUZZLE_NOT_SOLVED');flag(s,'alternative-route');give(s,'route');text=['小路连起来了。它从气象站下方绕到海边，不经过私人庭院。','The trail comes together. It runs below the weather station to the coast, clear of the private garden.'];
  }else if(active.kind==='fishing'){const result=replayFishing(p.fishing!);requireState(result.result!=='playing','CHALLENGE_NOT_FINISHED');if(result.result==='caught'){give(s,'fish');s.energy=Math.max(0,s.energy-2);relate(s,'ruth',1);text=['鱼进了桶。露丝点点头：拿去咖啡馆，或者留着当晚饭。','The fish lands in the bucket. Ruth nods. Take it to the café, or keep it for supper.']}else text=['鱼游走了。露丝递给你一杯水，下次还可以再试。','The fish slips away. Ruth offers you water. There is always another try.']}
  delete s.activeChallenge;
 }else if(e?.animalId){
  requireState(!s.activeChallenge,'CHALLENGE_ACTIVE');const result=gameAnimalInteraction(before,a,spatialWorld);s.animalsV1=result.memory;text=result.text;
 }else{
  requireState(!s.activeChallenge,'CHALLENGE_ACTIVE');requireState(e,'UNKNOWN_TARGET');requireState(presentEntity(s,e!),'PERSON_AWAY');requireState(Math.hypot(s.position.x+8-observedActor(e!,a.actorPosition).x,s.position.y+6-observedActor(e!,a.actorPosition).y)<=75,'TOO_FAR');
  if(a.action==='travel'){
   requireState(e!.kind==='portal','NOT_A_DOOR');const dest=e!.destination!;
   const denied=entranceFailure(s,dest);requireState(!denied,denied??'TRAVEL_ROUTE_UNAVAILABLE');
   s.scene=dest;const returnEntrance=rooms[dest].entities.find(portal=>portal.kind==='portal'&&portal.destination===before.scene);s.position={...(returnEntrance?.approach??rooms[dest].spawn)};if(!s.visited.includes(dest))s.visited.push(dest);if(dest==='chapel')flag(s,'chapel:visited');text=[`你来到${s.fieldNotes?.rooms.find(r=>r.id===dest)?.title[0]??rooms[dest].title[0]}。`,`You arrive at ${s.fieldNotes?.rooms.find(r=>r.id===dest)?.title[1]??rooms[dest].title[1]}.`];
  }else if(a.action==='introduce'){
   requireState(e!.person,'NOT_A_PERSON');requireState(!s.known.includes(e!.person!),'ALREADY_INTRODUCED');s.known.push(e!.person!);recordRelationshipMeeting(s,e!.person!,relationshipMinute);text=people[e!.person!].intro;
  }else if(a.action.startsWith('talk:')){
   const person=e!.person!;requireState(person&&s.known.includes(person),'INTRODUCE_FIRST');const topic=availableTopics(s,person).find(t=>t.id===a.action.slice(5));requireState(topic,'TOPIC_UNAVAILABLE');text=topic!.reply;
   switch(person+':'+topic!.id){case 'mara:key':flag(s,'key');give(s,'key');break;case 'mara:return-bag':take(s,'toolbag');flag(s,'bag-returned');relate(s,'mara',3);break;case 'theo:bag':give(s,'toolbag');break;case 'theo:fish':take(s,'fish');s.cash+=6;break;case 'june:tools':give(s,'toolkit');break;case 'nell:photo':give(s,'photo');break;case 'elena:hours':flag(s,'garden-agreed');relate(s,'elena',2);break;case 'luis:packed-snack':requireState(s.cash>=4,'NOT_ENOUGH_CASH');s.cash-=4;give(s,'packed-snack');break;case 'luis:snack':requireState(s.cash>=4,'NOT_ENOUGH_CASH');s.cash-=4;s.energy=Math.min(100,s.energy+30);break;case 'luis:water':s.energy=Math.min(100,s.energy+10);break;}
   applyNeighborTopic(s,person,topic!.id);applyPriestTopic(s,person,topic!.id);applyGrowthTopic(s,person,topic!.id,relationshipMinute);applyBattleTopic(s,person,topic!.id);applyNextTopic(s,person,topic!.id);applyNomadTopic(s,person,topic!.id);applyLifeTopic(s,person,topic!.id);applyNewsTopic(s,person,topic!.id);if(topic!.once)flag(s,`talk:${person}:${topic!.id}`);
  }else if(a.action.startsWith('relationship-observe:')){
   text=applyGrowthObservation(s,e!.id,a.action.slice('relationship-observe:'.length),relationshipMinute);
  }else if((cropVerbs.includes(a.action)||shopVerbs.includes(a.action))&&e!.actions?.includes(a.action)){
   text=applyCrop(s,e!.id,a.action);if(a.action==='water-crop'||a.action==='harvest-crop'||a.action.startsWith('plant:')){advanceAwake(s,10);advanceTown(s,10)}
  }else if(a.action.startsWith('neighbor-')){
   requireState(e!.actions?.includes(a.action),'ACTION_UNAVAILABLE');text=applyNeighborAction(s,a.action);
  }else if(a.action.startsWith('chapel-')){
   requireState(e!.actions?.includes(a.action),'ACTION_UNAVAILABLE');text=applyChapelAction(s,a.action);
  }else if(a.action.startsWith('challenge-start:')){
   requireState(!s.turnBattle,'BATTLE_EXISTS');const kind=a.action.slice(16);requireState((e!.person==='idris'&&s.scene==='gym'&&['sparring','footwork','endurance'].includes(kind))||(e!.person==='ruth'&&s.scene==='dock'&&kind==='fishing')||(e!.id==='terrace'&&kind==='repair'&&!has(s,'terrace-fixed'))||(e!.id==='old-map'&&kind==='map'&&!has(s,'alternative-route')),'CHALLENGE_UNAVAILABLE');
   if(['sparring','footwork','endurance','fishing'].includes(kind))requireState(s.energy>=10,'REST_NEEDED');
   if(e!.person)requireState(s.known.includes(e!.person),'INTRODUCE_FIRST');s.activeChallenge={id:a.action_id,kind,scene:s.scene};text=['准备好了就开始，也可以随时退出。','Start when you’re ready. You can leave at any time.'];
  }else{
   requireState(e!.actions?.includes(a.action),'ACTION_UNAVAILABLE');requireState(!has(s,a.action),'ALREADY_DONE');
   switch(a.action){
    case 'unpack':requireState(has(s,'key'),'KEY_NEEDED');flag(s,'unpacked');text=['行李放到了床边。窗外有杯碟碰响。房间是你的了——可以去看看小镇。','Your bag rests beside the bed. Cups clink somewhere outside. The room is yours. Time to see a little of town.'];break;
    case 'sleep':s.energy=100;s.awakeMinutes=0;text=['一觉醒来，窗外又有了晨光。今天可以慢慢开始。','You wake to morning light. There is room to start slowly today.'];break;
    case 'water-fern':requireState(s.fernStartedAt===undefined,'ALREADY_DONE');s.fernStartedAt=townMinutes(s);text=['水渗进土里，小叶轻轻晃了晃。几个小时后再来看，不必守着它。','Water sinks into the soil. A small frond trembles. Come back in a few hours; you needn’t stay and watch.'];break;
    case 'rest':s.energy=100;s.awakeMinutes=Math.max(0,(s.awakeMinutes??0)-360);text=['你睡了一小觉。窗外的光变了，体力也恢复了。','You take a nap. The light outside has shifted, and your energy returns.'];break;
    case 'read-market':flag(s,'market-known');text=has(s,'route-open')?['夏日集市正在等通行安排的消息。路线已经准备好了，可以把好消息告诉大家。','The summer market is waiting for news of access. Your route is ready; you can share the good news.']:hasCoastRoute(s)?['集市需要安全的海岸通路。你已经找到可行的路线，去灯塔确认安排后就能来报信。','The market needs safe coast access. You already have a workable route; confirm the arrangements at the lighthouse, then bring the news.']:['告示说夏日集市缺少通往海边的安全路线。桥坏了，私人庭院也不能默认借道。你决定先去看看。','The notice says the summer market needs safe access to the coast. The bridge is damaged, and the private garden isn’t a public shortcut. Worth a look.'];break;
    case 'inspect-bridge':flag(s,'bridge-seen');text=['两块桥板断了，下面的支撑还很牢。可以修，也可以找别的路。','Two boards have split. The supports below are sound. You could repair it—or find another route.'];break;
    case 'gather-wood':requireState(!has(s,'wood-collected'),'ALREADY_DONE');give(s,'wood',2);flag(s,'wood-collected');text=['你挑出两块结实的木板，避开了已经朽烂的部分。','You pick out two sound planks, leaving the rotten wood behind.'];break;
    case 'repair-bridge':requireState(has(s,'bridge-seen')&&s.items.toolkit&&s.items.wood>=2,'BRIDGE_REQUIREMENTS');requireState(s.energy>=10,'REST_NEEDED');take(s,'wood',2);s.energy-=10;flag(s,'bridge-fixed');s.standing+=5;text=['新桥板固定好了。你试着踩上去，木头稳稳承住你的重量。','The new boards hold. You test your weight on them; the bridge stays steady.'];break;
    case 'inspect-garden':text=has(s,'garden-agreed')?['便条已经写上约定的上午十点到十二点。院子仍是住户的家，其他时间请走公共路线。','The note now shows the agreed hours, ten until noon. The garden is still a home; use a public route outside those hours.']:['便条写着：请先敲门。这是住户的家，不是公共通道。','The note says: Please knock. This is someone’s home, not a public passage.'];break;
    case 'read-weather':flag(s,'weather-read');text=has(s,'alternative-route')?['记录本上的小路与你已经拼好的路线吻合：从气象站下方通往海边。','The log matches the trail you already mapped: below the weather station and down to the coast.']:['记录本标着一条避开私人院子的旧路。完整路线可能在营地的旧图上。','The log marks an old trail clear of the private garden. The camp map may show the rest.'];break;
    case 'open-route':requireState(has(s,'bridge-fixed')||has(s,'alternative-route')||has(s,'garden-agreed'),'ROUTE_NOT_READY');flag(s,'route-open');flag(s,has(s,'bridge-fixed')?'route-choice:bridge':has(s,'alternative-route')?'route-choice:trail':'route-choice:garden');s.standing+=4;text=has(s,'bridge-fixed')?['桥边的封闭牌摘下了。新路既方便，也保住了住户的安静。','The closure sign comes down by the bridge. Access is restored, and the residents keep their quiet.']:has(s,'alternative-route')?['指路牌转向了山坡的公共小路。远一点，但大家都能自在地走。','The sign now points along the public hillside trail. A little longer, but open to everyone.']:['入口清楚写下上午十点到十二点的借道时间。庭院的边界保留着。','The entrance clearly states the agreed hours: ten until noon. The garden remains a home.'];break;
    case 'open-market':requireState(has(s,'route-open')&&has(s,'market-known'),'ROUTE_NOT_READY');flag(s,'market-open');s.standing+=8;text=['摊位支起来了，海岸那边传来笑声。你没有解决镇上所有的问题，却已经在这里留下了自己的痕迹。这个夏天还长。','Stalls unfold, and laughter carries up from the coast. You haven’t solved every problem in town. But you’ve left a mark. There’s still a whole summer ahead.'];break;
    default:throw Error('ACTION_UNAVAILABLE');
   }
   if(!['rest','sleep'].includes(a.action))flag(s,a.action);
  }
 }
 recordRelationshipStory(before,s,relationshipMinute);
 if((a.action==='travel'||a.action==='travel-map')&&s.scene!==before.scene){const minutes=before.movingClock?(a.action==='travel-map'?longTravelMinutes(before.scene,s.scene):0):20;advanceAwake(s,minutes);advanceTown(s,minutes)}if(s.movingClock&&a.action!=='ask')delete s.movingClock.lease;if(a.action==='rest')advanceTown(s,180);if(a.action==='sleep')sleepToMorning(s);
 recordNeighborProgress(s);s.energy=Math.max(0,Math.min(100,s.energy));s.cash=Math.max(0,Math.min(999,s.cash));s.standing=Math.max(0,Math.min(100,s.standing));s.version++;s.cursor++;s.history.push({id:a.action_id,kind:a.action.startsWith('talk:')||a.action==='introduce'?'talk':'action',...(e?.person?{person:e.person}:{}),text});s.history=s.history.slice(-500);return {head:s,text};
}
