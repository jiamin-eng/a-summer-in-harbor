import {useState} from 'react';
import {observationRecordLabel} from '../animal-life/labels';
import {tx,type Locale,type Words} from '../world/data';
import type {Save} from '../story/state';
import type {Command} from '../life/types';
import type {lifeView} from '../../server/life-view';
import {Icon} from './icons';
import {lifeItemImage} from '../world/life-crop-art';
import {cropImage} from '../world/crop-art';
import {CropImage} from './CropImage';
export type LifeView=ReturnType<typeof lifeView>&{animals?:import('./AnimalNotebook').AnimalView;afterRain?:import('../../server/after-rain-runtime').AfterRainView;ornamentalFern?:{enabled:true;newStarts:boolean;eligible:boolean}};
const giftNames:Record<string,Words>={'life-gift:theo-menu':['第一篮收成的菜单小卡','A menu card for my first delivery'],'life-gift:dani-page':['我的菜园与车站猫','My garden and the station cat']};
export function gameMinuteLabel(minute:number,locale:Locale){const clock=`${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;return tx([`游戏第${Math.floor(minute/1440)+1}天 ${clock}`,`Game day ${Math.floor(minute/1440)+1}, ${clock}`],locale)}
export function LifeBag({save,view,locale,busy,reload,onCommand,projectionCurrent}:{save:Save;view:LifeView|null;projectionCurrent?:boolean;locale:Locale;busy:boolean;reload:()=>void;onCommand:(c:Command)=>void}){
 const [tab,setTab]=useState<'goods'|'records'>('goods');
 if(!view)return <p>{tx(['种子与收藏详情暂时无法读取，已有行囊仍可查看。','Seed and collection details are unavailable just now. Your existing bag remains available.'],locale)}</p>;
 const stale=projectionCurrent===undefined?view.snapshotVersion!==save.version:!projectionCurrent;
 return <section className="harbor-life-bag" aria-label={tx(['种子与收藏','Seeds and collections'],locale)}>
 <div className="harbor-life-tabs">{(['goods','records'] as const).map(id=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{tx(id==='goods'?['种子与收成','Seeds & harvest']:['收藏','Collections'],locale)}<Icon name={id==='goods'?'bag':'chat'}/></button>)}</div>
 {stale&&<p role="status">{tx(['进度已更新。先重新读取，再使用物品。','Your progress changed. Reload before using an item.'],locale)}<button onClick={reload}>{tx(['重新读取','Reload'],locale)}</button></p>}
 {tab==='goods'?<>
 {!view.batches.length&&<p>{tx(['还没有种子或收成。发现的记录会留在收藏里。','No seeds or harvest yet. Discovery records stay in Collections.'],locale)}</p>}
 {view.batches.map((b,i)=>{const image=lifeItemImage(b.ref,b.kind),legacy=cropImage((b.kind==='seed'?'seed-':'crop-')+b.ref.id.slice(5));return <article key={b.id} className="harbor-item" data-life-batch={b.id}>{(image||legacy)&&<CropImage transparent={!!image} image={image??legacy!} alt={tx(b.name,locale)}/>}<strong>{tx(b.name,locale)} · {tx(b.kind==='seed'?['种子','Seed']:['收成','Harvest'],locale)} ×{b.quantity}</strong><p>{tx([`实物数量 · 批次 ${i+1}`,`Physical quantity · batch ${i+1}`],locale)}</p><p>{tx(b.kind==='seed'?(b.startAvailable?['可在已开垦的新畦播种；原三种作物仍用花园固定畦。','Plant in a cultivated new bed; the original three crops use the garden beds.']:['此旧批次停止新播种，实物与登记仍保留。','New planting is closed for this archived batch. Its goods and records remain.']):['在杂货柜台出售，或消耗1份留同批次种子。','Sell at the grocer, or use one unit to save a seed from this batch.'],locale)}</p>{b.saveSeedAvailable&&<button disabled={busy||stale} onClick={()=>onCommand({verb:'save-seed',ref:b.ref})}>{tx(['留种：1份收成换1颗种子','Save seed: 1 harvest unit → 1 seed'],locale)}</button>}</article>})}
 {!!view.plants?.unboundPlotIds.length&&<p role="status">{tx(['旧种植位置尚未绑定到真实菜畦；已存植株与批次保留，请勿覆盖它们。','An archived planting position has no world bed yet. Its saved plant and batch remain; do not overwrite them.'],locale)}</p>}
 {view.order&&<article className="harbor-item" data-life-order><strong>{tx(['已接受的订单','Accepted order'],locale)}</strong><p>{tx(['截止','Due'],locale)} {gameMinuteLabel(view.order.definition.dueMinute,locale)}</p><p>{tx(view.order.status==='expired'?['已经过期，产物仍在行囊。','Expired. Your produce remains in your bag.']:[`还剩 ${view.order.remainingGameMinutes} 游戏分钟`,`${view.order.remainingGameMinutes} game minutes remain`],locale)}</p><p>{tx([`需要2份 · 可用${view.order.availablePinnedProduce}份`,`Needs 2 units · ${view.order.availablePinnedProduce} available`],locale)}</p>{view.order.closeAvailable&&<button disabled={busy||stale} onClick={()=>onCommand({verb:'close-order'})}>{tx(['关闭过期订单 · 保留产物','Close expired order · keep produce'],locale)}</button>}</article>}
 {view.gifts.filter(g=>g.quantity>0).map(g=><article className="harbor-item" key={g.id}><strong>{tx(giftNames[g.id]??['街坊赠礼','A neighbor’s gift'],locale)} ×{g.quantity}</strong><p>{tx(['真实持有的赠礼，展示入口尚未开放。','A gift you own. Display is not available yet.'],locale)}</p></article>)}
 </>:<>
 {!view.collections.length&&<p>{tx(['还没有登记。留种后会留下记录；用掉种子也不会抹去发现。','No records yet. Saving a seed records the discovery; using the seed keeps the record.'],locale)}</p>}
 {view.collections.map(({record,name,physicalSeedQuantity,physicalGiftQuantity})=><article key={record.id} className="harbor-item" data-life-record={record.id}><strong>{name?tx(name,locale):tx(observationRecordLabel(record.id)??giftNames[record.id.slice(5)]??(record.source?.kind==='animal-schedule'?['动物日常观察','An animal’s daily routine']:['一段小镇经历','A town memory']),locale)}</strong><p>{tx(['已登记','Recorded'],locale)} · {gameMinuteLabel(record.minute,locale)}</p>{physicalSeedQuantity!==undefined&&<p>{tx([`当前种子实物 ${physicalSeedQuantity} 颗；登记不是额外种子。`,`${physicalSeedQuantity} physical seeds now. The record is not an extra seed.`],locale)}</p>}{physicalGiftQuantity!==undefined&&<p>{tx([`当前赠礼实物 ${physicalGiftQuantity} 件。`,`${physicalGiftQuantity} physical gifts now.`],locale)}</p>}</article>)}
 </>}
 </section>;
}
