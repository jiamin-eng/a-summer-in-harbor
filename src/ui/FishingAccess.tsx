import {FISHING_NEW_STARTS} from '../fishing-release';
import type {Save} from '../story/state';
import {residentHere} from '../world/residents';
import {tx,type Locale} from '../world/data';
export function fishingAccess(save:Save){return {atPier:save.scene==='dock',open:save.scene==='dock'&&residentHere(save,'ruth','dock'),known:save.known.includes('ruth'),energyReady:save.energy>=10};}
export function FishingAccess({save,locale,busy,onStart,onRoute,onRest}:{save:Save;locale:Locale;busy:boolean;onStart:()=>void;onRoute:()=>void;onRest:()=>void}){
 const a=fishingAccess(save);
 return <section className="harbor-fishing-access" data-fishing-access>{!FISHING_NEW_STARTS&&<p role="status">{tx(["新开钓暂时暂停，已有钓获仍可确认。","New casts are paused; an existing catch can still be confirmed."],locale)}</p>}
 <h3>{tx(['借竿钓鱼','Borrow a rod and fish'],locale)}</h3>
 {a.open?<><button className="harbor-primary harbor-wide" disabled={busy||!FISHING_NEW_STARTS||!a.energyReady||!a.known||!!save.turnBattle||!!save.activeChallenge} onClick={onStart}>{tx(['借竿钓鱼','Borrow a rod and fish'],locale)}</button><p>{tx(['临时借竿，免费。开始需至少10精力，钓获才消耗2；失败或收竿不扣物品或精力。钓鱼期间游戏时间暂停。','Borrowing is free. Start with at least 10 energy; a catch uses 2. No goods or energy are lost on escape or withdrawal. Game time pauses while fishing.'],locale)}</p>{!a.energyReady&&<><p role="status">{tx(['至少需要10精力，可回租屋免费休息。','You need at least 10 energy. Rest at home for free.'],locale)}</p><button disabled={busy} onClick={onRest}>{tx(['查看租屋地点','Find Your Room'],locale)}</button></>}</>:<><p>{tx(['露丝已收竿。在钓鱼码头，06:00–17:00可以向她临时借竿；这里不能向她借竿。自己的免费基础竿仍可在可达无遮挡水边使用。','Ruth has packed the rod away. Borrow it at the Fishing Pier, 06:00–17:00. You cannot borrow her rod here. Your free basic rod still works at reachable, clear water edges.'],locale)}</p><button disabled={busy} onClick={onRoute}>{tx(['前往钓鱼码头 · 先步行','Walk toward the Fishing Pier'],locale)}</button></>}
 </section>;
}
