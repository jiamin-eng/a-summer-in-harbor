import {createNoParamTokenCandidateProbe} from './platform-no-param-token-candidate';

export const PLATFORM_VERIFIED_MODE='platform-verified-v1';
export const PLATFORM_CANDIDATE_CONTRACT='candidate-token-owner-v1';
export const PLATFORM_SELF_URL='https://aigram.aiwaves.tech/note/wallet/aigram/get/alteru/window/info';

/** Wang Xing's no-parameter GET contract was relayed by the user: data.telegram_id
 * is the current token subject. Candidate mode remains disabled by default. */
export function createPlatformTokenVerifier({fetchImpl=fetch,timeoutMs=3000}:{fetchImpl?:typeof fetch;timeoutMs?:number}={}){
 const probe=createNoParamTokenCandidateProbe({endpoint:PLATFORM_SELF_URL,fetchImpl,timeoutMs});
 return async (telegramId:unknown,bearerHeader:unknown)=>{
  try{
   const result=await probe(telegramId,bearerHeader);
   return Object.freeze({telegramId:result.telegramId,assurance:'platform-token-bound-v1' as const});
  }catch(error){
   const raw=error instanceof Error?error.message:'';
   const known=new Set(['PLATFORM_HTTP_UNAVAILABLE','PLATFORM_HTTP_REJECTED','PLATFORM_ID_INVALID','PLATFORM_TELEGRAM_ID_MISMATCH','PLATFORM_TOKEN_REQUIRED','PLATFORM_RETCODE_INVALID','PLATFORM_ERRCODE_INVALID','PLATFORM_CONTENT_TYPE_INVALID','PLATFORM_BODY_MISSING','PLATFORM_BODY_TOO_LARGE','PLATFORM_JSON_INVALID','PLATFORM_TELEGRAM_ID_INVALID']);
   const code=known.has(raw)?raw:'PLATFORM_VERIFICATION_UNAVAILABLE';
   const status=code==='PLATFORM_HTTP_UNAVAILABLE'||code==='PLATFORM_VERIFICATION_UNAVAILABLE'?503:code==='PLATFORM_ID_INVALID'?400:code==='PLATFORM_TELEGRAM_ID_MISMATCH'||code==='PLATFORM_TOKEN_REQUIRED'||code==='PLATFORM_HTTP_REJECTED'||code==='PLATFORM_RETCODE_INVALID'||code==='PLATFORM_ERRCODE_INVALID'?401:502;
   throw Object.assign(Error(code),{code,status});
  }
 };
}
