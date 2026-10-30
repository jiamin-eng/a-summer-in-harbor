import {FishingPracticeNotice} from './ShoreFishingAccess';
import {FISHING_NEW_STARTS} from '../fishing-release';
import type {Save} from '../story/state';
import {residentHere} from '../world/residents';
import {tx,type Locale} from '../world/data';
export function fishingAccess(save:Save){return {atPier:save.scene==='dock',open:save.scene==='dock'&&residentHere(save,'ruth','dock'),known:save.known.includes('ruth'),energyReady:save.energy>=10};}
export function FishingAccess({save,locale,busy,onStart,onRoute,onRest,onPractice}:{save:Save;locale:Locale;busy:boolean;onStart:()=>void;onRoute:()=>void;onRest:()=>void;onPractice?:()=>void}){
 const a=fishingAccess(save);
 return <section className="harbor-fishing-access" data-fishing-access>{!FISHING_NEW_STARTS&&<p role="status">{tx(["新开钓暂时暂停，已有钓获仍可确认。","New casts are paused; an existing catch can still be confirmed."],locale)}</p>}
 <h3>{tx(['借竿钓鱼','Borrow a rod and fish'],locale)}</h3><FishingPracticeNotice save={save} locale={locale} busy={busy} onPractice={onPractice}/>
 {a.open?<><button className="harbor-primary harbor-wide" disabled={busy||!FISHING_NEW_STARTS||!a.energyReady||!a.known||!!save.turnBattle||!!save.activeChallenge} onClick={onStart}>{tx(['借竿钓鱼','Borrow a rod and fish'],locale)}</button><p>{tx(['免费借竿 · 钓获为通用鲜鱼，不登记物种图鉴。','Borrow for free · catches are fresh fish, outside the species journal.'],locale)}</p><details><summary>{tx(['借竿说明','About borrowed rods'],locale)}</summary><p>{tx(['借竿后留意浮漂，下沉时点一次提竿。开始需10精力，确认钓获才消耗2。失败或收竿没有损耗；游戏时间暂停。','Watch the float and tap Hook once when it dips. Start with 10 energy; a confirmed catch uses 2. Escape or withdrawal costs nothing. Game time pauses.'],locale)}</p></details>{!a.energyReady&&<><p role="status">{tx(['至少需要10精力，可回租屋免费休息。','You need at least 10 energy. Rest at home for free.'],locale)}</p><button disabled={busy} onClick={onRest}>{tx(['查看租屋地点','Find Your Room'],locale)}</button></>}</>:<><p>{tx(['露丝已收竿。在钓鱼码头，06:00–17:00可以向她临时借竿；这里不能向她借竿。自己的免费基础竿仍可在可达无遮挡水边使用。','Ruth has packed the rod away. Borrow it at the Fishing Pier, 06:00–17:00. You cannot borrow her rod here. Your free basic rod still works at reachable, clear water edges.'],locale)}</p><button disabled={busy} onClick={onRoute}>{tx(['前往钓鱼码头 · 先步行','Walk toward the Fishing Pier'],locale)}</button></>}
 </section>;
}
