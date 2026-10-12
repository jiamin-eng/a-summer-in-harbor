import {chapelPriest,chapelPriestId} from '../world/chapel-priest';
import {residentHere,townPeriod,type TownState} from '../world/residents';
import {routineReply} from './resident-guide';
import type {Words} from '../world/data';
import type {LifeTopic} from './resident-life';
import type {StoryLead} from './relationships';

const seen=(s:TownState,id:string)=>s.flags.includes(`talk:${chapelPriestId}:${id}`);
export const priestChoiceTopicIds=['priest-note','priest-chair'];
export const priestTopicIds=(person:string)=>person===chapelPriestId?['routine','priest-life','priest-table',...priestChoiceTopicIds,'priest-recall']:[];
const choice=(s:TownState)=>seen(s,'priest-note')?'note':seen(s,'priest-chair')?'chair':undefined;
const t=(id:string,label:Words,reply:Words,once=true):LifeTopic=>({id,label,reply,once});
const recall=(s:TownState):Words=>choice(s)==='note'?
 ['“记得。那张‘可以坐一会儿’的小便条还在桌边。我没有添上谁的名字。”他笑了笑。“后来我也真的坐了一会儿。”','“I remember. The little ‘Stay a while’ note is still beside the table. I added no names.” He smiles. “Later, I sat down for a while myself.”']:
 ['“记得。那把靠过道的椅子还留着，来的人自己决定要不要说话。”他指了指口袋里的旋钮。“我也在这里慢慢修我的收音机。”','“I remember. The aisle-side chair is still there. Whoever comes decides whether to speak.” He touches the knob in his pocket. “I take my time with the radio here too.”'];

export function priestTopics(s:TownState,person:string):LifeTopic[]{
 if(person!==chapelPriestId||!s.known.includes(person)||!residentHere(s,person,s.scene))return [];
 const options=[t('routine',['平时在哪里能找到你？','Where can I usually find you?'],routineReply(person)),
 t('priest-life',['回到海湾，什么最让你惦记？','What stayed with you when you returned?'],
 ['“父亲开过渡船，回家就修他那台总串台的收音机。母亲总在饭桌边多放一把椅子。她去世以后，我回到这里，才发现自己也需要有人留个位置。”他把旧旋钮翻了个面。“十八年里我一直忙着照顾别人。现在午后会出去走走。”','“Dad ran a ferry and came home to repair a radio that never held a station. Mum always put an extra chair at the table. After she died, I came back and realized I needed a place left for me too.” He turns the old knob over. “I spent eighteen years looking after others. Now I take an afternoon walk.”'])];
 if(seen(s,'priest-life'))options.push(t('priest-table',['那把多留的椅子呢？','What about that extra chair?'],
 ['“我想在这里也留一个位置。来借书、听歌、祈祷，或者只是歇歇都行。要不要留一张欢迎便条，还是让空椅子自己说话？”他看看你。“等我回到教堂时，我们再决定。另一天也可以。”','“I’d like to leave a place here too. For a book, a song, a prayer, or a rest. Should a little welcome note do the inviting, or the chair itself?” He looks at you. “We can decide when I’m back at the chapel. Another day is fine.”']));
 if(seen(s,'priest-table')&&!choice(s)&&s.scene==='chapel')options.push(
  t('priest-note',['一起留张“可以坐一会儿”的便条','Leave a little “Stay a while” note together'],['你们把小便条放在桌边，留出阅读和排练的位置。加布里埃尔没有写任何来访者的名字，随后自己也坐了下来。','You place a little note beside the table, leaving the reading and rehearsal spaces free. Gabriel writes no visitor names, then sits down himself.']),
  t('priest-chair',['把那把椅子留给愿意停下来的人','Leave the chair for whoever wants to pause'],['你们给靠过道的椅子留出位置。加布里埃尔坐在旁边，拿出旧收音机的旋钮；你可以聊聊，也可以一起安静待一会儿。','You leave room for the aisle-side chair. Gabriel sits nearby with the old radio knob. You can talk, or simply sit together.']));
 if(choice(s))options.push(t('priest-recall',['还记得我们留的那个位置吗？','Remember the place we left?'],recall(s),false));
 return options.filter(topic=>!topic.once||!seen(s,topic.id));
}
export function applyPriestTopic(s:TownState,person:string,id:string){
 if(person===chapelPriestId&&priestChoiceTopicIds.includes(id)&&!choice(s))s.relations[person]=Math.min(100,(s.relations[person]??0)+1);
}
export function validPriestState(s:TownState){
 const note=seen(s,'priest-note'),chair=seen(s,'priest-chair');
 return !(note&&chair)&&(!(note||chair)||(s.known.includes(chapelPriestId)&&seen(s,'priest-life')&&seen(s,'priest-table')));
}
export function priestStoryLeads(s:TownState):StoryLead[]{
 if(!s.known.includes(chapelPriestId)||!seen(s,'priest-life'))return [];
 const done=!!choice(s),night=townPeriod(s)==='night';
 return [{id:'priest-extra-chair',title:['留一个位置','Leave a place'],people:[chapelPriestId],state:done?'done':'active',
  summary:done?recall(s):['他记得母亲饭桌旁多留的那把椅子，想给教堂的来访者也留一个位置。','He remembers the extra chair at his mother’s table and wants to leave a place for chapel visitors too.'],
  ...(done?{}:{next:night?['夜间他已经休息。明早06:00后，去教堂继续聊。','He is resting for the night. Continue at the chapel after 06:00.'] as Words:s.scene==='hill'?['另一个上午或傍晚，在教堂和他继续聊那把椅子。','Continue the conversation at the chapel another morning or evening.'] as Words:['在教堂和他聊聊那把椅子，按你们的想法留一个位置。','Talk about the chair at the chapel and leave a place together.'] as Words,place:'chapel'})}];
}
export function priestExamples(s:TownState,person:string):Words[]|undefined{
 if(person!==chapelPriestId)return;
 return [choice(s)?['那次一起留的位置，对你意味着什么？','What does the place we left mean to you?']:['重回故乡以后，你怎样给自己留一点时间？','How do you make time for yourself now you are home?'],['那台收音机，最近修到哪里了？','How is the old radio coming along?']];
}
export function priestContext(s:TownState,person:string){
 if(person!==chapelPriestId)return;
 return {occupation:chapelPriest.role,background:chapelPriest.intro,personalStoryHeard:seen(s,'priest-life'),chairDiscussed:seen(s,'priest-table'),sharedChoice:choice(s)??null,rule:'A fixed fictional neighbor. Use committed history only. Radio repair and additional encounters are not completed by conversation; do not invent news or rewards. Leave the player free to sit, talk or go.'};
}
