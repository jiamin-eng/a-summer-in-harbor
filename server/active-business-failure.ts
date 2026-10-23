// @ts-expect-error frozen authority's authored error identity
import {AuthorityError} from '../vendor/dynamic-runtime/packages/authority-session/error.mjs';
import {motionHttpFailure} from './motion-failure';
/** Finite source-authored, pre-prepare gameplay rejections. Never infer from capitalized text. */
const gameplay=new Set(['SPATIAL_ACTION_NOT_ADMITTED','SPATIAL_BINDING_MISMATCH','INVALID_ACTOR_POSITION','INVALID_POSITION','UNVERIFIED_POSITION','VERSION_CONFLICT','WRONG_SCENE','CHALLENGE_ACTIVE','CHALLENGE_MISMATCH','CHALLENGE_NOT_FINISHED','CHALLENGE_UNAVAILABLE','INVALID_RESULT','PUZZLE_NOT_SOLVED','INTRODUCE_FIRST','PERSON_AWAY','TOO_FAR','INVALID_QUESTION','LOCATION_UNKNOWN','UNKNOWN_TARGET','NOT_A_DOOR','NOTES_LOCKED','KEY_NEEDED','SETTLE_FIRST','NOT_A_PERSON','ALREADY_INTRODUCED','TOPIC_UNAVAILABLE','NOT_ENOUGH_CASH','BATTLE_EXISTS','BATTLE_ACTIVE','REST_NEEDED','ACTION_UNAVAILABLE','ALREADY_DONE','BRIDGE_REQUIREMENTS','ROUTE_NOT_READY','MISSING_ITEM','SHOP_CLOSED','CROP_ACTION_UNAVAILABLE','ENERGY_FULL','SUPPLY_ALREADY_USED','BATTLE_LOCATION','BATTLE_ROUND_CONFLICT']);
// Current authored crop/animal/turn failures; production B2 additions require source review.
for(const code of ['PURSE_FULL','ANIMAL_UNAVAILABLE','ANIMAL_ACTION_UNAVAILABLE','ANIMAL_RESTING','ANIMAL_AWAY','INVALID_ANIMAL_POSITION','BATTLE_NOT_ACCEPTED','BATTLE_FEEDBACK_FIRST','BATTLE_MISMATCH','BATTLE_NOT_ACTIVE','BATTLE_NOT_PAUSED'])gameplay.add(code);
// Literal B2/animal rule failures reviewed for this composition. Infrastructure
// and unsupported saved data remain nonterminal, with the original request retained.
for(const code of ["ACTION_ALREADY_APPLIED", "ANIMAL_AWAY", "ANIMAL_CONTENT_CLOSED", "ANIMAL_NOTEBOOK_CAPACITY", "ANIMAL_PROOF_REQUIRED", "ANIMAL_SCHEDULE_MISMATCH", "ARCHIVED_PLOT_NEEDS_BINDING", "CASH_LOW", "CHALLENGE_ACTIVE", "COLLECTION_CAPACITY", "COMMISSION_MISMATCH", "COMMISSION_PREMISE_UNREAD", "COMMISSION_UNAVAILABLE", "CROP_NOT_READY", "DISCOVERIES_MISSING", "DISPLAY_ADMISSION_REQUIRED", "ENERGY_LOW", "GIFT_ALREADY_DISPLAYED", "GIFT_MISSING", "INTRODUCE_FIRST", "INVALID_ACTION_ID", "INVALID_ANIMAL_COMMAND", "INVALID_LAND_COMMAND", "INVALID_LAND_PREVIEW", "INVALID_QUANTITY", "INVENTORY_FULL", "ITEMS_MISSING", "LAND_ADMISSION_REQUIRED", "LAND_ALREADY_PERMITTED", "LAND_CAPACITY", "LAND_NO_ROUTE", "LAND_OUTSIDE", "LAND_OVERLAP", "LAND_PERMISSION", "LAND_PLAYER_SPACE", "LAND_PROTECTED", "LAND_REGION_UNKNOWN", "LAND_SCENE", "LAND_TARGET", "LEAVE_GULL_SPACE", "LIFE_SPATIAL_NOT_ADMITTED", "LIFE_TARGET", "LOT_CAPACITY", "NEWS_PROOF_REQUIRED", "OBSERVATIONS_MISSING", "OBSERVATION_NOT_AVAILABLE", "OBSERVATION_STALE", "ORDER_ACTIVE", "ORDER_CONTENT_UNSUPPORTED", "ORDER_COOLDOWN", "ORDER_EXPIRED", "ORDER_MISSING", "ORDER_NOT_EXPIRED", "ORDER_PREMISE_UNREAD", "PERSON_AWAY", "PLOT_ADMISSION_REQUIRED", "PLOT_EMPTY", "PLOT_OCCUPIED", "PURSE_FULL", "RELATION_FULL", "RESIDENT_ADMISSION_REQUIRED", "REST_NEEDED", "SCENE_MISMATCH", "SHARE_ALREADY_DONE", "SHARE_PREMISE_UNREAD", "SHOP_ADMISSION_REQUIRED", "SHOP_CLOSED", "TOO_FAR", "USE_AUTHORED_COUNTER", "USE_AUTHORED_PLOT", "VERSION_CONFLICT", "WATER_UNAVAILABLE"])gameplay.add(code);
// A-only plant-use literals; unsupported saved data stays nonterminal.
for(const code of ['PLANT_USES_CLOSED','PLANT_USES_STARTS_CLOSED','MINT_CONTENT_CLOSED','INVALID_PLANT_USE_COMMAND','PLANT_USE_TARGET','DELIVERY_MEMORY_MISSING'])gameplay.add(code);
// A rejected model reply is decided before the journey is written.
for(const code of ['DIALOGUE_INVALID'])gameplay.add(code);
// Relationship user actions; clock misconfiguration and unsupported save data stay nonterminal.
for(const code of ['RELATIONSHIP_TOPIC_UNAVAILABLE','RELATIONSHIP_OBSERVATION_UNAVAILABLE','RELATIONSHIP_EXPLICIT_ACTION_REQUIRED'])gameplay.add(code);
// Native crab finite gameplay failures; saved-state/clock failures remain nonterminal.
for(const code of ['NATIVE_CRAB_CLOSED','NATIVE_CRAB_CHECKPOINT_REQUIRED','LEAVE_CRAB_SPACE','CRAB_NEEDS_QUIET_MOMENT','NATIVE_CRAB_REF_MISMATCH'])gameplay.add(code);
// Rain drafts are finite pre-commit gameplay choices. Policy drift and invalid
// saved weather remain infrastructure failures; never retire their request.
for(const code of ['AFTER_RAIN_CLOSED','AFTER_RAIN_UNAVAILABLE','AFTER_RAIN_FACT_MISMATCH','AFTER_RAIN_VERSION_CONFLICT','AFTER_RAIN_TOPIC_NOT_GROUNDED','AFTER_RAIN_PERSON_UNAVAILABLE','UNSUPPORTED_AFTER_RAIN_DRAFT'])gameplay.add(code);
for(const code of ['CHAPEL_WRONG_PLACE','CHAPEL_NOT_JOINED','CHAPEL_READ_NOTE_FIRST','CHAPEL_ALREADY_JOINED','CHAPEL_REHEARSAL_AWAY','CHAPEL_UNKNOWN_ACTION'])gameplay.add(code);
// Seed policy gameplay rejections; malformed saved provenance stays nonterminal.
for(const code of ['SEED_QUOTA_SPENT','HARVEST_BATCH_UNAVAILABLE','HARVEST_RECORD_CAPACITY'])gameplay.add(code);
for(const code of ['LAND_EXPANSION_CLOSED','LAND_EXPANSION_PERMISSION','LAND_EXPANSION_NOT_READY','LAND_ALREADY_EXPANDED','LAND_BED_MISSING','LAND_BED_OCCUPIED'])gameplay.add(code);
class ActiveBusinessRejection extends Error{readonly terminal=true;readonly status=409;constructor(readonly code:string){super(code)}}
export function brandActivePrepareFailure(error:unknown){return error instanceof Error&&gameplay.has(error.message)?new ActiveBusinessRejection(error.message):error}
export function activeBusinessHttpFailure(error:unknown){
 const domain=error as {status:number;code:string};
 if(error instanceof ActiveBusinessRejection||error instanceof AuthorityError&&domain.status>=400&&domain.status<500)return {status:domain.status,body:{error:domain.code,terminal:true}};
 return motionHttpFailure(error);
}
