import {neighborPartyActive} from '../world/neighbor-gathering';
import {techNomad,nomadSchedule,nomadNextConversation,nomadDeferral,nomadActivity} from '../world/tech-nomads';
import {nomadRoutine} from './tech-nomads';
import {rooms,people,type Words} from '../world/data';
import {residentRoutes,townMinutes,townPeriod,residentPeople,type TownState} from '../world/residents';
import {longTravelMinutes} from '../candidate/continuity';
import type {MovingClock} from '../candidate/clock-types';
type GuideState=TownState&{visited:string[];movingClock?:MovingClock};
export function routineReply(person:string):Words{const n=nomadRoutine(person);if(n)return n;const r=residentRoutes[person];return [`“上午常在${rooms[r[0].scene].title[0]}，十二点后去${rooms[r[1].scene].title[0]}，十七点到二十一点通常在${rooms[r[2].scene].title[0]}。只是平日的习惯，不用特意赶。”`, `“Mornings usually find me at ${rooms[r[0].scene].title[1]}, after noon at ${rooms[r[1].scene].title[1]}, and from 17:00 to 21:00 at ${rooms[r[2].scene].title[1]}. Just my usual routine. No need to rush.”`]}
export function learnedRoutine(s:TownState,person:string){return !!residentRoutes[person]&&s.known.includes(person)&&s.flags.includes(`talk:${person}:routine`)}
export function residentGuide(s:TownState,person:string){
 if(!learnedRoutine(s,person))return null;
  const party=s.neighborChapterV1?.party;if(neighborPartyActive(s)&&party?.people.includes(person))return {current:party.scene,next:null,at:'',now:[`正在${rooms[party.scene].title[0]}与你小聚。`,`Meeting with you at ${rooms[party.scene].title[1]}.`] as Words,then:['相聚暂停或结束后按平日作息生活。','Usual routines resume when the visit pauses or ends.'] as Words,mapScene:party.scene};
 const schedule=nomadSchedule(person,s);if(techNomad(person)&&schedule){const m=townMinutes(s)%1440,current=schedule.scene,activity=nomadActivity(person,s)!;const future=current?nomadSchedule(person,{townMinutes:townMinutes(s)+schedule.end-m}):nomadSchedule(person,{townMinutes:nomadNextConversation(person,s)!.minute});const next=future?.scene??null,at=String((current?schedule.end:360)/60).padStart(2,'0')+':00';const now:Words=current?[`现在常在${rooms[current].title[0]}。${nomadDeferral(person,s)?.[0]??activity[0]}`,`Usually at ${rooms[current].title[1]} now. ${nomadDeferral(person,s)?.[1]??activity[1]}`]:['夜间在住处休息。','Resting off-screen for the night.'];const then:Words=next?[`${!current&&m>=1260?'明天 ':''}${at} 后常去${rooms[next].title[0]}。`,`${!current&&m>=1260?'Tomorrow ':''}${at}: usually ${rooms[next].title[1]}.`]:['21:00 后休息，明早06:00继续。','Resting after 21:00; another day begins at 06:00.'];return {current,next,at,now,then,mapScene:current??next};}
 if(person==='mara'&&!s.flags.includes('bag-returned'))return {current:'station',next:'station',at:'',now:['工具袋归还之前，玛拉会在车站街等你。','Mara waits on Station Street until her tool bag is returned.'] as Words,then:['先把行李放好，不用赶时间。','Put your bag down first. No rush.'] as Words,mapScene:'station'};
 const r=residentRoutes[person],period=townPeriod(s),index=['morning','afternoon','evening'].indexOf(period),m=townMinutes(s)%1440;
 const current=index<0?null:r[index].scene,next=index===0?r[1].scene:index===1?r[2].scene:index===2?null:r[0].scene;
 const at=index===0?'12:00':index===1?'17:00':index===2?'21:00':m<360?'06:00':'06:00';
 const now:Words=current?[`这个时段常在：${rooms[current].title[0]}`,`Usually now: ${rooms[current].title[1]}`]:['夜间通常不外出。','Usually away for the night.'];
 const then:Words=next?[`${index<0&&m>=1260?'明天 ':''}${at} 后常去：${rooms[next].title[0]}`,`${index<0&&m>=1260?'Tomorrow ':''}${at}: usually ${rooms[next].title[1]}`]:['21:00 后通常不外出。','Usually away after 21:00.'];
 return {current,next,at,now,then,mapScene:current??next};
}
/** This estimate describes the declared single quick-travel action only.
 * Unvisited places stay locked; no graph route or movement is manufactured. */
export function arrivalWarnings(s:GuideState,destination:string):Words[]{
 if(destination===s.scene||!s.visited.includes(destination))return [];
 const minutes=s.movingClock?longTravelMinutes(s.scene,destination):20,after={...s,townMinutes:townMinutes(s)+minutes};const warnings:Words[]=[],trip:Words=minutes===20?['这次路上约二十分钟。','This trip takes twenty minutes.']:[`这次路上约${minutes}分钟。`,`This trip takes ${minutes} minutes.`];
 for(const p of s.known){const before=residentGuide(s,p),next=residentGuide(after,p);if(!before||!next||before.current!==destination||next.current===destination)continue;
  const name=people[p].name;warnings.push(next.current?[`${trip[0]}抵达时，${name[0]}通常已去${rooms[next.current].title[0]}。`, `${trip[1]} By arrival, ${name[1]} usually moves on to ${rooms[next.current].title[1]}.`]:[`${trip[0]}抵达时，${name[0]}通常已结束今天的外出。`,`${trip[1]} By arrival, ${name[1]} is usually away for the night.`]);
 }return warnings;
}
