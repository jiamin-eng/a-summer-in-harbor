import {people,rooms,type Words} from '../world/data';
import {gatheringResidents,neighborPartyActive,type NeighborChapter} from '../world/neighbor-gathering';
import {knownPeople,type StoryLead} from './relationships';
import {relationshipMemory,relationshipStage,relationshipNext,stages} from './relationship-growth';
import {townMinutes,presentEntity} from '../world/residents';
import {weatherForSave} from '../weather/state';
import type {Save} from './state';
import type {LifeTopic} from './resident-life';
export const originalNeighborRoster=['arthur','avery','casey','dani','elena','grant','harper','idris','jordan','june','leila','luis','mara','mira','nell','noor','owen','rowan','ruth','samira','tess','theo'];
const publicPlaces=['station','harbor','market','coast','hill','dock','bazaar','beach','path','lighthouse','camp','garden','chapel','cafe','grocery','workshop','gym','secondhand','weather'];
export const newNeighborChapter=():NeighborChapter=>({schema:1,rules:'neighbor-chapter-v1',roster:people.gabriel?'harbor23-priest-v2':'harbor22-v1',invited:[]});
const roster=(s:Save)=>s.neighborChapterV1?.roster==='harbor23-priest-v2'?[...originalNeighborRoster,'gabriel']:originalNeighborRoster;
export function completedNeighborTask(s:Save,p:string){const m=relationshipMemory(s,p);return m.promise?.completedAt!==undefined||m.legacy.facts.some(f=>['bag-returned','residents:song-shared'].includes(f))||!!m.interactions['story-toolbag']||!!m.interactions['story-song']}
export function familiarNeighbors(s:Save){return gatheringResidents.filter(p=>s.known.includes(p)&&stages.indexOf(relationshipStage(s,p))>=stages.indexOf('familiar'))}
export function neighborProgress(s:Save){
 const known=knownPeople(s),places=[...new Set(s.visited.filter(id=>publicPlaces.includes(id)))],familiar=familiarNeighbors(s),ready=familiar.filter(p=>completedNeighborTask(s,p));
 return {known,places,familiar,ready,meetGoal:4,placeGoal:3,firstReady:known.length>=4&&places.length>=3&&ready.length>=2,invitationUnlocked:s.neighborChapterV1?.gatheredAt!==undefined,allKnown:s.neighborChapterV1?.allKnownAt!==undefined||roster(s).every(p=>known.includes(p)),rosterCount:roster(s).length};
}
const ensure=(s:Save)=>s.neighborChapterV1??={schema:1,rules:'neighbor-chapter-v1',roster:'harbor22-v1',invited:[]};
export function recordNeighborProgress(s:Save){if(neighborProgress(s).allKnown&&s.neighborChapterV1?.allKnownAt===undefined)ensure(s).allKnownAt=townMinutes(s)}
const daylight=(s:Save)=>{const m=townMinutes(s)%1440;return m>=360&&m<1260};
const eligible=(s:Save)=>{const p=neighborProgress(s);return p.invitationUnlocked?p.familiar:p.ready};
export function neighborActionAvailable(s:Save,id:string){
 if(!id.startsWith('neighbor-'))return true;
 const memory=s.neighborChapterV1,progress=neighborProgress(s),here=['coast','chapel'].includes(s.scene),venue=here&&(s.scene!=='coast'||weatherForSave(s)!=='light-rain');
 if(id==='neighbor-recall')return here&&memory?.gatheredAt!==undefined;
 if(id==='neighbor-finish')return neighborPartyActive(s)&&!!memory?.party&&memory.party.people.every(p=>memory.party!.chatted.includes(p));
 if(id==='neighbor-move-inside')return !!memory?.party&&memory.party.scene==='coast'&&s.scene==='chapel'&&daylight(s);
 if(memory?.party)return false;
 if(id.startsWith('neighbor-select:'))return here&&(progress.invitationUnlocked||progress.firstReady)&&eligible(s).includes(id.slice(16) as any);
 if(id==='neighbor-start')return venue&&daylight(s)&&(progress.invitationUnlocked||progress.firstReady)&&(!memory?.invited.length||memory.invited.every(p=>eligible(s).includes(p as any)))&&(progress.invitationUnlocked?(memory?.invited.length??0)>=1:(memory?.invited.length===2||!memory?.invited.length&&progress.ready.length>=2));
 return false;
}
export const neighborActionLabels:Record<string,Words>={
 'neighbor-select:mara':['邀约或取消玛拉','Invite or remove Mara'],
 'neighbor-select:avery':['邀约或取消艾弗里','Invite or remove Avery'],
 'neighbor-select:samira':['邀约或取消萨米拉','Invite or remove Samira'],
 'neighbor-start':['开始这次小聚','Begin this gathering'],
 'neighbor-move-inside':['把这次小聚移到教堂室内','Continue this gathering inside the chapel'],
 'neighbor-finish':['记下这次小聚，大家继续一天的生活','Remember the gathering and return to the day'],
 'neighbor-recall':['回忆上次相聚 · 可再邀约','Remember the gathering · Invite again'],
};
const names=(ids:string[]):Words=>[ids.map(id=>people[id].name[0]).join('、'),ids.map(id=>people[id].name[1]).join(' and ')];
export function applyNeighborAction(s:Save,id:string):Words{
 if(!neighborActionAvailable(s,id))throw Error('NEIGHBOR_ACTION_UNAVAILABLE');const m=ensure(s),now=townMinutes(s);
 if(id.startsWith('neighbor-select:')){const person=id.slice(16);if(m.invited.includes(person))m.invited=m.invited.filter(p=>p!==person);else{if(m.invited.length===2)throw Error('NEIGHBOR_INVITATION_FULL');m.invited.push(person)}return m.invited.length?[`这次想邀约：${names(m.invited)[0]}。可以再选一位，或取消已选的人。`,`This invitation: ${names(m.invited)[1]}. Choose another, or remove someone already selected.`]:['这次暂未选择邻居，已有约定和回忆仍保留。','No neighbor is selected for this visit. Earlier invitations and memories remain.']}
 if(id==='neighbor-move-inside'){m.party!.scene='chapel';return ['大家来到教堂室内，接着聊刚才的事。已聊过的内容保留，不必重新开始。','Everyone comes inside the chapel and continues the conversation. Earlier conversations stay remembered; this is the same gathering.']}
 if(id==='neighbor-start'){
  const first=m.gatheredAt===undefined,chosen=m.invited.length?[...m.invited]:neighborProgress(s).ready.slice(0,2);if(first&&chosen.length!==2)throw Error('NEIGHBOR_TWO_REQUIRED');
  m.party={scene:s.scene as 'coast'|'chapel',people:chosen,chatted:[],startedAt:now,first};m.invited=[];
  return [`${names(chosen)[0]}来到${rooms[s.scene].title[0]}，给彼此留出位置。走近他们，分别聊一小段；随时可以离开，改日继续。`,`${names(chosen)[1]} join you at ${rooms[s.scene].title[1]}. Approach each neighbor for a short conversation. You can leave and continue another day.`];
 }
 if(id==='neighbor-finish'){
  const p=m.party!;m.lastParty={scene:p.scene,people:[...p.people],endedAt:now};if(m.gatheredAt===undefined)m.gatheredAt=now;delete m.party;
  return ['你们记下了这次相聚，各自回到一天的生活。以后在海岸或教堂都可以“邀约小聚”，选一两位熟悉的邻居，聊聊再分别；无需礼物或额外花费。','You remember this time together and return to your day. Small invitations are now always available at the coast or chapel: choose one or two familiar neighbors, talk, then part. No gifts or payment are needed.'];
 }
 const n=names(m.lastParty!.people);return [`你记得上次和${n[0]}在${rooms[m.lastParty!.scene].title[0]}相聚。想再见面，可以选择熟悉的邻居另约一次。`,`You remember meeting ${n[1]} at ${rooms[m.lastParty!.scene].title[1]}. Select familiar neighbors for another visit whenever you like.`];
}
export const neighborTopicIds=(person:string)=>gatheringResidents.includes(person as any)?['neighbor-chat']:[];
const remarks:Record<string,Words>={mara:['“我今天看见一个旧茶杯里冒出新叶。坐下来讲给你听，才想起我也可以只来做客。”','“I saw a new leaf in an old teacup today. Sitting down to tell you reminds me that I can simply be a guest too.”'],avery:['“这一页还没画完。今天我想留一点空白给我们坐着的这一会儿。”','“This page is unfinished. Today I want to leave a little space for this time sitting together.”'],samira:['“我带了两句没名字的小调。唱到哪里都可以停，你也可以讲讲今天听到的声音。”','“I brought two lines of an unnamed tune. I can stop anywhere. Tell me about a sound you heard today, if you like.”']};
export function neighborTopics(s:Save,p:string):LifeTopic[]{const party=s.neighborChapterV1?.party;return neighborPartyActive(s)&&party?.people.includes(p)&&!party.chatted.includes(p)?[{id:'neighbor-chat',label:['聊聊今天，留下一段共同记忆','Talk about today and share a moment'],reply:remarks[p],once:false}]:[]}
export function applyNeighborTopic(s:Save,p:string,id:string){if(id!=='neighbor-chat')return;if(!neighborTopics(s,p).length)throw Error('NEIGHBOR_TOPIC_UNAVAILABLE');s.neighborChapterV1!.party!.chatted.push(p)}
export function neighborDescription(s:Save,id:string):Words|undefined{
 if(id!=='neighbor-gathering')return;const p=neighborProgress(s),party=s.neighborChapterV1?.party;
 if(party&&party.scene==='coast'&&s.scene==='chapel'&&daylight(s))return ['可以把原来的海岸小聚移到教堂室内，保留已聊过的内容。','You can move the coast gathering inside the chapel, keeping the conversations already shared.'];
 if(party)return neighborPartyActive(s)?[`小聚已经开始。已聊过${party.chatted.length}/${party.people.length}位邻居；分别走近他们聊天后，回来记下这次相聚。`,`The gathering has begun. You have talked with ${party.chatted.length}/${party.people.length} neighbors. Approach each one, then return here to remember the visit.`]:['约定还保留着。白天回到相聚地点，就能继续；大家此刻按原作息生活。','Your invitation remains. Return to its place during the day to continue. Everyone follows their usual routine meanwhile.'];
 const candidates=gatheringResidents.map(id=>s.known.includes(id)?people[id].name:people[id].unknown);const options:Words=[candidates.map(n=>n[0]).join('、'),candidates.map(n=>n[1]).join(', ')];
 const note=p.invitationUnlocked?['“邀约小聚”已经永久开放。选一两位熟悉的邻居，再开始这次相聚。','Small invitations are permanently open. Select one or two familiar neighbors, then begin.']:[`已认识${Math.min(4,p.known.length)}/4人，走访${Math.min(3,p.places.length)}/3个公共地点；${Math.min(2,p.ready.length)}/2位邻居已熟悉且兑现小事。先和${options[0]}中的两位慢慢熟悉。`,`People met: ${Math.min(4,p.known.length)}/4. Public places visited: ${Math.min(3,p.places.length)}/3. Familiar neighbors with a kept small promise: ${Math.min(2,p.ready.length)}/2. Take time with two of ${options[1]}.`];
 const picked=s.neighborChapterV1?.invited??[],rain=s.scene==='coast'&&weatherForSave(s)==='light-rain';
 return [note[0]+(picked.length?` 已选：${names(picked)[0]}。`:'')+(rain?' 下雨了，可到教堂室内相聚，公共通路仍开放。':''),note[1]+(picked.length?` Selected: ${names(picked)[1]}.`:'')+(rain?' It is raining. Meet inside the chapel instead; public routes remain open.':'')];
}
export function neighborNext(s:Save):{text:Words;place?:string}{
 const progress=neighborProgress(s),party=s.neighborChapterV1?.party;
 if(party&&party.scene==='coast'&&weatherForSave(s)==='light-rain')return {text:['下雨了，原约定和对话都保留。到教堂的一起坐坐处继续这次小聚。','It is raining. Your invitation and conversations remain. Continue the same gathering at the chapel meeting point.'],place:'chapel'};
 if(party)return {text:neighborPartyActive(s)?[`小聚：已聊过${party.chatted.length}/${party.people.length}位；分别走近他们聊聊，再到入口记下相聚。`,`Gathering: talked with ${party.chatted.length}/${party.people.length}. Approach each guest, then remember the visit at its meeting point.`]:[`约定保留着，白天回到${rooms[party.scene].title[0]}继续。`,`Your invitation remains. Return to ${rooms[party.scene].title[1]} during the day.`],place:party.scene};
 if(progress.known.length<4){
  const room=Object.values(rooms).find(r=>r.entities.some(e=>e.person&&!progress.known.includes(e.person)&&!e.gatheringRole&&presentEntity({...s,scene:r.id},e)));
  if(room)return {text:[`去${room.title[0]}和还没认识的街坊打个招呼，也可先聊聊身边的人。`,`Say hello to someone new at ${room.title[1]}, or talk with the neighbors nearby first.`],place:room.id};
 }
 if(progress.places.length<3){const place=publicPlaces.find(id=>!s.visited.includes(id)&&rooms[s.scene].neighbors.includes(id))??publicPlaces.find(id=>!s.visited.includes(id));if(place)return {text:[`沿公共路线去${rooms[place].title[0]}看看，先认识这里的生活。`,`Follow the public route to ${rooms[place].title[1]} and take a look at life there.`],place}}
 if(!progress.firstReady&&!progress.invitationUnlocked){const person=gatheringResidents.find(p=>s.known.includes(p)&&!progress.ready.includes(p));if(person){const hint=relationshipNext(s,person)!;const name=people[person].name;return {text:[`和${name[0]}慢慢熟悉。${hint.text[0]}`,`Take time with ${name[1]}. ${hint.text[1]}`],...(hint.place?{place:hint.place}:{})}}}
 return {text:['海岸可以看海；下雨时到教堂室内坐坐。任务不超时。','Sit by the sea, or meet inside the chapel when it rains. This invitation does not expire.'],place:weatherForSave(s)==='light-rain'?'chapel':'coast'};
}
export function neighborObjective(s:Save):Words|undefined{return s.neighborChapterV1?.party?neighborNext(s).text:undefined}
export function neighborStoryLeads(s:Save):StoryLead[]{
 const p=neighborProgress(s),next=neighborNext(s);if(!p.known.length)return [];
 return [{id:'neighbor-chapter',title:p.invitationUnlocked?['邀约小聚','Small invitations']:['从问候到相聚','From hello to time together'],people:p.known.slice(0,4),state:p.invitationUnlocked?'done':'active',summary:p.invitationUnlocked?['你们已经相聚过。“邀约小聚”在海岸和教堂常驻开放，可选一两位熟悉的邻居再见。','You have met together. Small invitations remain available at the coast and chapel for one or two familiar neighbors.']:[`相识${Math.min(4,p.known.length)}/4，公共地点${Math.min(3,p.places.length)}/3，熟悉并兑现小事${Math.min(2,p.ready.length)}/2。`,`Meet ${Math.min(4,p.known.length)}/4 people, visit ${Math.min(3,p.places.length)}/3 public places, and keep a small promise for ${Math.min(2,p.ready.length)}/2 familiar neighbors.`],next:next.text,...(next.place?{place:next.place}:{})},
 {id:'neighbor-roster',title:['认识这一章的街坊','Meet this chapter’s neighbors'],people:p.known.slice(0,4),state:p.allKnown?'done':'active',summary:p.allKnown?['这一章的街坊已经相识，这份完成记录保留。','You have met this chapter’s neighbors. That completion stays.']:[`按本章固定名单，已认识${roster(s).filter(id=>p.known.includes(id)).length}/${p.rosterCount}人。可以慢慢来。`,`You have met ${roster(s).filter(id=>p.known.includes(id)).length}/${p.rosterCount} people on this chapter’s fixed list. Take your time.`]}];
}
export function validNeighborChapter(s:Save){
 const m=s.neighborChapterV1;if(m===undefined)return true;const number=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=townMinutes(s),keys=(v:any,allowed:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k)),ids=(v:unknown)=>Array.isArray(v)&&v.length<=2&&new Set(v).size===v.length&&v.every(id=>gatheringResidents.includes(id as any)&&s.known.includes(id));
 if(!keys(m,['schema','rules','roster','invited','party','lastParty','gatheredAt','allKnownAt'])||m.schema!==1||m.rules!=='neighbor-chapter-v1'||!['harbor22-v1','harbor23-priest-v2'].includes(m.roster)||!ids(m.invited)||m.gatheredAt!==undefined&&!number(m.gatheredAt)||m.allKnownAt!==undefined&&!number(m.allKnownAt))return false;
 if(m.party!==undefined&&(!keys(m.party,['scene','people','chatted','startedAt','first'])||!['coast','chapel'].includes(m.party.scene)||!ids(m.party.people)||m.party.people.length<(m.party.first?2:1)||!Array.isArray(m.party.chatted)||new Set(m.party.chatted).size!==m.party.chatted.length||m.party.chatted.some(id=>!m.party!.people.includes(id))||!number(m.party.startedAt)||typeof m.party.first!=='boolean'||m.party.first!==(m.gatheredAt===undefined)||m.invited.length))return false;
 if(m.lastParty!==undefined&&(!keys(m.lastParty,['scene','people','endedAt'])||!['coast','chapel'].includes(m.lastParty.scene)||!ids(m.lastParty.people)||!m.lastParty.people.length||!number(m.lastParty.endedAt)||m.gatheredAt===undefined||m.gatheredAt>m.lastParty.endedAt))return false;
 return m.gatheredAt===undefined?m.lastParty===undefined:!!m.lastParty;
}
