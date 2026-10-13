import {neighborPartyActive,type NeighborChapter} from './neighbor-gathering';
import {chapelPriest,chapelPriestId,chapelPriestRoutes} from './chapel-priest';
import {techRoutes,nomadSchedule,nomadActivity,techNomadAdmitted} from './tech-nomads';
import {nextRoutes,nextResidents} from './next-residents';
import type {NewsState} from '../story/news-edition';
import type {Words,Entity} from './data';
export type TownState={neighborChapterV1?:NeighborChapter;neighborPartyEnabled?:boolean;townMinutes?:number;scene:string;flags:string[];known:string[];relations:Record<string,number>};
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
 avery:{name:['艾弗里','Avery Reed'],unknown:['翻着速写本的居民','Resident with a sketchbook'],intro:['“艾弗里。今天不送包裹，轮到我慢慢看街上了。”对方把一页没画完的小船压在本子里。','“Avery. No parcels today. My turn to look around slowly.” They tuck an unfinished drawing of a boat into a notebook.'],art:'avery'},
 samira:{name:['萨米拉','Samira Bell'],unknown:['轻轻哼歌的居民','Resident humming softly'],intro:['“萨米拉，我在学校食堂做饭。今天不用听打饭铃。”她笑了一下，又把刚才哼到一半的调子咽回去。','“Samira. I cook at the school. No lunch bell today.” She smiles, then swallows the tune she was humming.'],art:'samira'},
 owen:{name:['欧文','Owen Price'],unknown:['侧耳听海鸟的居民','Resident listening for birds'],intro:['“欧文。以前修公交车，现在练习分清海鸟的叫声。两样都得先听，别急着拆。”','“Owen. Used to repair buses. Now I try to tell seabirds apart. Both start with listening, before taking anything to pieces.”'],art:'owen'},
 dani:{name:['丹妮','Dani Costa'],unknown:['收好一片叶子的居民','Resident saving a fallen leaf'],intro:['“丹妮，在图书馆工作。我想做本小册子，收一点街坊种花的故事。今天这页只有一片叶子，也挺好。”','“Dani. I work at the library. I’m making a little book of neighbors’ garden stories. Today’s page has just one leaf. That’s fine too.”'],art:'dani'},
};
export const residentRoutes:Record<string,{scene:string;at:{x:number;y:number}}[]>={...nextRoutes,...techRoutes,...chapelPriestRoutes,
 mara:[{scene:'station',at:{x:565,y:685}},{scene:'courtyard',at:{x:365,y:500}},{scene:'market',at:{x:560,y:650}}],
 theo:[{scene:'cafe',at:{x:579,y:330}},{scene:'cafe',at:{x:579,y:330}},{scene:'harbor',at:{x:500,y:640}}],
 june:[{scene:'workshop',at:{x:510,y:358}},{scene:'workshop',at:{x:510,y:358}},{scene:'dock',at:{x:370,y:490}}],
 idris:[{scene:'gym',at:{x:443,y:380}},{scene:'gym',at:{x:443,y:380}},{scene:'coast',at:{x:670,y:580}}],
 luis:[{scene:'grocery',at:{x:552,y:376}},{scene:'grocery',at:{x:552,y:376}},{scene:'market',at:{x:690,y:650}}],
 nell:[{scene:'secondhand',at:{x:510,y:380}},{scene:'secondhand',at:{x:510,y:380}},{scene:'courtyard',at:{x:350,y:500}}],
 ruth:[{scene:'dock',at:{x:390,y:350}},{scene:'dock',at:{x:390,y:350}},{scene:'coast',at:{x:520,y:650}}],
 elena:[{scene:'courtyard',at:{x:495,y:370}},{scene:'garden',at:{x:535,y:510}},{scene:'courtyard',at:{x:495,y:370}}],
 arthur:[{scene:'weather',at:{x:510,y:365}},{scene:'weather',at:{x:510,y:365}},{scene:'hill',at:{x:700,y:620}}],
 avery:[{scene:'station',at:{x:520,y:490}},{scene:'market',at:{x:650,y:520}},{scene:'dock',at:{x:560,y:450}}],
 samira:[{scene:'market',at:{x:550,y:430}},{scene:'chapel',at:{x:600,y:400}},{scene:'dock',at:{x:505,y:450}}],
 owen:[{scene:'harbor',at:{x:680,y:540}},{scene:'path',at:{x:360,y:480}},{scene:'coast',at:{x:600,y:600}}],
 dani:[{scene:'garden',at:{x:430,y:510}},{scene:'chapel',at:{x:355,y:405}},{scene:'courtyard',at:{x:540,y:480}}],
};
export function residentHere(s:Pick<TownState,'townMinutes'>&{flags?:string[];scene?:string;neighborChapterV1?:NeighborChapter;neighborPartyEnabled?:boolean},person:string,scene:string){if(neighborPartyActive(s)&&s.neighborChapterV1?.party?.people.includes(person))return s.neighborChapterV1.party.scene===scene;const nomad=nomadSchedule(person,s);if(nomad)return nomad.scene===scene;if(person==='mara'&&s.flags&&!s.flags.includes('bag-returned'))return scene==='station';const route=residentRoutes[person];return !route||route[['morning','afternoon','evening'].indexOf(townPeriod(s))]?.scene===scene}
export function presentEntity(s:Pick<TownState,'townMinutes'|'scene'|'neighborChapterV1'|'neighborPartyEnabled'>&{flags?:string[]},e:Entity){const party=neighborPartyActive(s)&&s.neighborChapterV1?.party,guest=!!party&&!!e.person&&party.people.includes(e.person);if(e.gatheringRole==='guest')return guest&&party.scene===s.scene;if(guest)return e.gatheringRole==='routine'&&party.scene===s.scene;return !e.person||techNomadAdmitted(e.person)&&residentHere(s,e.person,s.scene)}
const activities:Record<string,Words[]>={
 avery:[['艾弗里在树荫下补画一扇窗，不时抬头看看街道。','Avery sketches a window in the shade, glancing up at the street.'],['艾弗里把速写本翻到空白页，看人们经过。','Avery turns to a blank page and watches people passing.'],['艾弗里看着水上的船，今天不必画完。','Avery watches the boats. The drawing need not be finished today.']],
 samira:[['萨米拉看了看蔬菜，又轻声哼起刚才的调子。','Samira looks over the vegetables and hums another few notes.'],['萨米拉走到海风里，手指轻轻打着拍子。','Samira steps into the sea breeze, tapping a gentle rhythm.'],['萨米拉在码头听水声，偶尔接上一小句歌。','Samira listens to the water, adding the occasional line of a song.']],
 owen:[['欧文在分辨头顶两种不同的鸟叫。','Owen listens for two different calls overhead.'],['欧文停在路边，让一只小鸟先过去。','Owen pauses at the path edge to let a small bird pass.'],['欧文合上记录本，最后看了一眼海面。','Owen closes his notebook and takes one last look at the sea.']],
 dani:[['丹妮把落叶夹进本子，没有摘下还活着的叶子。','Dani presses a fallen leaf into the book, leaving living leaves alone.'],['丹妮在旧街记下刚刚听到的一个小故事。','Dani writes down a small story heard along Market Lane.'],['丹妮在院子里小声说话，留出住户休息的安静。','Dani speaks softly in the courtyard, leaving room for the residents’ quiet.']],
};
export function residentActivity(s:Pick<TownState,'townMinutes'>&NewsState&{scene?:string;flags?:string[];known?:string[];neighborChapterV1?:NeighborChapter},person:string):Words|undefined{if(neighborPartyActive(s)&&s.neighborChapterV1?.party?.people.includes(person))return ['对方在你们留出的位置稍作停留，想听听今天的小事。','They pause in the space you made together, ready to hear about your day.'];const nomad=nomadSchedule(person,s);if(nomad&&nomad.scene===s.scene)return nomadActivity(person,s);const added=nextResidents.find(p=>p.id===person);if(added&&residentHere(s,person,s.scene??''))return added.activity;if(person===chapelPriestId)return residentHere(s,person,s.scene??'')?chapelPriest.activities[['morning','afternoon','evening'].indexOf(townPeriod(s))]:undefined;if(s.scene==='chapel'&&residentHere(s,person,'chapel'))return person==='dani'?['她在书桌旁给下一个邻居留出空位。','She leaves room by the book table for the next neighbor.']:['她低声试着衔接几句小调，没有办成演出。','She softly joins a few lines, without turning them into a performance.'];if(person==='dani'&&s.flags?.includes('news:checked')&&s.newsEdition?.template==='finance-budget-v1')return ['丹妮把你核对过的预算便条留在花园告示处，保留了$3备用的建议。','Dani keeps your checked budget note at the garden noticeboard, including the suggestion to keep $3 in reserve.'];if(person==='dani'&&s.flags?.includes('news:checked'))return ['丹妮把你核对过的营业便条留在本子里，另抄了一份贴在花园告示板上。','Dani keeps your checked hours in the notebook, with a copy on the garden noticeboard.'];const specific=activities[person]?.[['morning','afternoon','evening'].indexOf(townPeriod(s))];if(specific)return specific;if(!residentRoutes[person])return;return ['对方停下手里的事，转身听你说话。','They pause what they are doing and turn to listen.']}
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
