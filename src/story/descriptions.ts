import {neighborDescription} from './neighbor-chapter';
import {chapelDescription} from './chapel';
import {relationshipGreeting} from './relationship-growth';
import {newsMemory} from './town-news';
import {plotIds,plotDescription,shopHours} from './crops';
import {harborLoopIds} from '../npc/harbor-cast';
import {residentActivity,fernDescription,openingNotice} from '../world/residents';
import {rooms,type Entity,type Words} from '../world/data';
import {residentWeatherReaction} from '../weather/resident-reactions';
import {has,type Save} from './state';
export function description(s:Save,e:Entity):Words{
 const original=baseDescription(s,e),reaction=e.person&&residentWeatherReaction(s,e.person,!!rooms[s.scene]?.outdoor);
 return reaction?[original[0]+' '+reaction[0],original[1]+' '+reaction[1]]:original;
}
function baseDescription(s:Save,e:Entity):Words{
 const neighbor=neighborDescription(s,e.id);if(neighbor)return neighbor;
  const chapel=chapelDescription(s,e.id);if(chapel)return chapel;
 if(e.id==='visitor-note')return newsMemory(s)??['这里留着一小块贴游客留言的地方。','A little space is kept for visitors’ notes.'];
 if(plotIds.includes(e.id))return plotDescription(s,e.id);
 if(e.id==='crop-counter')return shopHours;
 if(e.id==='growing-fern')return fernDescription(s);
 if(e.kind==='portal'&&e.destination&&openingNotice(e.destination,s))return openingNotice(e.destination,s)!;
 if(e.kind==='portal')return ['出口就在面前。准备好了，可以从这里前往下一处。','The way is right here. Leave when you are ready.'];
 if(e.person&&!harborLoopIds.includes(e.person)&&relationshipGreeting(s,e.person))return relationshipGreeting(s,e.person)!;
 if(e.person&&residentActivity(s,e.person))return residentActivity(s,e.person)!;
 if(e.person){const greetings:Record<string,Words>={mara:has(s,'key')?['玛拉转过身来，听你说话。','Mara turns to listen.']:['玛拉握着钥匙，听你说话。','Mara listens, the room key still in her hand.'],theo:['西奥把手里的杯子放回柜台。','Theo sets his cup down on the counter.'],june:['琼放下工具，给你留出说话的空当。','June puts her tools down to hear you.'],idris:['教练停下脚步，把练习的节奏留给你。','The coach stops and lets you set the pace.'],ruth:['钓鱼人抬起头，给你让出一点码头的位置。','The angler looks up and makes room beside her.'],luis:['店主从柜台后望过来。','The shopkeeper looks over from the counter.'],nell:['内尔把照片压在桌边，等待你的问题。','Nell keeps a finger on the photograph and waits.'],elena:['埃琳娜关小了水龙头，认真听你开口。','Elena turns down the tap and listens.'],arthur:['阿瑟擦干手上的水，扶了扶帽檐。','Arthur dries his hands and adjusts his cap.']};return greetings[e.person]}
 const descriptions:Record<string,Words>={bed:has(s,'unpacked')?['行李已经安放妥当。这是你随时可以回来休息的地方。','Your bag is unpacked. You can always return here to rest.']:['床单干净，旁边有张小桌。把旅行包放下，就可以轻松出门了。','Clean sheets and a little table nearby. Put your bag down and head out light.'],terrace:has(s,'terrace-fixed')?['接线固定好了，灯光让露台暖起来。','The connectors hold. Warm light fills the terrace.']:['灯没有亮，底座里的三个接头松开了。旁边留下了清楚的刻痕。','The lantern is dark. Three connectors have come loose; small marks show where they belong.'],bridge:has(s,'bridge-fixed')?['新桥板已经固定。走上去时，桥身不再晃动。','The new boards hold firm underfoot.']:['两块桥板从中间断开了。你能从岸边查看支撑。','Two boards have split across the middle. You can inspect the supports from the bank.'],driftwood:has(s,'wood-collected')?['合用的木板已经收好了，剩下的是被海水泡软的碎木。','The sound planks are packed. Only waterlogged scraps remain.']:['潮水留下一小堆木板。有几块看起来还很结实。','The tide left a pile of planks. A few still look sound.'],gate:has(s,'route-open')?['海岸通行安排已经写清，路线可以使用了。','The coast access arrangements are posted. The route is ready.']:['指路牌旁留下了填写通行安排的空白。','The sign has a space for the access arrangements.'],notice:has(s,'market-open')?['新写的开市消息贴在最显眼的位置。','The opening announcement takes pride of place.']:['集市告示上有一条需要街坊帮忙的消息。','One notice asks the neighbors for help.'],'old-map':has(s,'alternative-route')?['路线已经拼完整，也抄进了你的笔记。','The route is complete and copied into your notes.']:['桌上压着几张旧路线图碎片，边上的地名依然能看清。','Pieces of an old trail map lie on the table. The landmarks are still legible.'],'gate-hours':has(s,'garden-agreed')?['手写便条标明借道时间：上午十点到十二点。其余时间请尊重住户的安静。','The note gives the agreed hours: ten until noon. Please respect the residents’ quiet outside those hours.']:['小门关着，门边挂了一张手写便条。','The little gate is shut. A handwritten note hangs beside it.'],logbook:['翻旧的记录本留着历年的潮汐与步道笔记。','The worn log holds years of tide and trail notes.']};
 return descriptions[e.id]??['你停下来仔细看了看。','You stop for a closer look.'];
}
