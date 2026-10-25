import {FISHING_NEW_STARTS} from '../fishing-release';
import {hasFishingKit} from '../challenges/shore-fishing';
import {currentBait} from '../challenges/fishing-v2';
import {baitCatalog} from '../challenges/fishing-catalog';
import {shoreActionLabel} from './ShoreFishingAccess';
import {tx,type Locale} from '../world/data';
import type {Save} from '../story/state';
import type {ShoreCheck} from '../world/shore-water';
export function ShoreCastShortcut({save,shore,locale,busy,compact,onPrepare,onCast}:{save:Save;shore:ShoreCheck;locale:Locale;busy:boolean;compact:boolean;onPrepare:()=>void;onCast:()=>void}){
 const ready=shore.ok&&hasFishingKit(save)&&save.energy>=10&&!save.turnBattle&&!save.activeChallenge&&FISHING_NEW_STARTS;
 if(!compact||!ready)return <button className="harbor-shore-action" data-open-shore disabled={busy} onClick={onPrepare}>{tx(shoreActionLabel(shore),locale)}</button>;
 const bait=currentBait(save,shore.ok?shore.target.water:undefined);
 return <div className="harbor-shore-shortcuts"><button className="harbor-primary" data-direct-shore-cast disabled={busy} onClick={onCast}><strong>{tx(['抛竿','Cast'],locale)}</strong><small>{tx(baitCatalog[bait].name,locale)}</small></button><button data-open-shore disabled={busy} onClick={onPrepare}>{tx(['换饵 / 帮助','Bait / help'],locale)}</button></div>;
}
