import {isInAigramNow} from '../shared/runtime/bridge';import {GAME_UUID} from '../game-id';import {IdentityEpoch} from './epoch';
export function liveShellAccount():string|null{
 const w=window as any;
 // Native hosts may publish the live account before the web shell flag. An
 // explicit false remains logout; neither launch queries nor guest IDs qualify.
 const native=typeof w.webkit?.messageHandlers?.aigram?.postMessage==='function';
 if(!isInAigramNow()&&!(native&&w.Aigram?.isInAigram===undefined))return null;
 // A top-level URL can make the public shell populate an ID without a host.
 // Require an actual existing transport context, not that query-only shim.
 if(w.parent===w&&typeof w.Aigram?.callAigramAPI!=='function'&&typeof w.webkit?.messageHandlers?.aigram?.postMessage!=='function')return null;
 // Deliberately no launch-query fallback: an empty live shell after logout must
 // not resurrect the previous account from the URL.
 const raw=(window as any).Aigram?.telegramId;
 if(raw===undefined||raw===null||raw===''||raw==='__alteru_guest__')return null;
 if(typeof raw==='number'&&!Number.isSafeInteger(raw))return '__invalid_shell_identity__';
 const value=String(raw);if(!/^[1-9][0-9]{0,19}$/.test(value))return '__invalid_shell_identity__';return value;
}
export const identityEpoch=new IdentityEpoch(liveShellAccount);
// The published account policy is known before bootstrap: never bootstrap as a
// browser first, and never turn a missing platform ID into a guest journey.
identityEpoch.enable(true);
export const identitySnapshot=()=>identityEpoch.capture();
export function enableAccountMode(mode:string){identityEpoch.enable(mode==='temporary-unverified')}
export function subscribeIdentityChange(fn:()=>void){const stop=identityEpoch.subscribe(fn);const poll=()=>{try{identityEpoch.observe()}catch{/* request reports malformed shell identity without choosing a new account */}};const t=setInterval(poll,100);window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);return()=>{stop();clearInterval(t);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll)}}
export async function identityFetch(input:RequestInfo|URL,init:RequestInit={},snapshot=identitySnapshot()){
 snapshot.assert();const headers=new Headers(init.headers);headers.set('X-Harbor-Game',GAME_UUID);
 if(snapshot.account){if(!/^[1-9][0-9]{0,19}$/.test(snapshot.account))throw Error('INVALID_SHELL_IDENTITY');headers.set('X-Harbor-Identity-Mode','temporary-unverified');headers.set('X-Harbor-Telegram-Id',snapshot.account)}
 const signal=init.signal?AbortSignal.any([snapshot.signal,init.signal]):snapshot.signal;
 const r=await fetch(input,{...init,headers,signal,credentials:'same-origin'});snapshot.assert();return r;
}
