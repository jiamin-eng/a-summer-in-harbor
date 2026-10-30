/** C: one timing decision, then a presentation-only haul. No synthetic reel replay. */
export type TapWindow={schema:1;biteTick:45;hookWindow:120|180};
export type TapInput={hookTick:number|null;waitTicks:number;runs:[]};
export const tapWindow=(first=false):TapWindow=>({schema:1,biteTick:45,hookWindow:first?180:120});
export function validTapWindow(w:unknown):w is TapWindow{
 const v=w as TapWindow;return !!v&&v.schema===1&&v.biteTick===45&&[120,180].includes(v.hookWindow);
}
/** The tap the fishing scene records: a hook tick, or a miss when the window ends. */
export function shoreTap(window:{biteTick:number;hookWindow:number},hookTick:number|null):TapInput{
 if(hookTick===null)return {hookTick:null,waitTicks:window.biteTick+window.hookWindow,runs:[]};
 return {hookTick,waitTicks:hookTick,runs:[]};
}
export function replayTap(w:TapWindow,input:{hookTick:number|null;waitTicks:number;runs:unknown[]}){
 const fail=()=>{throw Error('INVALID_FISHING_TAP_INPUT')};
 if(!validTapWindow(w)||!input||!Array.isArray(input.runs)||input.runs.length||!Number.isSafeInteger(input.waitTicks)||input.waitTicks<0||input.waitTicks>w.biteTick+w.hookWindow)fail();
 if(input.hookTick===null){if(input.waitTicks!==w.biteTick+w.hookWindow)fail();return{result:'escaped' as const}}
 if(!Number.isSafeInteger(input.hookTick)||input.hookTick!<0||input.hookTick!>=w.biteTick+w.hookWindow||input.waitTicks!==input.hookTick)fail();
 return{result:input.hookTick!>=w.biteTick?'caught' as const:'escaped' as const};
}
