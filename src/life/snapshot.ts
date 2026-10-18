import type {Save} from '../story/state';
import type {LifeView} from '../ui/LifeBag';

/** Content as well as stamps: no journey, known resident or notebook can reuse another projection. */
export function lifeSnapshotKey(s:Save){
 const life=(s as Save&{lifeV1?:unknown}).lifeV1;
 return JSON.stringify([s.id,s.version,s.cursor,s.scene,s.position,s.townMinutes??540,s.known,s.relations,s.relationshipsV1??null,s.relationshipExpansionV1??null,s.relationshipNextV1??null,s.flags,s.cash,s.nativeCrabV1??null,s.animalNotebookV1??null,s.animalsV1??null,life??null,s.landV1??null,s.items,(s as Save&{plantUsesV1?:unknown}).plantUsesV1??null,s.activeChallenge??null,s.turnBattle??null]);
}
export function lifeViewMatchesHead(s:Save,v:LifeView){
 return v.schema===1&&v.snapshotVersion===s.version&&v.snapshotCursor===s.cursor&&v.gameMinute===(s.townMinutes??540)&&(!v.animals||v.animals.snapshotVersion===s.version);
}
