/** Candidate build gate. The 55c8 build has no such setting, so it never
 * reads or sends the platform token. No query, storage, or cookie fallback. */
export const candidatePlatformTokenEnabled=(import.meta as ImportMeta & {env?:Record<string,string>}).env?.VITE_HARBOR_PLATFORM_TOKEN_MODE==='candidate-token-owner-v1';
const tokenPattern=/^[\x21-\x7e]{1,4096}$/;
export function readHostAccountId(host:unknown,verifiedCandidate:boolean):string|null{
 const aigram=(host as {Aigram?:{telegramId?:unknown}}|undefined)?.Aigram;
 // GuestWeb, TelegramMiniApp and NativeApp expose the same live shell field.
 // The backend still verifies that this claimed ID belongs to the token.
 const raw=aigram?.telegramId;
 if(raw===undefined||raw===null||raw===''||raw==='__alteru_guest__')return null;
 if(verifiedCandidate&&typeof raw!=='string'||typeof raw==='number'&&!Number.isSafeInteger(raw))return '__invalid_shell_identity__';
 const value=String(raw);return /^[1-9][0-9]{0,19}$/.test(value)?value:'__invalid_shell_identity__';
}
export function assertCandidateSameOrigin(input:RequestInfo|URL,base:string){
 const target=new URL(input instanceof Request?input.url:String(input),base);
 if(target.origin!==new URL(base).origin)throw Error('PLATFORM_FETCH_ORIGIN_INVALID');
}
export function liveHostToken(host:unknown=typeof window==='undefined'?undefined:window):string|null{
 const value=(host as {Aigram?:{token?:unknown}}|undefined)?.Aigram?.token;
 return typeof value==='string'&&tokenPattern.test(value)?value:null;
}
/** Adds only live host credentials to an already local request. The returned
 * token remains request-local so the caller can reject a switched host. */
export function attachIdentityHeaders(headers:Headers,account:string|null,host:unknown,verifiedCandidate:boolean):string|null{
 if(account&&!/^[1-9][0-9]{0,19}$/.test(account))throw Error('INVALID_SHELL_IDENTITY');
 headers.delete('Authorization');
 if(account){headers.set('X-Harbor-Telegram-Id',account);headers.set('X-Harbor-Identity-Mode',verifiedCandidate?'platform-verified-v1':'temporary-unverified')}
 if(!verifiedCandidate)return null;
 if((host as {Aigram?:{telegramId?:unknown}}|undefined)?.Aigram?.telegramId!==account)throw Error('PLATFORM_ID_MISMATCH');
 const token=liveHostToken(host);
 if(!account||!token)throw Error('PLATFORM_TOKEN_REQUIRED');
 headers.set('Authorization','Bearer '+token);
 return token;
}
