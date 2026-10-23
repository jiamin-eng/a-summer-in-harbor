import {neighborPartyActive,type NeighborChapter} from './neighbor-gathering';
import {chapelPriest,chapelPriestId,chapelPriestRoutes} from './chapel-priest';
import {techRoutes,nomadSchedule,nomadActivity,techNomadAdmitted} from './tech-nomads';
import {nextRoutes,nextResidents} from './next-residents';
import {bindHarborLoop,harborLoopIds,harborLoopScene} from '../npc/harbor-cast';
import {harborAnchors,harborDoings,harborResidents} from '../npc/harbor-residents';
import type {NewsState} from '../story/news-edition';
import type {Words,Entity} from './data';
export type TownState={neighborChapterV1?:NeighborChapter;neighborPartyEnabled?:boolean;townMinutes?:number;scene:string;flags:string[];known:string[];relations:Record<string,number>;npcLoopV1?:import('../npc/town').NpcTownState};
export const townMinutes=(s:Pick<TownState,'townMinutes'>)=>s.townMinutes??540;
export type TownPeriod='morning'|'afternoon'|'evening'|'night';
export function townPeriod(s:Pick<TownState,'townMinutes'>):TownPeriod{const m=townMinutes(s)%1440;return m<360||m>=1260?'night':m<720?'morning':m<1020?'afternoon':'evening'}
export function townTimeLabel(s:Pick<TownState,'townMinutes'>):Words{const m=townMinutes(s),day=Math.floor(m/1440)+1,period=townPeriod(s);const names={morning:['上午','Morning'],afternoon:['午后','Afternoon'],evening:['傍晚','Evening'],night:['夜间','Night']};const time=String(Math.floor(m%1440/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');return [`第${day}天 · ${names[period][0]} ${time}`,`Day ${day} · ${names[period][1]} ${time}`]}
/** Only committed actions call this. No wall clock, offline catch-up or model timer. */
export function advanceTown(s:Pick<TownState,'townMinutes'>,minutes:number){if(!Number.isSafeInteger(minutes)||minutes<0||minutes>1440)throw Error('INVALID_TIME_ADVANCE');const next=townMinutes(s)+minutes;if(!Number.isSafeInteger(next))throw Error('INVALID_TOWN_TIME');s.townMinutes=next}
export function sleepToMorning(s:Pick<TownState,'townMinutes'>){const m=townMinutes(s),minute=m%1440;advanceTown(s,minute<540?540-minute:1980-minute)}
export type PlantState={townMinutes?:number;fernStartedAt?:number};
export function fernStage(s:PlantState){return s.fernStartedAt===undefined?'young':townMinutes(s)-s.fernStartedAt>=1440?'grown':townMinutes(s)-s.fernStartedAt>=360?'unfurling':'young'}
export function fernDescription(s:PlantState):Words{return s.fernStartedAt===undefined?['一株小蕨刚种下，叶尖还卷着。旁边留着水壶，你可以帮它浇第一次水。','A newly planted fern has curled tips. A watering can stands nearby. You could give it its first drink.']:fernStage(s)==='grown'?['新叶已经完全展开。昨天还是卷着的叶尖，如今在风里轻轻摇动。','The new fronds have opened. Yesterday’s curled tips now sway in the breeze.']:fernStage(s)==='unfurling'?['几小时过去，卷着的叶尖正在舒展开。再过一夜，还会长大一些。','After a few hours, the curled tips are opening. Another night will give them room to grow.']:['土已经湿润，小叶还卷着。过些游戏时间再回来看看吧，不必守在这里。','The soil is damp; the tips are still curled. Come back after spending some time in town. There is no need to wait here.']}
// Dedicated resident art families; generation provenance and local QA: doc/residents-art-20261004.
export const residentPeople:Record<string,{name:Words;unknown:Words;intro:Words;art:string}>={
 avery:{name:['艾弗里','Avery Reed'],unknown:['刚到海湾的居民','Resident newly arrived'],intro:['“艾弗里。我刚到，想先做成一件能和别人一起做的事，再谈留下。”','“Avery. I just arrived. I want one real piece of work with someone else before I talk about staying.”'],art:'avery'},
 samira:{name:['萨米拉','Samira Bell'],unknown:['看着收成的居民','Resident watching a harvest'],intro:['“萨米拉。地里有一批快过期的收成。我想卖出去，也想有一条能做下去的销路。”','“Samira. A harvest is about to turn. I want it sold, and I want a way to keep selling.”'],art:'samira'},
 owen:{name:['欧文','Owen Price'],unknown:['张罗工坊材料的居民','Resident gathering workshop material'],intro:['“欧文。我在攒工坊扩建的材料。东西够了，事情才由我自己排。”','“Owen. I’m gathering material to expand the workshop. Once I have it, I can set the work myself.”'],art:'owen'},
 dani:{name:['丹妮','Dani Costa'],unknown:['跑交付的居民','Resident carrying a delivery'],intro:['“丹妮。我把别人的货按时送到。大家还愿意经过我，我才站得住。”','“Dani. I get other people’s goods there on time. I keep my place only while they still come through me.”'],art:'dani'},
};
const harborPlaces=harborAnchors();
export const residentRoutes:Record<string,{scene:string;at:{x:number;y:number}}[]>={...nextRoutes,...techRoutes,...chapelPriestRoutes,
 gabriel:harborPlaces.gabriel,
 mara:harborPlaces.mara,
 theo:harborPlaces.theo,
 june:harborPlaces.june,
 idris:harborPlaces.idris,
 luis:harborPlaces.luis,
 nell:harborPlaces.nell,
 ruth:harborPlaces.ruth,
 elena:[{scene:'courtyard',at:{x:495,y:370}},{scene:'garden',at:{x:535,y:510}},{scene:'courtyard',at:{x:495,y:370}}],
 arthur:[{scene:'weather',at:{x:510,y:365}},{scene:'weather',at:{x:510,y:365}},{scene:'hill',at:{x:700,y:620}}],
 avery:harborPlaces.avery,
 samira:harborPlaces.samira,
 owen:harborPlaces.owen,
 dani:harborPlaces.dani,
};
export function residentHere(s:Pick<TownState,'townMinutes'|'npcLoopV1'>&{flags?:string[];scene?:string;neighborChapterV1?:NeighborChapter;neighborPartyEnabled?:boolean},person:string,scene:string){if(neighborPartyActive(s)&&s.neighborChapterV1?.party?.people.includes(person))return s.neighborChapterV1.party.scene===scene;const nomad=nomadSchedule(person,s);if(nomad)return nomad.scene===scene;if(person==='mara'&&s.flags&&!s.flags.includes('bag-returned'))return scene==='station';if(harborLoopIds.includes(person)){if(townPeriod(s)==='night')return false;const lived=s.npcLoopV1?.residents.find(r=>r.id===person);return (lived?lived.scene:harborLoopScene(person,townMinutes(s)))===scene}const route=residentRoutes[person];return !route||route[['morning','afternoon','evening'].indexOf(townPeriod(s))]?.scene===scene}
export function presentEntity(s:Pick<TownState,'townMinutes'|'npcLoopV1'|'scene'|'neighborChapterV1'|'neighborPartyEnabled'>&{flags?:string[]},e:Entity){const party=neighborPartyActive(s)&&s.neighborChapterV1?.party,guest=!!party&&!!e.person&&party.people.includes(e.person);if(e.gatheringRole==='guest')return guest&&party.scene===s.scene;if(guest)return e.gatheringRole==='routine'&&party.scene===s.scene;return !e.person||techNomadAdmitted(e.person)&&residentHere(s,e.person,s.scene)}
const sandboxAims:Record<string,Words>=harborDoings();
export function residentActivity(s:Pick<TownState,'townMinutes'|'npcLoopV1'>&NewsState&{scene?:string;flags?:string[];known?:string[];neighborChapterV1?:NeighborChapter},person:string):Words|undefined{if(neighborPartyActive(s)&&s.neighborChapterV1?.party?.people.includes(person))return ['对方在你们留出的位置稍作停留，想听听今天的小事。','They pause in the space you made together, ready to hear about your day.'];const nomad=nomadSchedule(person,s);if(nomad&&nomad.scene===s.scene)return nomadActivity(person,s);const added=nextResidents.find(p=>p.id===person);if(added&&residentHere(s,person,s.scene??''))return added.activity;if(harborLoopIds.includes(person)){const resident=s.npcLoopV1?.residents.find(r=>r.id===person);return resident?.doing??sandboxAims[person]}if(person===chapelPriestId)return residentHere(s,person,s.scene??'')?chapelPriest.activities[['morning','afternoon','evening'].indexOf(townPeriod(s))]:undefined;if(s.scene==='chapel'&&residentHere(s,person,'chapel'))return ['她低声试着衔接几句小调，没有办成演出。','She softly joins a few lines, without turning them into a performance.'];if(person==='dani'&&s.flags?.includes('news:checked')&&s.newsEdition?.template==='finance-budget-v1')return ['丹妮把你核对过的预算便条留在花园告示处，保留了$3备用的建议。','Dani keeps your checked budget note at the garden noticeboard, including the suggestion to keep $3 in reserve.'];if(person==='dani'&&s.flags?.includes('news:checked'))return ['丹妮把你核对过的营业便条留在本子里，另抄了一份贴在花园告示板上。','Dani keeps your checked hours in the notebook, with a copy on the garden noticeboard.'];if(!residentRoutes[person])return;return ['对方停下手里的事，转身听你说话。','They pause what they are doing and turn to listen.']}
export const shopScenes=['cafe','grocery','workshop','gym','secondhand'];
export function openingNotice(scene:string,s:Pick<TownState,'townMinutes'>):Words|undefined{if(!shopScenes.includes(scene))return;const open=['morning','afternoon'].includes(townPeriod(s));return open?['营业至17:00。傍晚店主外出，明早06:00回来。','Open until 17:00. The owner goes out in the evening and returns at 06:00.']:['店主已休息，明早06:00恢复营业。可以先回家睡到09:00，再来办事。','The owner is away. Business resumes at 06:00. Sleep at home until 09:00 and return.']}

export const oldLife:Record<string,{label:Words;reply:Words}>={
 mara:{label:['你休息时喜欢做什么？','What do you enjoy on a day off?'],reply:['“沿街看谁家的窗台添了新花。以前总想给人提建议，现在学会只说好看了。”','“Looking for new flowers on the windowsills. I used to offer advice. Now I mostly say they look lovely.”']},
 theo:{label:['下班后还想喝咖啡吗？','Do you want coffee after work?'],reply:['“想喝别人泡的。最好不用我收杯子。我最近在学把面包烤得没那么硬。”','“Someone else’s coffee. Preferably without washing the cup. Lately I’m learning to bake bread that doesn’t fight back.”']},
 june:{label:['有什么东西你舍不得修掉痕迹？','Is there anything you leave worn?'],reply:['“我爸那把锤子的柄。凹痕刚好贴着手。不是所有旧东西都要恢复成新的。”','“The handle of Dad’s hammer. The dents fit my hand. Not everything old needs to look new.”']},
 idris:{label:['今天练习以外有什么打算？','Any plans outside practice?'],reply:['“给窗边那盆植物换土。我能记住所有步法，却总记不住上次什么时候浇了水。”','“Repotting the plant by my window. I remember every footwork drill, but never when I last watered it.”']},
 ruth:{label:['除了鱼，你还喜欢看什么？','What do you watch besides fish?'],reply:['“人的鞋。走到这儿还一尘不染的，多半只走了大路。鞋尖沾着草籽的，今天准有故事。”','“People’s shoes. Spotless ones stayed on the main road. Grass seeds on the toes usually mean a story.”']},
 luis:{label:['你自己最爱吃什么？','What do you cook for yourself?'],reply:['“卖剩的番茄煮汤。每锅都不一样。我会多做一碗，偶尔有邻居正好来坐坐。”','“Soup from the leftover tomatoes. Never the same twice. I make an extra bowl in case a neighbor drops in.”']},
 nell:{label:['你会留下哪些不卖的东西？','What do you keep off the shelves?'],reply:['“一张没人写字的明信片。每次要寄，又觉得应该亲口说。一直留到现在。”','“An unwritten postcard. Every time I mean to send it, I think I should say it in person. So it stays.”']},
 elena:{label:['种花让你最开心的是什么？','What do you enjoy about gardening?'],reply:['“不是开得最多那天。是新叶刚冒出来，只有你注意到那天。”','“Not the day with the most flowers. The day a new leaf appears and only you notice.”']},
 arthur:{label:['你也会有不记天气的一天吗？','Do you ever leave the weather unrecorded?'],reply:['“有。那天我只看云，不写数字。要不然一辈子都像还没下班。”','“Yes. I just watch the clouds that day. Otherwise it feels as if I never retired.”']},
};

/** A bounded authored stroll, shared by rendering, hitboxes and action admission.
 * Like player walking, the observed footpoint is checked against this corridor;
 * it cannot move a resident to another route, scene or schedule period. */
export function patrolRadius(person?:string){return person==='idris'?40:person&&residentRoutes[person]?24:0}
export function observedActor(e:Entity,point?:{x:number;y:number}){if(!point)return e.at;const r=patrolRadius(e.person);if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.abs(point.y-e.at.y)>.1||Math.abs(point.x-e.at.x)>r+.1)throw Error('INVALID_ACTOR_POSITION');return point}

/** An old save may stand where a newly added resident now appears. Move only the
 * resident within its authored corridor; never rewrite the player's saved spot. */
export function residentClearOfPlayer(e:Entity,current:{x:number;y:number},player:{x:number;y:number},size:{w:number;h:number},clear:(point:{x:number;y:number})=>boolean){
 const overlaps=(q:{x:number;y:number})=>player.x<q.x+9&&player.x+size.w>q.x-9&&player.y<q.y&&player.y+size.h>q.y-8;
 if(!e.person||!residentRoutes[e.person]||!overlaps(current))return current;
 const r=patrolRadius(e.person),ends=[{x:e.at.x-r,y:e.at.y},{x:e.at.x+r,y:e.at.y}].sort((a,b)=>Math.abs(a.x-current.x)-Math.abs(b.x-current.x));
 return ends.find(q=>!overlaps(q)&&clear(q))??current;
}

export function openingBadge(scene:string,s:Pick<TownState,'townMinutes'>):Words|undefined{if(!shopScenes.includes(scene))return;return ['morning','afternoon'].includes(townPeriod(s))?['营业至17:00','Open until 17:00']:['06:00恢复营业','Reopens 06:00']}

bindHarborLoop(harborResidents());
