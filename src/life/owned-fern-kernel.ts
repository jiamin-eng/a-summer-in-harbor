import type {Save} from '../story/state';
import {battleLocksWorld} from '../story/turn-battle';

/** A local, fixture-only capability. No production action grants or moves it. */
export const OWNED_FERN_RULES='owned-fern-kernel-fixture-v1' as const;
export const OWNED_FERN_POT='room-pot-1' as const;
export type FernLocation='bag'|typeof OWNED_FERN_POT;
export type OwnedFernState={
 schema:1;rules:typeof OWNED_FERN_RULES;
 source:{kind:'fixture-only';actionId:string;minute:number};
 instance:{id:string;species:'fern';ownerJourney:string;acquiredMinute:number;ageMinutesAtGrant:number;location:FernLocation;moveCount:number;lastMove?:{actionId:string;minute:number;to:FernLocation}};
};
export type OwnedFernSave=Save&{ownedFernV1?:OwnedFernState};
export type FernMoveIntent={actionId:string;expectedVersion:number;to:FernLocation};
/** Constructed by a trusted local test host, never copied from Action.payload. */
export type FernMoveAdmission={kind:'fixture-room-admission';scene:'home';slot:typeof OWNED_FERN_POT};

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const minute=(v:unknown,max:number)=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=max;
const actionId=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(v);
const location=(v:unknown):v is FernLocation=>v==='bag'||v===OWNED_FERN_POT;

/** Optional state remains absent in every ordinary published save. Bad present
 * state fails closed rather than being migrated into an owned item. */
export function assertOwnedFernReadable(s:OwnedFernSave){
 const root=s.ownedFernV1;if(root===undefined)return;
 const bad=()=>{throw Error('UNSUPPORTED_OWNED_FERN_SAVE')};
 const now=s.townMinutes??540;
 if(!object(root)||!exact(root,['schema','rules','source','instance'])||root.schema!==1||root.rules!==OWNED_FERN_RULES||!object(root.source)||!exact(root.source,['kind','actionId','minute'])||root.source.kind!=='fixture-only'||!actionId(root.source.actionId)||!minute(root.source.minute,now)||!object(root.instance))bad();
 const source=root.source,plant=root.instance;
 if(!exact(plant,plant.moveCount===0?['id','species','ownerJourney','acquiredMinute','ageMinutesAtGrant','location','moveCount']:['id','species','ownerJourney','acquiredMinute','ageMinutesAtGrant','location','moveCount','lastMove'])||plant.id!==`fern:${source.actionId}`||plant.species!=='fern'||plant.ownerJourney!==s.id||plant.acquiredMinute!==source.minute||!minute(plant.ageMinutesAtGrant,1000000)||!Number.isSafeInteger(plant.moveCount)||plant.moveCount<0||plant.moveCount>9999||!location(plant.location)||plant.location!==(plant.moveCount%2?OWNED_FERN_POT:'bag'))bad();
 if(plant.moveCount){const last=plant.lastMove;if(!object(last)||!exact(last,['actionId','minute','to'])||!actionId(last.actionId)||last.actionId===source.actionId||!minute(last.minute,now)||last.minute<plant.acquiredMinute||last.to!==plant.location)bad();}
}

/** Only moves a pre-existing fixture instance. The caller must first perform
 * the ordinary scene/position admission, then commit this result via the
 * existing authority CAS/event/receipt transaction. No gift or pot UI exists. */
export function moveOwnedFern(before:OwnedFernSave,intent:FernMoveIntent,admission:FernMoveAdmission):OwnedFernSave{
 assertOwnedFernReadable(before);
 if(!before.ownedFernV1)throw Error('FERN_NOT_OWNED');
 if(before.version!==intent.expectedVersion)throw Error('VERSION_CONFLICT');
 if(!actionId(intent.actionId)||!location(intent.to))throw Error('INVALID_FERN_MOVE');
 if(before.activeChallenge||battleLocksWorld(before))throw Error('CHALLENGE_ACTIVE');
 if(before.movingClock)throw Error('MOTION_CHECKPOINT_REQUIRED');
 if(before.scene!=='home'||!before.visited.includes('home')||!before.flags.includes('key')||!before.flags.includes('unpacked'))throw Error('FERN_ROOM_ACCESS');
 if(!admission||admission.kind!=='fixture-room-admission'||admission.scene!=='home'||admission.slot!==OWNED_FERN_POT)throw Error('FERN_ADMISSION_REQUIRED');
 const plant=before.ownedFernV1.instance;
 if(plant.location===intent.to)throw Error('FERN_ALREADY_THERE');
 if(intent.actionId===before.ownedFernV1.source.actionId||intent.actionId===plant.lastMove?.actionId)throw Error('FERN_ACTION_REUSED');
 if(plant.moveCount>=9999)throw Error('FERN_MOVE_CAPACITY');
 const next=structuredClone(before);
 const moved=next.ownedFernV1!.instance;moved.location=intent.to;moved.moveCount++;moved.lastMove={actionId:intent.actionId,minute:next.townMinutes??540,to:intent.to};
 assertOwnedFernReadable(next);return next;
}
