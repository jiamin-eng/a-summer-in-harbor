import {callAigramAPI,api_origin} from '../shared/runtime/bridge';
import {GAME_UUID} from '../game-id';
import {liveShellAccount,identitySnapshot} from './transport';
import {candidatePlatformTokenEnabled,liveHostToken} from './platform-token';

let opening:Promise<string>|undefined;
const currentAccount=()=>{const id=liveShellAccount();return id&&id!=='__invalid_shell_identity__'?id:null};
/** Opens the existing shell's authenticated transport. The platform owns the
 * email form, verification and session; the game reads its live ID afterwards. */
export function signInToPlatform(force=false):Promise<string>{
 if(opening)return opening;
 const known=currentAccount();if(known&&!force)return Promise.resolve(known);
 const priorToken=force?liveHostToken():null;
 opening=(async()=>{
  const deadline=Date.now()+10000;
  const native=()=>typeof (window as any).webkit?.messageHandlers?.aigram?.postMessage==='function';
  // An embedded platform host uses the canonical parent postMessage route.
  // Transport availability never substitutes for the existing live identity gate.
  const framed=()=>window.parent!==window&&(window as any).Aigram?.isInAigram===true&&!!api_origin;
  const canonical=()=>native()||(framed()&&typeof (window as any).Aigram?.callAigramAPI!=='function');
  while(typeof (window as any).Aigram?.callAigramAPI!=='function'&&!canonical()){
   const id=currentAccount();if(id&&!force)return id;
   if(Date.now()>=deadline)throw Error('PLATFORM_LOGIN_UNAVAILABLE');
   await new Promise<void>(resolve=>setTimeout(resolve,100));
  }
  return new Promise<string>((resolve,reject)=>{
   let settled=false,sawDialog=false,closedAt:number|undefined,statsAt:number|undefined,statsFailed=false;
   const finish=(id:string|null,error?:unknown)=>{if(settled)return;settled=true;clearInterval(poll);clearTimeout(timeout);if(id){identitySnapshot().assert();resolve(id)}else reject(error??Error('PLATFORM_ID_UNAVAILABLE'))};
   // The protected GET opens the original login window. Its statistics reply
   // may arrive after the shell has authenticated and published the live ID;
   // that unrelated reply must not keep the game's entry action locked.
   const check=()=>{const id=currentAccount();if(id&&(!force||id!==known||liveHostToken()!==priorToken||statsAt!==undefined&&!statsFailed)){finish(id);return}
    const dialog=typeof document!=='undefined'&&document.querySelector('#alteru-guest-login');
    if(dialog){sawDialog=true;closedAt=undefined}
    else if(sawDialog){closedAt??=Date.now();if(Date.now()-closedAt>=(candidatePlatformTokenEnabled?10000:2000))finish(null,Error('PLATFORM_ID_UNAVAILABLE'))}
    else if(candidatePlatformTokenEnabled&&statsAt!==undefined&&Date.now()-statsAt>=10000)finish(null,Error(statsFailed?'PLATFORM_LOGIN_REQUIRED':'PLATFORM_ID_UNAVAILABLE'))
   };
   const poll=setInterval(check,100);
   // Web sign-in can wait for human OTP entry; bound only canonical host round-trips.
   const timeout=canonical()?setTimeout(()=>finish(currentAccount(),Error('PLATFORM_LOGIN_UNAVAILABLE')),candidatePlatformTokenEnabled?30000:10000):undefined;
   try{
    const request=canonical()?callAigramAPI:(window as any).Aigram.callAigramAPI.bind((window as any).Aigram);
    const reply=request(`/note/aigram/ai/game/get/play/stats?session_id=${encodeURIComponent(GAME_UUID)}&event=play`,'GET',null);
    Promise.resolve(reply).then(result=>{if(settled)return;const id=currentAccount();if(id&&!force){finish(id);return}if(candidatePlatformTokenEnabled){statsAt=Date.now();statsFailed=!(result&&(result.retcode===0||result.errcode===0));check();return}finish(null,Error(result&&(result.retcode===0||result.errcode===0)?'PLATFORM_ID_UNAVAILABLE':'PLATFORM_LOGIN_REQUIRED'))},error=>{if(settled)return;if(candidatePlatformTokenEnabled){statsAt=Date.now();statsFailed=true;check()}else finish(currentAccount(),error)});
    check();
   }catch(error){finish(currentAccount(),error)}
  });
 })().finally(()=>{opening=undefined});
 return opening;
}
