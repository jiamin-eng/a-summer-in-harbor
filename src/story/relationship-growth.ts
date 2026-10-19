import {relationshipExpansionProfiles} from './relationship-expansion-profiles';
import {relationshipNextProfiles} from './relationship-next-profiles';
import type {Save} from './state';
import type {LifeTopic} from './resident-life';
import {people,rooms,type Words} from '../world/data';
import {residentHere,townMinutes} from '../world/residents';

export const RELATIONSHIP_RULES='relationships-v1.0' as const;
export const RELATIONSHIP_EXPANSION_RULES='relationship-expansion-v1.0' as const;
export const RELATIONSHIP_NEXT_RULES='relationship-dani-v1.0' as const;
export const relationshipPilotIds=['mara','avery','samira'] as const;
export const relationshipRuleVersion=(p:string)=>relationshipNextProfiles[p]?RELATIONSHIP_NEXT_RULES:relationshipExpansionProfiles[p]?RELATIONSHIP_EXPANSION_RULES:RELATIONSHIP_RULES;
export const stages=['stranger','acquaintance','familiar','trusted','close'] as const;
export type RelationshipStage=typeof stages[number];
export const stageNames:Record<RelationshipStage,Words>={stranger:['陌生','Stranger'],acquaintance:['相识','Acquainted'],familiar:['熟悉','Familiar'],trusted:['信任','Trusted'],close:['亲近','Close']};
type Kind='meet'|'greeting'|'personal'|'promise'|'experience'|'recall';
const storyInteractionIds=['story-toolbag','story-song'];
const interactionKind=(id:string):Kind=>id==='meet'?'meet':id==='rg-greet'?'greeting':['rg-personal','rg-private'].includes(id)?'personal':['rg-request','rg-fulfill','observe','story-toolbag'].includes(id)?'promise':id==='rg-recall'?'recall':'experience';
type Interaction={kind:Kind;minute:number};
type Memory={legacy:{relation:number;facts:string[]};days:number[];interactions:Record<string,Interaction>;lastId?:string;promise?:{acceptedAt:number;observedAt?:number;completedAt?:number};companyAt?:number;privateAt?:number};
type GrowthData={schema:1;migratedAt:number;residents:Record<string,Memory>};
export type RelationshipGrowth=GrowthData&{rules:typeof RELATIONSHIP_RULES};
export type RelationshipExpansion=GrowthData&{rules:typeof RELATIONSHIP_EXPANSION_RULES};
export type RelationshipNext=GrowthData&{rules:typeof RELATIONSHIP_NEXT_RULES};
export type RelationshipProfile={interest:Words;personal:Words;private:Words;request:Words;observation:Words;thanks:Words;observeScene:string;observeTarget:string;eventScene:string;company:Words;privateEvent:Words;recall:Words};
export const relationshipProfiles:Record<string,RelationshipProfile>={
 mara:{interest:['你看窗台时会留意什么？','What do you notice on the windowsills?'],personal:['“有人把旧杯子用来种花。我喜欢看那些不必买新的办法。你喜欢的东西，也可以慢慢告诉我。”','“People grow flowers in old cups. I like ways of caring without buying something new. You can tell me what you enjoy, in your own time.”'],private:['“以前我总觉得，不给人建议就算没帮忙。现在想试着先听。你不急着替我做决定，我很感激。”','“I used to think I hadn’t helped unless I gave advice. I’m learning to listen first. I appreciate that you don’t rush to decide for me.”'],request:['“帮我去山坡花园看看门边的便条好吗？先读清住户的意思，回来告诉我。不要替他们改时间。”','“Could you read the note by the Hillside Garden gate, then tell me what it says? Hear the residents first. Please don’t change their hours.”'],observation:['你读过门边的便条，记住院子是住户的家；通行时间以当前约定为准。','You read the gate note: the courtyard is a home. Any access follows the current agreement.'],thanks:['“你先读清楚，再回来告诉我。谢谢。我知道这次约定可以放心交给你。”','“You read it carefully and came back. Thank you. I knew what to expect, and you followed through.”'],observeScene:'garden',observeTarget:'gate-hours',eventScene:'station',company:['你和玛拉沿街看了看窗台。她指出一只旧茶杯里的新叶，没有替主人提建议。你们留下一件以后能聊起的小事。','You and Mara look at the windowsills. She notices a new leaf in an old teacup, without offering its owner advice. A small moment to remember together.'],privateEvent:['玛拉把钥匙握在掌心，聊起第一次借出房间时的不安。“现在有人回来和我说说今天，我就不只是在等钥匙了。”你们在街边停了一会儿。','Mara holds the keys and recalls feeling anxious the first time she let the room. “When someone comes back to tell me about their day, I’m not just waiting for keys.” You pause together by the street.'],recall:['“记得那片新叶，也记得你回来讲便条。我喜欢我们不必每次见面都先找一件差事。”','“I remember the new leaf, and your return with the gate note. I like that we don’t need an errand every time we meet.”']},
 avery:{interest:['为什么愿意留下没画完的地方？','Why leave part of a drawing unfinished?'],personal:['“以前送包裹总想着下一站。空白提醒我，这次可以多看一会儿。你喜欢慢慢看的东西呢？”','“On my delivery rounds, I always thought about the next stop. A blank space reminds me I can look longer this time. What do you like taking time over?”'],private:['“有时我怕停下来就不知道自己是谁了。和你坐着，不必马上画好，倒让我安心一点。”','“Sometimes I worry I won’t know who I am when I stop rushing. Sitting with you without finishing a drawing helps.”'],request:['“能去山坡营地看看桌上旧图的地名吗？只看看哪些还能认出来，回来聊聊。不用替我把路线拼好。”','“Could you look at the place names on the old map at Hill Camp, then come back? Just notice what remains legible. You needn’t solve the route for me.”'],observation:['你在旧图旁停下，认出纸片上的地名；没有把这次观察说成拼图已完成。','You pause by the old map and notice the legible place names. This observation does not complete the map puzzle.'],thanks:['“谢谢你特地回来。原来只是认真看一眼，也能有话慢慢聊。”','“Thank you for coming back. It turns out a careful look is enough to start a conversation.”'],observeScene:'camp',observeTarget:'old-map',eventScene:'dock',company:['你和艾弗里靠着码头栏杆看一只船慢慢转向。那页画没有完成，你们也没有催它。','You and Avery watch a boat turn from the pier rail. The drawing stays unfinished. Neither of you rushes it.'],privateEvent:['艾弗里把那页速写翻给你看，指着曾经留白的角落。“这块不是没画好。是我记得有人陪我看的地方。”','Avery shows you the sketch, pointing to the empty corner. “That bit isn’t a mistake. It’s where I remember having company.”'],recall:['“那只慢慢转向的船，我还记得。下次你也可以只来站一会儿，不用带什么。”','“I remember that slowly turning boat. Next time you can just stand here a while. You needn’t bring anything.”']},
 samira:{interest:['什么样的声音让你愿意接着哼？','What sounds make you want to keep humming?'],personal:['“水碰木桩的声音。没有打饭铃催我，就可以唱慢一点。你愿意听什么，都可以直接说。”','“Water against the pilings. Without the lunch bell, I can sing more slowly. You can tell me what you enjoy hearing.”'],private:['“我怕别人以为每次碰见我都该唱。你不要求我表演，我才敢把没想好的几句留下。”','“I worry people will expect a song every time. When you don’t ask me to perform, I can leave a few uncertain notes.”'],request:['“能去气象站看看记录本怎样记海岸的变化吗？回来告诉我你看到的，不替我预报今晚的天气。”','“Could you look at how the weather-station log records changes along the coast, then come back? Tell me what you see; don’t make a forecast for tonight.”'],observation:['你翻看气象站的潮汐与步道记录，记下它是一份过去的记录，不是今晚的天气承诺。','You look at the weather station’s tide and trail notes. These are records, not a promise about tonight’s weather.'],thanks:['“你把看见的和猜的分开说了。谢谢。下次我也愿意把没唱好的那几句给你听。”','“You kept what you saw separate from what you guessed. Thank you. I’d like to share the uncertain notes with you sometime.”'],observeScene:'weather',observeTarget:'logbook',eventScene:'dock',company:['你和萨米拉在码头听水碰木桩。她接上两句又停下；你没有催她继续。安静也是你们共同的一部分。','You and Samira listen to water against the pilings. She adds two lines, then stops. You don’t ask for more. The quiet is part of your time together.'],privateEvent:['萨米拉让你听一段还没有名字的旋律，也允许自己中途改掉一句。“下次不唱也行。我想记住今天有人愿意慢慢听。”','Samira shares an unnamed melody and changes a line halfway through. “I needn’t sing next time. I want to remember someone was willing to listen slowly today.”'],recall:['“记得我们听水声，也记得我改掉那一句。以后见到你，可以唱，也可以只问你过得怎么样。”','“I remember the water, and the line I changed. When I see you, I can sing—or simply ask how you are.”']},
 ...relationshipExpansionProfiles,...relationshipNextProfiles,
};
export const growthTopicIds=['rg-greet','rg-personal','rg-request','rg-fulfill','rg-invite','rg-company','rg-private','rg-private-invite','rg-private-event','rg-recall'];
const legacyFacts=(s:Save,p:string)=>[...(p==='mara'&&s.flags.includes('bag-returned')?['bag-returned']:[]),...(['avery','samira'].includes(p)&&s.flags.includes('residents:song-shared')?['residents:song-shared']:[])];
const toolbag=(m:Memory)=>m.legacy.facts.includes('bag-returned')||!!m.interactions['story-toolbag'];
const song=(m:Memory)=>m.legacy.facts.includes('residents:song-shared')||!!m.interactions['story-song'];
const fulfilled=(m:Memory)=>m.promise?.completedAt!==undefined||toolbag(m);
const shared=(m:Memory)=>m.companyAt!==undefined||song(m);
const empty=(s:Save,p:string):Memory=>({legacy:{relation:s.relations[p]??0,facts:legacyFacts(s,p)},days:[],interactions:{}});
export function relationshipMemory(s:Save,p:string):Memory{return (relationshipNextProfiles[p]?s.relationshipNextV1:relationshipExpansionProfiles[p]?s.relationshipExpansionV1:s.relationshipsV1)?.residents[p]??empty(s,p)}
export function relationshipStage(s:Save,p:string):RelationshipStage{
 if(!s.known.includes(p))return 'stranger';
 const m=relationshipMemory(s,p),kinds=new Set(Object.values(m.interactions).map(i=>i.kind));
 if(m.days.length>=5&&fulfilled(m)&&shared(m)&&m.privateAt!==undefined&&m.interactions['rg-private']&&m.interactions['rg-recall'])return 'close';
 if(m.days.length>=3&&kinds.size>=4&&fulfilled(m)&&shared(m))return 'trusted';
 if(m.days.length>=2&&Object.keys(m.interactions).length+(m.interactions.meet?0:1)>=3&&kinds.size>=2)return 'familiar';
 return 'acquaintance';
}
function record(s:Save,p:string,id:string,kind:Kind,minute:number,legacyBase:Save=s){
 if(!Number.isSafeInteger(minute)||minute!==townMinutes(s))throw Error('RELATIONSHIP_CLOCK_NOT_COMMITTED');
 // Keep the published three-resident root readable by the 4451 rollback runtime.
 const root=relationshipNextProfiles[p]?(s.relationshipNextV1??={schema:1,rules:RELATIONSHIP_NEXT_RULES,migratedAt:minute,residents:{}}):relationshipExpansionProfiles[p]?(s.relationshipExpansionV1??={schema:1,rules:RELATIONSHIP_EXPANSION_RULES,migratedAt:minute,residents:{}}):(s.relationshipsV1??={schema:1,rules:RELATIONSHIP_RULES,migratedAt:minute,residents:{}});
 const m=root.residents[p]??=empty(legacyBase,p),day=Math.floor(minute/1440);
 if(id!=='observe'&&!m.days.includes(day))m.days.push(day);m.days.sort((a,b)=>a-b);
 m.interactions[id]={kind,minute};m.lastId=id;return m;
}
export function recordRelationshipMeeting(s:Save,p:string,minute=townMinutes(s)){if(relationshipProfiles[p])record(s,p,'meet','meet',minute)}
/** Canonical original branches can finish after migration. Mirror their facts in the
 * same transaction, with their actual committed minute and no second reward. */
export function recordRelationshipStory(before:Save,s:Save,minute=townMinutes(s)){
 if(!before.flags.includes('bag-returned')&&s.flags.includes('bag-returned')&&s.known.includes('mara'))record(s,'mara','story-toolbag','promise',minute,before);
 if(!before.flags.includes('residents:song-shared')&&s.flags.includes('residents:song-shared'))for(const p of ['avery','samira'])if(s.known.includes(p))record(s,p,'story-song','experience',minute,before);
}
const atLeast=(stage:RelationshipStage,min:RelationshipStage)=>stages.indexOf(stage)>=stages.indexOf(min);
export function growthTopics(s:Save,p:string):LifeTopic[]{
 const profile=relationshipProfiles[p];if(!profile||!s.known.includes(p)||!residentHere(s,p,s.scene))return [];
 const m=relationshipMemory(s,p),stage=relationshipStage(s,p),seen=(id:string)=>!!m.interactions[id];
 const options:LifeTopic[]=[];
 const add=(id:string,label:Words,reply:Words)=>options.push({id,label,reply});
 if(!seen('rg-greet')||Math.floor(m.interactions['rg-greet'].minute/1440)<Math.floor(townMinutes(s)/1440))add('rg-greet',['打个招呼，聊聊今天','Say hello and catch up'],relationshipGreeting(s,p)!);
 if(!seen('rg-personal'))add('rg-personal',profile.interest,profile.personal);
 if(atLeast(stage,'familiar')&&!m.promise&&!fulfilled(m))add('rg-request',['有什么小事想请我帮忙？','Is there a small favor I could help with?'],profile.request);
 if(m.promise?.observedAt!==undefined&&m.promise.completedAt===undefined)add('rg-fulfill',['回来讲讲亲自看到的事','Tell them what you saw'],profile.thanks);
 if(fulfilled(m)&&!shared(m)&&!seen('rg-invite'))add('rg-invite',['改天一起安静待一会儿？','Spend a quiet moment together sometime?'],[`“好。在${rooms[profile.eventScene].title[0]}遇到时就一起待一会儿。照我的日程来，不用赶，改日也可以。”`,`“Yes. When we meet at ${rooms[profile.eventScene].title[1]}, let’s stay a while. Follow my usual routine; another day is fine.”`]);
 if(seen('rg-invite')&&!shared(m)&&s.scene===profile.eventScene)add('rg-company',['留下来，共同看一会儿','Stay and share a quiet moment'],profile.company);
 if(atLeast(stage,'trusted')&&!seen('rg-private'))add('rg-private',['最近有什么让你放不下？','Has anything been on your mind lately?'],profile.private);
 if(seen('rg-private')&&!seen('rg-private-invite'))add('rg-private-invite',['愿意再留一点时间给彼此吗？','Make a little more time for each other?'],[`“愿意。在${rooms[profile.eventScene].title[0]}相遇就好。不用为我带礼物。”`,`“I would like that. Meet me at ${rooms[profile.eventScene].title[1]} during my routine. No gifts needed.”`]);
 if(seen('rg-private-invite')&&m.privateAt===undefined&&s.scene===profile.eventScene)add('rg-private-event',['陪伴对方，听完这段心事','Stay and hear what they want to share'],profile.privateEvent);
 if(m.privateAt!==undefined&&!seen('rg-recall'))add('rg-recall',['聊起你们共同记得的事','Remember your time together'],profile.recall);
 return options;
}
export function applyGrowthTopic(s:Save,p:string,id:string,minute=townMinutes(s)){
 if(!growthTopicIds.includes(id))return;
 if(!growthTopics(s,p).some(t=>t.id===id))throw Error('RELATIONSHIP_TOPIC_UNAVAILABLE');
 const kind=interactionKind(id);
 const m=record(s,p,id,kind,minute);
 if(id==='rg-request')m.promise={acceptedAt:minute};if(id==='rg-fulfill')m.promise!.completedAt=minute;
 if(id==='rg-company')m.companyAt=minute;if(id==='rg-private-event')m.privateAt=minute;
 const award=id==='rg-fulfill'?2:['rg-personal','rg-private','rg-company','rg-private-event'].includes(id)?1:0;
 if(award)s.relations[p]=Math.min(100,(s.relations[p]??0)+award);
}
export function growthObservations(s:Save,target:string){return Object.entries(relationshipProfiles).filter(([p,d])=>s.known.includes(p)&&d.observeTarget===target&&d.observeScene===s.scene&&relationshipMemory(s,p).promise?.acceptedAt!==undefined&&relationshipMemory(s,p).promise?.observedAt===undefined).map(([p,d])=>({person:p,action:'relationship-observe:'+p,label:[`为${people[p].name[0]}仔细看看`,`Look carefully for ${people[p].name[1]}`] as Words,reply:d.observation}))}
export const growthObservationVerbs=(target:string)=>Object.entries(relationshipProfiles).filter(([,d])=>d.observeTarget===target).map(([p])=>'relationship-observe:'+p);
export function applyGrowthObservation(s:Save,target:string,p:string,minute=townMinutes(s)){
 const option=growthObservations(s,target).find(x=>x.person===p);if(!option)throw Error('RELATIONSHIP_OBSERVATION_UNAVAILABLE');
 const m=record(s,p,'observe','promise',minute);m.promise!.observedAt=minute;return option.reply;
}
export function relationshipGreeting(s:Save,p:string):Words|undefined{
 if(!relationshipProfiles[p])return;
 // A legacy journal can recover Owen into the read-only directory before known
 // is restored by a real introduction. Do not invent recognition or write a save.
 if(!s.known.includes(p))return (relationshipExpansionProfiles[p]||relationshipNextProfiles[p])&&(s.history.some(h=>h.person===p)||s.flags.some(f=>f.startsWith('talk:'+p+':')))?['过去的谈话还保存在记录里。再次见面时，可以重新打个招呼。','Your earlier conversations remain in the journal. You can say hello again when you meet.']:undefined;
 const stage=relationshipStage(s,p),m=relationshipMemory(s,p),name=people[p].name;
 const lines:Record<Exclude<RelationshipStage,'stranger'>,Words>={acquaintance:[`${name[0]}认出了你：“又见面了。今天想慢慢聊点什么？”`,`${name[1]} recognizes you. “Good to see you again. What would you like to talk about today?”`],familiar:[`${name[0]}朝你招手：“熟面孔来了。上次聊的事，我还记着。”`,`${name[1]} waves. “A familiar face. I remember what we talked about.”`],trusted:[`${name[0]}为你留出空当：“是你呀。有些话，我愿意慢慢和你说。”`,`${name[1]} makes time for you. “It’s you. There are things I feel comfortable sharing with you.”`],close:[`${name[0]}笑着迎你：“老朋友，今天过得怎么样？就待一会儿也好。”`,`${name[1]} smiles. “My friend, how has your day been? We can simply stay a while.”`]};
 const line=lines[stage as Exclude<RelationshipStage,'stranger'>],memory=relationshipLastMemory(s,p);
 return memory?[line[0]+' '+memory[0],line[1]+' '+memory[1]]:m.legacy.facts.length?[line[0]+' 我们以前一起做过的事还在手记里。',line[1]+' Our earlier experiences are still in the journal.']:line;
}
export function relationshipLastMemory(s:Save,p:string):Words|undefined{
 const m=relationshipMemory(s,p),d=relationshipProfiles[p];if(!d||!m.lastId)return;
 const labels:Record<string,Words>={meet:['记得你们互相介绍的那次。','They remember your introductions.'],'story-toolbag':['记得你亲手交还了工具袋。','They remember you returning the tool bag.'],'story-song':['记得你们在码头一起听歌、听水声。','They remember sharing the tune and listening to the water on the pier.'],'rg-greet':['记得你上次过来打招呼。','They remember your last hello.'],'rg-personal':['记得你认真听过他们喜欢的小事。','They remember you listening to the little things they enjoy.'],'rg-request':['记得你答应先观察，再回来聊。','They remember your promise to look carefully and return.'],observe:['记得你已亲自观察，仍等你回来聊。','Your observation is saved; they are waiting to hear it.'],'rg-fulfill':['记得你回来兑现了约定。','They remember you returning and following through.'],'rg-invite':['记得你们约好改天一起待一会儿。','They remember your plan to spend some time together.'],'rg-company':d.company,'rg-private':['记得你听过他们的一段心事。','They remember sharing something that was on their mind.'],'rg-private-invite':['记得你们愿意再留点时间给彼此。','They remember agreeing to make more time for each other.'],'rg-private-event':d.privateEvent,'rg-recall':d.recall};return labels[m.lastId];
}
export function relationshipNext(s:Save,p:string):{text:Words;place?:string}|undefined{
 const d=relationshipProfiles[p];if(!d||!s.known.includes(p))return;
 const m=relationshipMemory(s,p),stage=relationshipStage(s,p);
 if(m.promise&&m.promise.observedAt===undefined)return {text:[`约好的小事：到${rooms[d.observeScene].title[0]}亲自看看，回来聊。`,`Your promise: look carefully at ${rooms[d.observeScene].title[1]}, then return to talk.`],place:d.observeScene};
 if(m.promise&&m.promise.completedAt===undefined)return {text:['观察记下了，见面时告诉对方。','Your observation is saved. Tell them when you meet.']};
 if(m.interactions['rg-invite']&&!shared(m)||m.interactions['rg-private-invite']&&m.privateAt===undefined)return {text:[`按对方日程去${rooms[d.eventScene].title[0]}相聚，改日也可以。`,`Meet at ${rooms[d.eventScene].title[1]} during their routine. Another day is fine.`],place:d.eventScene};
 return {text:stage==='close'?['亲近也可以是朋友。继续关心彼此，不必带礼物。','Closeness can mean friendship. Keep caring for each other; gifts aren’t needed.']:['不同日相遇、聊不同的事，约好后认真兑现。慢慢来。','Meet on different days, share different conversations, and follow through. Take your time.']};
}
export function relationshipProgressNotes(s:Save,p:string):Words[]{
 if(!relationshipProfiles[p]||!s.known.includes(p))return [];
 const m=relationshipMemory(s,p),notes:Words[]=[];
 if(fulfilled(m))notes.push(toolbag(m)?['共同记忆：你曾归还玛拉的工具袋，这份承诺仍被记着。','Shared memory: returning Mara’s tool bag remains a promise you kept.']:['你答应的观察已经亲自完成，也回来讲给了对方。','You completed the promised observation and returned to tell them.']);
 if(shared(m))notes.push(song(m)?['共同记忆：你们曾在码头听歌，这一刻仍在。','Shared memory: the tune you heard together on the pier remains.']:relationshipProfiles[p].company);
 if(m.privateAt!==undefined)notes.push(relationshipProfiles[p].privateEvent);
 return notes;
}
export function validRelationshipGrowth(s:Save):boolean{
 return validGrowthRoot(s,s.relationshipsV1,RELATIONSHIP_RULES,relationshipPilotIds)&&validGrowthRoot(s,s.relationshipExpansionV1,RELATIONSHIP_EXPANSION_RULES,Object.keys(relationshipExpansionProfiles))&&validGrowthRoot(s,s.relationshipNextV1,RELATIONSHIP_NEXT_RULES,Object.keys(relationshipNextProfiles));
}
function validGrowthRoot(s:Save,root:RelationshipGrowth|RelationshipExpansion|RelationshipNext|undefined,rules:string,residents:readonly string[]):boolean{
 if(root===undefined)return true;
 const now=townMinutes(s),minute=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=now,keys=(o:object,allowed:string[])=>Object.keys(o).every(k=>allowed.includes(k));
 if(!root||typeof root!=='object'||!keys(root,['schema','rules','migratedAt','residents'])||root.schema!==1||root.rules!==rules||!minute(root.migratedAt)||!root.residents||typeof root.residents!=='object'||Array.isArray(root.residents))return false;
 return Object.entries(root.residents).every(([p,m])=>{
  if(!residents.includes(p)||!s.known.includes(p)||!m||typeof m!=='object'||!keys(m,['legacy','days','interactions','lastId','promise','companyAt','privateAt'])||!m.legacy||!keys(m.legacy,['relation','facts'])||!Number.isFinite(m.legacy.relation)||m.legacy.relation< -100||m.legacy.relation>100||!Array.isArray(m.legacy.facts)||m.legacy.facts.some(f=>!legacyFacts(s,p).includes(f))||!Array.isArray(m.days)||!m.interactions||typeof m.interactions!=='object'||Array.isArray(m.interactions))return false;
  const entries=Object.entries(m.interactions);if(entries.length>14||!entries.every(([id,i])=>['meet','observe',...growthTopicIds,...storyInteractionIds].includes(id)&&!!i&&keys(i,['kind','minute'])&&i.kind===interactionKind(id)&&minute(i.minute)&&i.minute>=root.migratedAt))return false;
  if(m.interactions['story-toolbag']&&!legacyFacts(s,p).includes('bag-returned')||m.interactions['story-song']&&!legacyFacts(s,p).includes('residents:song-shared'))return false;
  if(m.days.some((d,i)=>!Number.isSafeInteger(d)||d<Math.floor(root.migratedAt/1440)||d>Math.floor(now/1440)||(i>0&&d<=m.days[i-1]))||m.days.length>Math.floor(now/1440)-Math.floor(root.migratedAt/1440)+1||m.lastId!==undefined&&!m.interactions[m.lastId])return false;
  if(m.promise&&(typeof m.promise!=='object'||Array.isArray(m.promise)||!keys(m.promise,['acceptedAt','observedAt','completedAt'])||!minute(m.promise.acceptedAt)||!m.interactions['rg-request']||m.promise.observedAt!==undefined&&(!minute(m.promise.observedAt)||m.promise.observedAt<m.promise.acceptedAt||!m.interactions.observe)||m.promise.completedAt!==undefined&&(m.promise.observedAt===undefined||!minute(m.promise.completedAt)||m.promise.completedAt<m.promise.observedAt||!m.interactions['rg-fulfill'])))return false;
  if(m.companyAt!==undefined&&(!minute(m.companyAt)||!m.interactions['rg-company']||!m.interactions['rg-invite']||!fulfilled(m)||m.promise?.completedAt!==undefined&&m.companyAt<m.promise.completedAt))return false;
  if(m.privateAt!==undefined&&(!minute(m.privateAt)||!shared(m)||m.companyAt!==undefined&&m.privateAt<m.companyAt||!m.interactions['rg-private-event']||!m.interactions['rg-private-invite']||!m.interactions['rg-private']))return false;
  return true;
 });
}
