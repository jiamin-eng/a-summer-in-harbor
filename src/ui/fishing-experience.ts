import type {FishingState} from '../challenges/fishing';
import {baitCatalog,fishCatalog,speciesIds,type BaitId} from '../challenges/fishing-catalog';
import type {ShoreEncounter} from '../challenges/shore-fishing';
import type {Words} from '../world/data';
import type {Point} from '../engine/world';
export type FishingPhase='ready'|'waiting'|'bite'|'reeling'|'result';
export const fishingPresentationEvent='harbor:fishing-presentation';
/** Read-only presentation; never sent as a reward, action, or save field. */
export type FishingPresentation={challenge:string;phase:FishingPhase|'closed';paused:boolean;held:boolean;state:FishingState;waitTicks:number;anchorSource?:'encounter'|'legacy-shore-check';anchor?:{scene:string;standing:Point;target:Point}};
export function fishingBaitCue(encounter?:ShoreEncounter):Words{
 if(!encounter)return['借竿钓获为通用鲜鱼，不登记新物种。','Borrowed-rod catches are fresh fish, outside the species journal.'];
 const id=encounter.ticket?.bait??'reusable-fishing-lure',name=baitCatalog[id].name;
 return id==='reusable-fishing-lure'?[`本竿：${name[0]} · 永久保留。`,`This cast: ${name[1]} · reusable.`]:[`本竿：${name[0]} · 确认钓获后用1份。`,`This cast: ${name[1]} · one used on catch confirmation.`];
}
export function baitPreference(id:BaitId,water?:'saltwater'|'stream'):Words{
 if(id==='reusable-fishing-lure')return['免费，可钓所有鱼种。','Free; can catch every species.'];
 const fish=speciesIds.filter(s=>fishCatalog[s].prefer===id&&(!water||fishCatalog[s].water===water));
 return fish.length?[`偏好：${fish.map(s=>fishCatalog[s].name[0]).join('、')}；不保证钓获。`,`Favours ${fish.map(s=>fishCatalog[s].name[1]).join(', ')}; no guaranteed catch.`]:['这片水域没有明确偏好此饵的鱼，基础拟饵也可用。','No fish here specifically favours this bait; the free lure also works.'];
}

