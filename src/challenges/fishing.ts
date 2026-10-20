/** Deterministic hold/release fishing. No client-declared rewards. */
export type FishingRun={ticks:number;reel:boolean};
export type FishingState={tick:number;tension:number;progress:number;dangerTicks:number;result:'playing'|'caught'|'escaped'};
export const fishingInitial=():FishingState=>({tick:0,tension:.12,progress:0,dangerTicks:0,result:'playing'});
export const fishingPull=(tick:number)=>tick<90?.15:(Math.sin((tick-90)/58)+1)/2;
export function fishingStep(before:FishingState,reel:boolean,profile:'first'|'regular'='regular'):FishingState{
 if(before.result!=='playing')return before;
 const s={...before},pull=fishingPull(s.tick);
 s.tension=Math.max(0,Math.min(1.1,s.tension+(reel?(profile==='first'?.002+pull*.007:.004+pull*.018):-.016)));
 s.progress=Math.max(0,Math.min(1,s.progress+(reel?(profile==='first'?.008-pull*.002:.0045-pull*.0027):-.0004)));
 s.dangerTicks=s.tension>=1?s.dangerTicks+1:0;s.tick++;
 if(s.dangerTicks>=(profile==='first'?24:10)||s.tick>=1500)s.result='escaped';
 else if(s.progress>=1)s.result='caught';
 return s;
}
export function recordFishing(runs:FishingRun[],reel:boolean){const tail=runs.at(-1);if(tail?.reel===reel)tail.ticks++;else runs.push({reel,ticks:1})}
export function replayFishing(runs:FishingRun[],profile:'first'|'regular'='regular'):FishingState{
 if(!Array.isArray(runs)||!runs.length||runs.length>1500)throw Error('INVALID_FISHING_INPUT');
 let s=fishingInitial(),ticks=0;
 for(const run of runs){
  if(typeof run.reel!=='boolean'||!Number.isInteger(run.ticks)||run.ticks<1||(ticks+=run.ticks)>1500)throw Error('INVALID_FISHING_INPUT');
  for(let n=0;n<run.ticks;n++){if(s.result!=='playing')throw Error('INPUT_AFTER_RESULT');s=fishingStep(s,run.reel,profile)}
 }
 return s;
}
