import {applyOrnamentalFern,assertOrnamentalFernReadable,fernEligible,type OrnamentalFernSave} from '../src/life/ornamental-fern';
import {fernVerbs,fernSlot,type OrnamentalFernVerb} from '../src/life/ornamental-fern-config';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {landWorld} from '../src/life/land';
import {walkable} from '../src/engine/world';
import {rooms} from '../src/world/data';
import {presentEntity,observedActor} from '../src/world/residents';
import type {Action} from '../src/story/state';
import type {createHarborLife} from './life-assembly';
// @ts-expect-error frozen authority's authored error identity
import {AuthorityError} from '../vendor/dynamic-runtime/packages/authority-session/error.mjs';
export const ornamentalFernFailures=['ORNAMENTAL_FERN_ACTION','ORNAMENTAL_FERN_STARTS_CLOSED','ORNAMENTAL_FERN_SETTLE_FIRST','ORNAMENTAL_FERN_OFFER_READ','ORNAMENTAL_FERN_OFFER_FIRST','ORNAMENTAL_FERN_ALREADY_OWNED','ORNAMENTAL_FERN_NOT_OWNED','ORNAMENTAL_FERN_ROOM','ORNAMENTAL_FERN_ALREADY_THERE','ORNAMENTAL_FERN_SLOT','ORNAMENTAL_FERN_OCCUPIED','ORNAMENTAL_FERN_PLAYER_SPACE','ORNAMENTAL_FERN_UNREACHABLE','ORNAMENTAL_FERN_TARGET'] as const;
/** Compose once, inside existing active-time/weather/receipt boundaries. */
export function withOrnamentalFern<T extends ReturnType<typeof createHarborLife>>(assembly:T,{newStarts=true}:{newStarts?:boolean}={}){
 const parse=(a:Action):OrnamentalFernVerb=>{const verb=a.action.slice(5);if(!fernVerbs.includes(verb as OrnamentalFernVerb)||a.payload!==undefined)throw Error('ORNAMENTAL_FERN_ACTION');return verb as OrnamentalFernVerb};
 const runtime={...assembly.runtime,
  assertReadable(s:OrnamentalFernSave){assembly.runtime.assertReadable(s);try{assertOrnamentalFernReadable(s)}catch(error){if((error as Error).message==='UNSUPPORTED_ORNAMENTAL_FERN_SAVE')throw Object.assign(Error('UNSUPPORTED_ORNAMENTAL_FERN_SAVE'),{code:'UNSUPPORTED_ORNAMENTAL_FERN_SAVE',status:503,terminal:false});throw error}},
  validateAction(a:Action){assembly.runtime.validateAction(a);if(a.action.startsWith('fern:'))try{parse(a)}catch(e){throw new AuthorityError((e as Error).message,409)}},
  async prepare(s:OrnamentalFernSave,a:Action,...args:any[]){
   this.assertReadable(s);if(!a.action.startsWith('fern:')){const result=await assembly.runtime.prepare(s,a,...args);this.assertReadable(result.head);return result}
   try{
    const verb=parse(a);if(a.expected_version!==s.version)throw Error('VERSION_CONFLICT');if(a.scene!==s.scene||!s.visited.includes(s.scene))throw Error('SCENE_MISMATCH');
    if((s.movingClock||s.activePlayClock)&&Math.hypot(a.position.x-s.position.x,a.position.y-s.position.y)>4)throw Error('UNVERIFIED_POSITION');
    const world=landWorld(dynamicWorld(s.flags,!!s.dynamicAssetRooms),s.landV1);if(!walkable(world,s.scene,a.position))throw Error('INVALID_POSITION');
    const gifting=verb==='read-offer'||verb==='accept',entity=gifting?rooms[s.scene].entities.find(e=>e.person==='mara'):rooms[s.scene].entities.find(e=>e.id===fernSlot.id);
    if(!entity||a.target!==entity.id||!gifting&&s.scene!==fernSlot.scene)throw Error('ORNAMENTAL_FERN_TARGET');if(!presentEntity(s,entity))throw Error('PERSON_AWAY');
    const at=observedActor(entity,a.actorPosition);if(Math.hypot(a.position.x+8-at.x,a.position.y+6-at.y)>65)throw Error('TOO_FAR');
    const result=applyOrnamentalFern({...s,position:{...a.position}},verb,a.action_id,world,newStarts);
    result.head.version=s.version+1;result.head.cursor=s.cursor+1;
    if(result.head.animalNotebookV1?.sample)delete result.head.animalNotebookV1.sample;
    result.head.history.push({id:a.action_id,kind:gifting?'talk':'action',...(gifting?{person:'mara'}:{}),text:result.text});result.head.history=result.head.history.slice(-500);
    this.assertReadable(result.head);return {...result,kind:a.action,accepted:true,actionId:a.action};
   }catch(error){if(error instanceof Error&&(ornamentalFernFailures.includes(error.message as any)||['REST_NEEDED','VERSION_CONFLICT','SCENE_MISMATCH','UNVERIFIED_POSITION','INVALID_POSITION','PERSON_AWAY','TOO_FAR','CHALLENGE_ACTIVE'].includes(error.message)))throw new AuthorityError(error.message,409);throw error}
  },
 };
 return {...assembly,runtime,lifeProject:(s:OrnamentalFernSave)=>{runtime.assertReadable(s);return {...assembly.lifeProject(s),ornamentalFern:{enabled:true,newStarts,eligible:fernEligible(s)}}}};
}
