import {createHash} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {PLATFORM_VERIFIED_MODE} from './platform-token-verifier';

const fail=(code:string,status=401)=>{throw Object.assign(Error(code),{code,status})};
/** Reuse the existing account owner derivation after verification. This keeps
 * player journeys in place and never migrates or rewrites an old save. */
export function platformVerifiedActor(req:IncomingMessage,res:ServerResponse,{gameId,browserOwner,verified}:{gameId:string;browserOwner:string;verified:{telegramId:string}}){
 if(req.headers['x-harbor-game']!==gameId||req.headers['x-harbor-identity-mode']!==PLATFORM_VERIFIED_MODE||req.headers['x-harbor-telegram-id']!==verified.telegramId)fail('PLATFORM_REQUEST_MISMATCH');
 if(!/^[a-f0-9]{64}$/.test(browserOwner))fail('EDGE_IDENTITY_REQUIRED');
 const owner=createHash('sha256').update(JSON.stringify(['harbor-owner-v1',gameId,'telegram-unverified-v1',verified.telegramId])).digest('hex');
 let cancelled=false;res.once('close',()=>{if(!res.writableEnded)cancelled=true});
 return Object.freeze({gameId,kind:'account',owner,browserOwner,assurance:'platform-token-bound-v1',
  assertCurrent:async()=>{if(cancelled||req.aborted)fail('REQUEST_IDENTITY_CANCELLED',409)}});
}
