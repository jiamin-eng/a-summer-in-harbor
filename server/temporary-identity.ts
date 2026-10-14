import {createHash} from 'node:crypto';import type {IncomingMessage,ServerResponse} from 'node:http';
export const TEMPORARY_IDENTITY_MODE='temporary-unverified';
export function validTelegramId(value:unknown):value is string{return typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)}
const fail=(code:string,status=400)=>{throw Object.assign(Error(code),{code,status})};
/** Explicit internal-demo policy. Syntax checking is NOT authentication.
 * The caller must first establish the private edge boundary. In the approved
 * internal prototype, a host ID does not require browser Cookie possession.
 * An attacker who supplies another Telegram ID can impersonate that account. */
export function temporaryActor(req:IncomingMessage,res:ServerResponse,{mode,gameId,browserOwner}:{mode:string;gameId:string;browserOwner:string}){
 if(mode!==TEMPORARY_IDENTITY_MODE)fail('TEMPORARY_IDENTITY_DISABLED',503);
 if(req.headers['x-harbor-game']!==gameId)fail('GAME_SCOPE_MISMATCH',403);
 const id=req.headers['x-harbor-telegram-id'];
 if(id!==undefined&&(!validTelegramId(id)||req.headers['x-harbor-identity-mode']!==TEMPORARY_IDENTITY_MODE))fail('INVALID_DEMO_IDENTITY');
 if(!/^[a-f0-9]{64}$/.test(browserOwner))fail('BROWSER_POSSESSION_REQUIRED',401);
 const owner=id===undefined?browserOwner:createHash('sha256').update(JSON.stringify(['harbor-owner-v1',gameId,'telegram-unverified-v1',id])).digest('hex');
 let cancelled=false;res.once('close',()=>{if(!res.writableEnded)cancelled=true});
 return Object.freeze({gameId,kind:id===undefined?'browser':'account',owner,browserOwner,assurance:id===undefined?'browser-possession':'unverified-client-id',
  // Only request cancellation is observable here. This is NOT platform expiry/revocation.
  assertCurrent:async()=>{if(cancelled||req.aborted)fail('REQUEST_IDENTITY_CANCELLED',409)}});
}
