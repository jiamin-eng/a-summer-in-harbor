import type {IncomingMessage,ServerResponse} from 'node:http';
// @ts-expect-error local candidate, same authority database
import {createAccountJourneyService} from './account-journeys.mjs';
import {temporaryActor,TEMPORARY_IDENTITY_MODE} from './temporary-identity';import {createAccountApiHandler} from './account-http';import {json} from './http';
import {PLATFORM_VERIFIED_MODE} from './platform-token-verifier';import {platformVerifiedActor} from './platform-verified-actor';
/** The published temporary mode is unchanged. The candidate verified mode
 * requires an injected verifier and is never selected by the 55c8 config. */
export function createTemporaryAccountTransport({mode,gameId,store,runtime,usage,noteMedia,dynamicAssets,newsProject,lifeProject,landProject,decorateAuthority,accountOnly=false,verifyPlatformToken}:any){
 if(mode!==TEMPORARY_IDENTITY_MODE&&mode!==PLATFORM_VERIFIED_MODE)throw Error('ACCOUNT_IDENTITY_MODE_DISABLED');
 if(mode===PLATFORM_VERIFIED_MODE&&typeof verifyPlatformToken!=='function')throw Error('PLATFORM_BINDING_CONTRACT_UNCONFIRMED');
 const contexts=new WeakSet<object>();
 const service=createAccountJourneyService({enabled:true,store,runtime,decorateAuthority,resolveActor:async(a:object)=>contexts.has(a)?a:null});
 const api=createAccountApiHandler({service,usage,noteMedia,dynamicAssets,newsProject,lifeProject,landProject,allowLegacyClaim:!accountOnly});
 return async(req:IncomingMessage,res:ServerResponse,browserOwner:string)=>{
  const a=mode===TEMPORARY_IDENTITY_MODE?temporaryActor(req,res,{mode,gameId,browserOwner}):platformVerifiedActor(req,res,{gameId,browserOwner,verified:await verifyPlatformToken(req.headers['x-harbor-telegram-id'],req.headers.authorization)});contexts.add(a);
  if(accountOnly&&a.kind!=='account')throw Object.assign(Error('PLATFORM_LOGIN_REQUIRED'),{status:401});
  const path=new URL(req.url!,'http://localhost').pathname;
  if(path==='/api/bootstrap'&&req.method==='POST')return json(res,200,{mode,platformIdentityVerified:mode===PLATFORM_VERIFIED_MODE,kind:a.kind});
  return api(req,res,a);
 };
}
