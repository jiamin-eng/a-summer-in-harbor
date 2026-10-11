import type {AnimalSave} from './types';
import type {Words} from '../world/data';

/** Uses the existing persisted 0..3 memory; greeting itself is transient. */
export const familiarCatGreeting=Object.freeze({minimum:2,distance:80,rearmDistance:104,seconds:1.2});
export function catFamiliarities(memory:AnimalSave|undefined):Readonly<Record<string,number>>{
 return Object.fromEntries(Object.entries(memory?.individuals??{}).filter(([id,m])=>/^harbor-cat-\d+$/.test(id)&&Number.isSafeInteger(m.familiarity)&&m.familiarity>=0&&m.familiarity<=3).map(([id,m])=>[id,m.familiarity]));
}
const levels:Words[]=[
 ['熟悉程度：刚认识','Familiarity: just met'],
 ['熟悉程度：开始熟悉','Familiarity: getting acquainted'],
 ['熟悉程度：会认出你，散步时会停下来看看你','Familiarity: recognizes you and pauses to look at you on its stroll'],
 ['熟悉程度：很熟悉你，散步时会停下来看看你','Familiarity: comfortable with you and pauses to look at you on its stroll'],
];
export function catFamiliarityView(memory:AnimalSave|undefined,id:string,minute:number){
 const level=catFamiliarities(memory)[id]??0,last=memory?.individuals[id]?.lastPetMinute;
 return {level,words:levels[level],pettedToday:last!==undefined&&Math.floor(last/1440)===Math.floor(minute/1440)};
}
