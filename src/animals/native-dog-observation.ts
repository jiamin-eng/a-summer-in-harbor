import type {AnimalState} from './types';
import type {Words} from '../world/data';

/** A transient UI snapshot, never an observation proof or persisted memory. */
export type NativeDogRoutine='following'|'waiting-space'|'waiting-caretaker'|'waiting';
export function nativeDogRoutine(frame:Pick<AnimalState,'visible'|'species'|'phase'|'reason'>):NativeDogRoutine|undefined{
 if(!frame.visible||frame.species!=='dog')return;
 if(frame.reason==='space-occupied')return 'waiting-space';
 if(frame.reason==='owner-away'||frame.reason==='owner-outpaced')return 'waiting-caretaker';
 return frame.phase==='follow'?'following':'waiting';
}
const text:Record<NativeDogRoutine,Words>={
 following:['刚才，它正跟着照看它的人走。让开一点，看看它们往哪里去。','It was following its caretaker. Leave a little room and watch where they go.'],
 'waiting-space':['刚才，它停下来等空位。让开一些，再看看它是否继续跟着照看它的人走。','It stopped to leave room. Step aside, then watch whether it follows its caretaker again.'],
 'waiting-caretaker':['刚才，它停下来等照看它的人靠近。给它一点时间。','It was waiting for its caretaker to come closer. Give it a little time.'],
 waiting:['刚才，它在安静等候。给它留一点空间，看看照看它的人接下来去哪。','It was waiting quietly. Leave it some room and watch where its caretaker goes next.'],
};
export function nativeDogRoutineText(routine:NativeDogRoutine|undefined,fallback:Words):Words{
 return routine&&Object.hasOwn(text,routine)?text[routine]:fallback;
}
