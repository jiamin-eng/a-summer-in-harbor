import {useRef,useState} from 'react';
import type {Save} from '../story/state';
import {fernSlot,type OrnamentalFernVerb} from '../life/ornamental-fern-config';
import {tx,type Locale} from '../world/data';
import type {LifeView} from './LifeBag';

export function OrnamentalFernPanel({save,view,target,person,locale,current,busy,onAction,onLater}:{save:Save;view:LifeView|null;target:string;person?:string;locale:Locale;current:boolean;busy:boolean;onAction:(v:OrnamentalFernVerb)=>Promise<unknown>;onLater:()=>void}){
 const lock=useRef(false),[working,setWorking]=useState(false),cap=view?.ornamentalFern,root=save.ornamentalFernV1,plant=root?.plant;
 if(!cap?.enabled)return null;
 const gifting=person==='mara'&&cap.eligible,atSlot=target===fernSlot.id&&save.scene==='home'&&!!plant;
 if(!gifting&&!atSlot)return null;
 const locked=!current||busy||working||!!save.activeChallenge;
 const run=async(v:OrnamentalFernVerb)=>{if(lock.current||locked)return;lock.current=true;setWorking(true);try{await onAction(v)}finally{lock.current=false;setWorking(false)}};
 return <section className="harbor-item" data-ornamental-fern={gifting?'gift':'slot'}>
 <h3>{tx(gifting?['一盆给你的蕨','A potted fern for you']:['我的盆蕨','My potted fern'],locale)}</h3>
 {gifting?(plant?<p>{tx(plant.holder==='bag'?['玛拉赠的盆蕨在行囊；可回租屋右侧摆放。','Mara’s fern is in your bag. Place it on the right side of Your Room.']:['玛拉赠的盆蕨正在租屋展示；仍是同一株，不会再次领取。','Mara’s fern is displayed in Your Room. It is the same plant, received once.'],locale)}</p>:!cap.newStarts?<p>{tx(['这次赠礼暂未开放；原有旅程仍可继续。','This gift is unavailable for now. Continue your journey.'],locale)}</p>:!root?<button disabled={locked} onClick={()=>void run('read-offer')}>{tx(['听玛拉说说这盆蕨','Hear Mara’s offer'],locale)}</button>:<>
 <p>{tx(['已长好的观赏盆蕨，领取不额外耗精力、时间或现金。放下或收回各需4精力、20游戏分钟，不花钱；不用浇水。','A fully grown ornamental fern. Accepting adds no energy, time or cash cost. Placing or taking it back costs 4 energy and 20 game minutes each, with no cash or watering.'],locale)}</p>
 <button className="harbor-primary" disabled={locked} onClick={()=>void run('accept')}>{tx(['收下这盆蕨','Accept the potted fern'],locale)}</button><button disabled={busy||working} onClick={onLater}>{tx(['以后再说','Maybe later'],locale)}</button>
 </>):<>
 <p>{tx(plant!.holder==='bag'?['这盆蕨在行囊里。这里是它唯一的房内位置。','The fern is in your bag. This is its one room spot.']:['玛拉赠的同一盆蕨正在这里展示，可以收回行囊。','The same fern Mara gave you is displayed here. You can return it to your bag.'],locale)}</p>
 <p>{tx(['每次移动：4精力、20游戏分钟、$0；原有疲劳照常结算。','Each move: 4 energy, 20 game minutes, $0. Existing fatigue still applies.'],locale)}</p>
 <button className="harbor-primary" disabled={locked||save.energy<4} onClick={()=>void run(plant!.holder==='bag'?'place':'take')}>{tx(plant!.holder==='bag'?['摆放盆蕨 · 4精力 / 20分钟','Place fern · 4 energy / 20 minutes']:['收回盆蕨 · 4精力 / 20分钟','Return fern to bag · 4 energy / 20 minutes'],locale)}</button>
 {save.energy<4&&<p role="status">{tx(['精力不足，先在床边免费休息；盆蕨会保留。','Not enough energy. Rest by the bed for free; your fern stays safe.'],locale)}</p>}
 </>}
 {working&&<p role="status">{tx(['正在保存…','Saving…'],locale)}</p>}
 </section>;
}
