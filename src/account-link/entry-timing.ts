export type EntryStage='host-identity'|'bootstrap'|'session-directory'|'session-get'|'scene-assets'|'dynamic-assets'|'renderer';
type Sample={stage:EntryStage;startMs:number;durationMs:number;outcome:'ready'|'failed'};
const samples:Sample[]=[];
/** Bounded in-memory timings only. No identities, URL values, errors or storage. */
export const readEntryTimings=()=>samples.map(sample=>({...sample}));
export function entryTimer(stage:EntryStage){
 const start=performance.now();let done=false;
 return (outcome:Sample['outcome']='ready')=>{if(done)return;done=true;samples.push({stage,startMs:Math.round(start),durationMs:Math.round(performance.now()-start),outcome});if(samples.length>48)samples.shift()};
}
export async function entrySpan<T>(stage:EntryStage,work:()=>Promise<T>):Promise<T>{
 const end=entryTimer(stage);let outcome:Sample['outcome']='failed';
 try{const result=await work();outcome='ready';return result}finally{end(outcome)}
}
