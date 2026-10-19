/** Read-only diagnostic metadata: never copy IDs, tokens, URL values or storage. */
export const ENTRY_DIAGNOSTIC_VERSION='entry-diag-v3-bootstrap-status';
const safeCodes=new Set([
 'PLATFORM_LOGIN_REQUIRED','PLATFORM_ID_UNAVAILABLE','PLATFORM_LOGIN_UNAVAILABLE','PLATFORM_TOKEN_REQUIRED','PLATFORM_ID_MISMATCH','PLATFORM_ID_INVALID','PLATFORM_TELEGRAM_ID_MISMATCH',
 'PLATFORM_HTTP_REJECTED','PLATFORM_HTTP_UNAVAILABLE','PLATFORM_RETCODE_INVALID','PLATFORM_ERRCODE_INVALID','PLATFORM_MSG_INVALID','PLATFORM_CONTENT_TYPE_INVALID','PLATFORM_BODY_MISSING','PLATFORM_BODY_TOO_LARGE','PLATFORM_JSON_INVALID','PLATFORM_TELEGRAM_ID_INVALID','PLATFORM_VERIFICATION_UNAVAILABLE',
 'SERVICE_UNAVAILABLE','PLAYER_SESSION_REQUIRED','INVALID_WRITE_ORIGIN','ORIGIN_FORBIDDEN','PLATFORM_MODE_MISMATCH','IDENTITY_CHANGED','RESPONSE_JSON_INVALID'
]);
let bootstrapFailure:{code:string;httpStatus:number|null}|null=null;
/** Only allowlisted error codes and an HTTP status enter the in-memory UI. */
export function recordBootstrapFailure(error:unknown){
 const e=error as {message?:unknown;status?:unknown}|null;
 bootstrapFailure={code:typeof e?.message==='string'&&safeCodes.has(e.message)?e.message:'UNCLASSIFIED',httpStatus:Number.isInteger(e?.status)&&Number(e?.status)>=100&&Number(e?.status)<=599?Number(e?.status):null};
}
export function clearBootstrapFailure(){bootstrapFailure=null}
export function readEntryDiagnostics(w:any){
 try{
 const a=w.Aigram,g=w.__ALTERU_GUEST__,q=new URLSearchParams(w.location?.search??'');
 const classify=(v:unknown)=>v==null||v===''?'missing':v==='__alteru_guest__'?'guest':typeof v==='number'&&!Number.isSafeInteger(v)?'unsafe-number':/^[1-9][0-9]{0,19}$/.test(String(v))?'numeric':'other';
 const candidateId=typeof a?.telegramId==='string'&&/^[1-9][0-9]{0,19}$/.test(a.telegramId)?'numeric-string':a?.telegramId==null||a.telegramId===''?'missing':'invalid-type-or-shape';
 const tokenReady=typeof a?.token==='string'&&/^[\x21-\x7e]{1,4096}$/.test(a.token);
 let frameContext='unavailable';try{if(w.parent)frameContext=w.parent===w?'top-level':'embedded'}catch{/* cross-context getter: expose only enum */}
 const query=q.get('telegram_id');
 const extensionVersion=typeof g?.version==='string'&&/^(?:dev|[0-9]+\.[0-9]+\.[0-9]+(?:\+[0-9a-f]{7,40})?)$/.test(g.version)?g.version:'absent-or-other';
 return {snapshotStatus:'ok',diagnostic:ENTRY_DIAGNOSTIC_VERSION,bootstrapFailureCode:bootstrapFailure?.code??'none',bootstrapHttpStatus:bootstrapFailure?.httpStatus??'not-returned',frameContext,extensionPresent:!!g,extensionVersion,
  platformQuery:!!query&&query!=='__alteru_guest__',apiOriginPresent:q.has('api_origin'),launchIdentity:classify(query),liveIdentity:classify(a?.telegramId),
  candidateId,tokenPresent:tokenReady,credentialPairReady:candidateId==='numeric-string'&&tokenReady,
  shellFlag:typeof a?.isInAigram==='boolean'?String(a.isInAigram):'absent-or-other',
  guestWeb:a?.isGuestWeb===true,guestTransport:a?.__alteruGuestTransportPatched===true,
  nativeBridge:typeof w.webkit?.messageHandlers?.aigram?.postMessage==='function',
  webTransport:typeof a?.callAigramAPI==='function',
  pageClass:w.location?.hostname==='game.aiwaves.tech'?'primary':w.location?.hostname==='yinxinghuan.github.io'?'mirror':'other'};
 }catch{return {snapshotStatus:'read-error',diagnostic:ENTRY_DIAGNOSTIC_VERSION}}
}
