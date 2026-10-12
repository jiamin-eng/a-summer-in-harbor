import {priestExamples,priestContext} from './chapel-priest';
import {nextExamples,nextContext} from './next-neighbors';
import {routineReply,learnedRoutine} from './resident-guide';
import {oldLife,residentPeople,residentActivity,residentHere,townPeriod,townTimeLabel,type TownState} from '../world/residents';
import type {Words} from '../world/data';
export type LifeTopic={id:string;label:Words;reply:Words;once?:boolean;requires?:string;all?:string[]};
const seen=(s:TownState,p:string,id:string)=>s.flags.includes(`talk:${p}:${id}`);
const topic=(id:string,label:Words,reply:Words):LifeTopic=>({id,label,reply,once:true});
const interests:Record<string,LifeTopic>={
 avery:topic('sketch',['你喜欢画什么？','What do you like drawing?'],['“小船。它们一直动，我就有理由不把线画得太整齐。傍晚我常去钓鱼码头，今天也会去。不用急着画完。”','“Little boats. They keep moving, which excuses my wobbly lines. I often go to the fishing pier in the evening. Today too. No need to finish.”']),
 samira:topic('humming',['刚才哼的是什么？','What were you humming?'],['“自己拼的一小段，还没有名字。傍晚我去钓鱼码头听水声。有人愿意安静听就好了，但我不想办成演出。”','“A little tune I made up. No name yet. I go to the fishing pier in the evening to hear the water. A quiet listener would be nice. Not a performance.”']),
 owen:topic('birds',['你在听哪一种声音？','Which sound are you listening for?'],['“短的那一声。先别猜，和我听一会儿。”你们等着鸟声再次出现。欧文笑了：“听见两次，就不容易忘了。”','“The short call. Don’t guess yet. Listen with me.” You wait for it to return. Owen smiles. “Hear it twice and it tends to stay.”']),
 dani:topic('leaves',['这片叶子值得记下来吗？','Is this leaf worth a page?'],['“值得。它掉在我刚听完一个故事的地方。别人的秘密不写，只写那个人喜欢什么。”丹妮在空白页上留了一小块位置。','“Yes. It fell where I’d just heard a story. No one’s secrets go in the book. Just something they love.” Dani leaves a little space on the page.']),
};
export const lifeTopicIds=(p:string)=>residentPeople[p]?['routine','sketch','humming','birds','leaves','company','invite','listen','after-song','remember','boundaries']:oldLife[p]?['life','routine']:[];
export function lifeTopics(s:TownState,p:string):LifeTopic[]{
 if(!s.known.includes(p))return [];
 if(!residentPeople[p])return oldLife[p]?[...(!seen(s,p,'life')?[topic('life',oldLife[p].label,oldLife[p].reply)]:[]),...(!seen(s,p,'routine')?[topic('routine',['平时在哪儿能找到你？','Where can I usually find you?'],p==='mara'&&!s.flags.includes('bag-returned')?['“工具袋拿回来之前，我会留在车站街等你。平时上午在车站街，午后去住户庭院，傍晚逛旧街。”','“Until my tool bag is back, I will wait on Station Street. Usually I spend mornings here, afternoons in the courtyard, and evenings on Market Lane.”']:routineReply(p))]:[])]:[];
 if(!residentHere(s,p,s.scene))return [];
 let options=[interests[p]];
 if(seen(s,p,interests[p].id))options.push(topic('routine',['平时在哪些地方能遇到你？','Where do you usually spend your day?'],routineReply(p)));
 if(p==='avery'&&seen(s,p,'sketch'))options.push(topic('company',['画画时喜欢有人陪吗？','Do you like company while drawing?'],['“喜欢。只要不用一直说话。如果有人哼两句，也挺好。我们不必把每次坐下都变成一件大事。”','“Yes. As long as we needn’t talk the whole time. A little humming would be nice too. Sitting down needn’t become a big occasion.”']));
 if(p==='samira'&&seen(s,p,'humming')&&seen(s,'avery','company')&&s.known.includes('avery')&&!s.flags.includes('residents:invited'))options.push(topic('invite',['Avery也喜欢安静陪伴，傍晚一起坐坐？','Avery likes quiet company too. Sit together this evening?'],['“好。在钓鱼码头碰见就一起坐，不用赶时间。十七点到二十一点，我通常都在。今天没遇到，另一个傍晚也行。”时间还早的话，你可以先回租屋小睡三小时，或者做点别的事。','“Yes. If we meet at the fishing pier, let’s sit together. No rush. I am usually there from 17:00 to 21:00. Another evening is fine if not today.” If it is early, you could take a three-hour nap in your room or do something else first.']));
 if(p==='samira'&&s.flags.includes('residents:invited')&&!s.flags.includes('residents:song-shared')&&s.scene==='dock'&&townPeriod(s)==='evening')options.push(topic('listen',['留下来，安静听完这一小段','Stay and listen to the little tune'],['你在码头停下。萨米拉没有报曲名，艾弗里也没有急着画完。最后一个音落下，你们又听了一会儿水声。“这样就很好。”萨米拉说。','You pause on the pier. Samira gives no title; Avery leaves the drawing unfinished. After the last note you listen to the water a little longer. “That was enough,” Samira says.']));
 if(s.flags.includes('residents:song-shared')&&['avery','samira'].includes(p))options.push(topic('after-song',['还记得我们在码头坐的那一会儿吗？','Remember that quiet moment on the pier?'],p==='avery'?['“记得。我把那页空着的地方留下了。看见它就会想起我们听水声的时候。”','“Yes. I left that space on the page. It reminds me of listening to the water together.”']:['“记得。下次见到你，我大概不用先把声音咽回去了。不是每次都要唱，知道有人听过就很好。”','“Yes. Next time I see you, perhaps I won’t swallow the tune. I needn’t sing every time. It helps to know someone listened.”']));
 if(p==='owen'&&seen(s,p,'birds'))options.push(topic('remember',['我还记得刚才那一声','I remember that call'],['“那下次你先听。我可能会认错，退休也没让我忽然变成专家。”他给你留出栏杆旁的位置。','“You listen first next time. I may get it wrong. Retirement didn’t turn me into an expert.” He leaves you space at the rail.']));
 if(p==='dani'&&seen(s,p,'leaves'))options.push(topic('boundaries',['也可以只把故事留给自己','Some stories can stay just with you'],['“是啊。谢谢你这样说。有些页不公开，才会有人愿意把真话写上去。”','“Yes. Thank you for saying so. Some pages stay private. That’s what lets people be honest.”']));
 return options.filter(t=>!seen(s,p,t.id));
}
export function applyLifeTopic(s:TownState,p:string,id:string){
 if(!residentPeople[p])return;
 if(id==='invite'&&!s.flags.includes('residents:invited'))s.flags.push('residents:invited');
 if(id==='listen'&&!s.flags.includes('residents:song-shared')){s.flags.push('residents:song-shared');for(const who of ['avery','samira'])s.relations[who]=Math.min(100,(s.relations[who]??0)+1)}
 if(id===interests[p].id)s.relations[p]=Math.min(100,(s.relations[p]??0)+1);
}
export function neighborPlan(s:TownState):Words|undefined{
 if(!s.known.includes('avery')||!s.known.includes('samira'))return;
 if(s.flags.includes('residents:song-shared'))return ['你、Avery和Samira在码头一起听过歌。以后见面，还能聊起那一会儿。','You, Avery and Samira shared a quiet tune on the pier. It is something to remember next time.'];
 if(!s.flags.includes('residents:invited'))return;
 const early=['morning','afternoon'].includes(townPeriod(s)),night=townPeriod(s)==='night';
 return ['钓鱼码头 · 17:00–21:00，和Avery、Samira坐一会儿。'+(early?'时间还早，可回你的租屋小睡三小时，也可先做别的事。':night?'下一个傍晚也可以，不必今晚赶去。':'现在正是约好的时段；今天没遇见，其他傍晚也可以。'), 'Fishing Pier · 17:00–21:00, a quiet moment with Avery and Samira. '+(early?'It is still early. Take a three-hour nap in Your Room, or do something else first.':night?'Another evening is fine. There is no need to rush there tonight.':'This is the time you agreed on. Another evening is fine if not today.')];
}
const oldLifeFollowup:Record<string,Words>={
 mara:['你说喜欢看窗台上的花，最近有哪一盆让你停下来？','You mentioned windowsill flowers. Has one made you stop lately?'],
 theo:['你说在学烤面包，最近哪一次比较成功？','You mentioned learning to bake bread. Has a loaf gone well lately?'],
 june:['你爸爸那把锤子，有什么让你舍不得换的故事？','What story makes your dad’s hammer hard to replace?'],
 idris:['窗边那盆植物换好土了吗？','Have you repotted the plant by your window?'],
 ruth:['今天有没有一双鞋让你猜到什么有趣的事？','Have someone’s shoes suggested an interesting story today?'],
 luis:['你多煮的那碗番茄汤，通常会留给谁？','Who usually gets that extra bowl of tomato soup?'],
 nell:['那张没写字的明信片，你想亲口说些什么？','What would you like to say in person instead of on that postcard?'],
 elena:['最近有没有一片只有你注意到的新叶？','Have you noticed a new leaf that nobody else has spotted?'],
 arthur:['不记天气数字的时候，你最喜欢看什么样的云？','When you leave the weather unrecorded, what clouds do you enjoy watching?'],
};
export function lifeExamples(s:TownState,p:string):Words[]{const extra=priestExamples(s,p)??nextExamples(s,p);if(extra)return extra;if(!residentPeople[p])return seen(s,p,'life')&&oldLifeFollowup[p]?[oldLifeFollowup[p]]:[];if(s.flags.includes('residents:song-shared')&&['avery','samira'].includes(p))return [['那次在码头一起坐着，你最记得什么？','What stayed with you from our time on the pier?'],['今天有没有想给自己留一点时间做的事？','Is there something you want to make time for today?']];return [[`你在这里待着，最喜欢留意什么？`,`What do you enjoy noticing here?`],seen(s,p,interests[p].id)?[p==='avery'?'今天的速写有什么新发现？':p==='samira'?'哼歌的时候，什么会让你自在一点？':p==='owen'?'刚才的鸟叫，下次我该怎样认出来？':'怎样记录一个故事，又不打扰讲故事的人？',p==='avery'?'What have you noticed in today’s drawing?':p==='samira'?'What helps you feel comfortable humming?':p==='owen'?'How can I recognize that bird call next time?':'How can you keep a story without intruding?']:['你平时喜欢怎样度过休息时间？','How do you like to spend your time off?']]}
export function lifeContext(s:TownState,p:string){return {chapelNeighbor:priestContext(s,p),neighborStory:nextContext(s,p),time:townTimeLabel(s),activity:residentActivity(s,p),personalDetail:residentPeople[p]?.intro??oldLife[p]?.reply,relationship:s.relations[p]??0,sharedSong:s.flags.includes('residents:song-shared')&&['avery','samira'].includes(p),invited:s.flags.includes('residents:invited')&&['avery','samira'].includes(p),routineKnown:learnedRoutine(s,p),routine:learnedRoutine(s,p)?routineReply(p):undefined,learnedInterest:residentPeople[p]?seen(s,p,interests[p].id):seen(s,p,'life'),rule:'Schedules and social memories are committed facts. Do not invent another encounter, event completion or reward. Unsaid private interests may be discussed by their owner, but do not reveal unknown people or preempt optional invitations.'}}
