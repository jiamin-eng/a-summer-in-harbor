import {addChapel} from './chapel-layout';
import {nativeCrabEntities} from '../animals/native-crab-config';
import {techPeople} from './tech-nomads';
import {nextPeople} from './next-residents';
import {acceptedAnimals} from '../animals/art';
import {authoredAnimalEntities} from '../animals/harbor-adapter';
import {cropVerbs,shopVerbs} from '../story/crops';
import {residentPeople,residentRoutes} from './residents';
import {enrichPlanting} from './planting';
import {organizeDailyLife} from './scene-use';
import {dressHarbor} from './dressing';
import {outdoors,passages,waterBarriers} from './outdoors';
import type {Point,Rect,World} from '../engine/world';
export type Words=[string,string];export type Locale='zh'|'en';
export const tx=(w:Words,locale:Locale)=>w[locale==='zh'?0:1];
export type Prop={id:string;art:string;at:Point;width:number;footprint?:Rect;floorDecoration?:boolean;foreground?:boolean;state?:{flag:string;art:string};visibleWhen?:string};
export type Entity={landRegion?:string;landAt?:Point;landPlot?:boolean;id:string;label:Words;kind:'person'|'portal'|'object';at:Point;approach:Point;person?:string;animalId?:string;dogRoutine?:import('../animals/native-dog-observation').NativeDogRoutine;destination?:string;actions?:string[];passage?:{side:'N'|'S'|'E'|'W';sign:Point}};
export const entityLabel=(e:Entity,flags:string[]):Words=>e.id==='bridge'&&flags.includes('bridge-fixed')?['修好的小桥','Repaired footbridge']:e.id==='terrace'&&flags.includes('terrace-fixed')?['露台灯','Terrace lantern']:e.label;
export type Room={id:string;title:Words;area:string;outdoor:boolean;spawn:Point;interior:Rect;props:Prop[];entities:Entity[];neighbors:string[];map:Point};
const labels:Record<string,Words>={station:['车站街','Station Street'],harbor:['港口','The Harbor'],market:['旧街','Market Lane'],coast:['海岸','The Coast'],hill:['山坡','The Hill'],home:['你的租屋','Your Room'],cafe:['潮间咖啡馆','Tide & Table'],grocery:['街角杂货铺','Corner Grocer'],dock:['钓鱼码头','Fishing Pier'],workshop:['琼的修理铺','June’s Workshop'],gym:['港口拳馆','Harbor Boxing Club'],bazaar:['集市广场','Market Square'],secondhand:['旧物店','Second Chances'],courtyard:['住户庭院','Residents’ Courtyard'],beach:['贝壳海滩','Shell Beach'],path:['滨海道','Coastal Path'],lighthouse:['灯塔','The Lighthouse'],garden:['山坡花园','Hillside Garden'],camp:['松林营地','Pine Camp'],weather:['旧气象站','Weather Station']};
export const people:Record<string,{name:Words;unknown:Words;intro:Words;art:string;mapArt?:string;avatarArt?:string;portraitShape?:'square'}>={...residentPeople,...nextPeople,...techPeople,
 mara:{name:['玛拉','Mara'],unknown:['提着钥匙的女士','Woman with the keys'],intro:['一位穿亚麻衬衣的女士抬手招呼。她晃了晃钥匙：“你就是来住一夏的新房客吧？我是玛拉。先放下行李，别急着认全镇的人。”','A woman in a linen shirt waves a key. “You must be my summer tenant. I’m Mara. Let’s put your bag down before you try to learn the whole town.”'],art:'mara'},
 theo:{name:['西奥','Theo'],unknown:['系围裙的年轻人','Young man in an apron'],intro:['年轻人停下脚步，围裙上写着Theo。“叫我西奥。你刚到？玛拉把她的工具袋忘在这里了。”','The young man pauses. His apron reads Theo. “Just arrived? Mara left her tool bag here. You’re welcome to sit a while.”'],art:'theo'},
 june:{name:['琼','June'],unknown:['穿工装的女人','Woman in work clothes'],intro:['穿工装的女人抬起头：“我是琼，这间修理铺是我的。全年都有人弄坏东西。需要借工具？”','The woman in work clothes looks up. “June. Like the sign. Things break all year, though. Need to borrow something?”'],art:'june'},
 idris:{name:['伊德里斯','Idris'],unknown:['整理手套的教练','Coach sorting gloves'],intro:['一个肩膀宽厚的中年男人正在晾手套。“我是伊德里斯。想练练脚步？先学躲，出拳不着急。这里谁都可以说停。”','A broad-shouldered man hangs up a pair of gloves. “Idris. Want to try the footwork? Learn to move first. Anyone here can call a stop.”'],art:'idris'},
 ruth:{name:['露丝','Ruth'],unknown:['戴帆布帽的钓鱼人','Angler in a canvas hat'],intro:['戴旧帆布帽的女人把备用鱼竿靠在栏杆上。“露丝。别踩桶，那是我的午饭。你想试一竿吗？”','A woman in a faded canvas hat sets a spare rod against the rail. “Ruth. Mind the bucket—that’s lunch. Fancy a try?”'],art:'ruth'},
 luis:{name:['路易斯','Luis'],unknown:['提着布袋的店主','Shopkeeper with a cloth bag'],intro:['店主笑着招呼：“路易斯。新面孔！杂货铺门边有免费饮水。别在第一天就把钱全花在我这里。”','The shopkeeper smiles. “Luis. New face! Free tap water by the grocer’s door. Don’t spend your whole first day’s money here.”'],art:'luis'},
 nell:{name:['内尔','Nell'],unknown:['整理旧照片的店主','Shopkeeper sorting photographs'],intro:['灰发店主把一张褪色照片压平。“我是内尔。有些东西人们搬走时不愿带走，却又舍不得丢。你看这座桥。”','The grey-haired shopkeeper flattens a faded photograph. “Nell. Some things are too heavy to take and too dear to throw away. Look at this bridge.”'],art:'nell'},
 elena:{name:['埃琳娜','Elena'],unknown:['浇花的住户','Resident watering flowers'],intro:['拿着水壶的女人停下来。“埃琳娜。我知道大家想穿过我们庭院去海边，但那里也是我妈妈午睡的地方。”','A woman with a watering can pauses. “Elena. I know everyone wants a way through our courtyard to the sea. It’s also where my mother takes her afternoon nap.”'],art:'elena'},
 arthur:{name:['阿瑟','Arthur'],unknown:['擦拭风向仪的老人','Man cleaning a weather vane'],intro:['老人取下帽子，指了指胸前磨旧的名牌：Arthur。“以前每天都要量风。现在大家只看手机，不过手机可不知道下面那条小路。”','The older man removes his cap and taps a worn name badge: Arthur. “Used to measure the wind every day. Phones do it now. They don’t know the little path below us, though.”'],art:'arthur'}
};
const hubSpecs:[string,string[],Point][]=[['station',['home','cafe','grocery'],{x:0,y:1}],['harbor',['dock','workshop','gym'],{x:1,y:1}],['market',['bazaar','secondhand','courtyard'],{x:0,y:0}],['coast',['beach','path','lighthouse'],{x:2,y:1}],['hill',['garden','camp','weather'],{x:1,y:0}]];
const links:Record<string,string[]>={station:['harbor','market'],harbor:['station','coast','hill'],market:['station','hill'],coast:['harbor','hill'],hill:['market','harbor','coast']};
export const rooms:Record<string,Room>={};
const portal=(id:string,destination:string,at:Point,approach:Point):Entity=>({id,label:labels[destination],kind:'portal',destination,at,approach});
for(const [area,children,map] of hubSpecs){
 const entities:Entity[]=children.map((dest,i)=>portal('to-'+dest,dest,{x:210+i*270,y:210},{x:210+i*270,y:243}));
 links[area].forEach((dest,i)=>entities.push(portal('road-'+dest,dest,{x:130+i*335,y:660},{x:130+i*335,y:630})));
 rooms[area]={id:area,title:labels[area],area,outdoor:true,spawn:{x:465,y:535},interior:{x:40,y:190,w:880,h:520},props:[],entities,neighbors:[...children,...links[area]],map};
 children.forEach((id,i)=>{const outdoor=['dock','bazaar','courtyard','beach','path','garden','camp'].includes(id);rooms[id]={id,title:labels[id],area,outdoor,spawn:{x:460,y:540},interior:outdoor?{x:80,y:120,w:800,h:560}:{x:270,y:225,w:420,h:360},props:[],entities:[portal('exit',area,{x:480,y:582},{x:470,y:559})],neighbors:[area],map:{x:map.x+(i-1)*.22,y:map.y-.25}};});
}
const addPerson=(scene:string,person:string,x:number,y:number)=>rooms[scene].entities.push({id:person,label:people[person].unknown,kind:'person',person,at:{x,y},approach:{x:x-8,y:y+42}});
addPerson('station','mara',438,435);addPerson('cafe','theo',575,375);addPerson('workshop','june',510,380);addPerson('gym','idris',535,345);addPerson('dock','ruth',410,350);addPerson('grocery','luis',535,370);addPerson('secondhand','nell',510,380);addPerson('courtyard','elena',495,370);addPerson('weather','arthur',510,365);
const object=(scene:string,id:string,label:Words,x:number,y:number,actions:string[])=>rooms[scene].entities.push({id,label,kind:'object',at:{x,y},approach:{x:x-8,y:y+34},actions});
object('home','bed',['床与行李','Bed & luggage'],380,375,['unpack','rest','sleep']);object('cafe','terrace',['待修的露台灯','Terrace lantern for repair'],370,380,['repair-terrace']);object('path','bridge',['受损的小桥','Damaged footbridge'],480,360,['inspect-bridge','repair-bridge']);object('beach','driftwood',['岸边的木板','Washed-up planks'],385,370,['gather-wood']);object('lighthouse','gate',['海岸路线入口','Coast route gate'],480,360,['open-route']);object('bazaar','notice',['集市告示板','Market noticeboard'],480,365,['read-market','open-market']);object('camp','old-map',['旧路线图','Old route map'],420,360,['assemble-map']);object('garden','gate-hours',['小门上的便条','Note on the garden gate'],475,360,['inspect-garden']);object('weather','logbook',['气象记录本','Weather log'],390,380,['read-weather']);
rooms.cafe.props=[{id:'counter',art:'cafe-counter',at:{x:470,y:340},width:150,footprint:{x:400,y:313,w:140,h:30}},{id:'fern',art:'plant',at:{x:653,y:295},width:40,footprint:{x:643,y:278,w:20,h:18}}];
// Furniture groups give each place a purpose; footprints are grounded contact areas.
const furnish=(scene:string,id:string,art:string,x:number,y:number,width:number,groundW=width*.75,groundH=14)=>rooms[scene].props.push({id,art,at:{x,y},width,footprint:{x:x-groundW/2,y:y-groundH,w:groundW,h:groundH}});
furnish('home','bed','bed',380,390,42,37,65);
furnish('home','bag','luggage',430,405,28,24,14);
furnish('home','breakfast','cafe-table-v2',570,355,48,42,24);
furnish('home','fern','plant',635,300,32,16,12);
furnish('home','entry-planter','flower-planter',310,540,44,36,12);
furnish('cafe','table-a','cafe-table-v2',450,455,48,42,24);
furnish('cafe','table-b','cafe-table-v2',575,475,48,42,24);
furnish('cafe','light','lantern',365,370,25,12,12);
furnish('cafe','outside-bench','bench',335,490,65,58,14);
furnish('workshop','tools','workbench',410,335,104,92,28);
furnish('workshop','wood-stock','driftwood',620,460,64,58,22);
furnish('workshop','bench','bench',355,465,65,58,14);
furnish('gym','gloves','boxing-rack',385,330,78,69,22);
furnish('gym','rest','bench',605,480,68,58,14);
furnish('gym','fern','plant',310,285,32,15,12);
furnish('grocery','counter','cafe-counter',410,320,112,102,24);
furnish('grocery','rest','bench',335,455,65,58,14);
furnish('grocery','plants','flower-planter',620,520,60,52,16);
furnish('secondhand','old-table','cafe-table-v2',390,360,48,42,24);
furnish('secondhand','old-luggage','luggage',410,450,32,26,15);
furnish('secondhand','bench','bench',615,460,65,58,14);
furnish('weather','desk','workbench',390,350,95,82,26);
furnish('weather','rest','bench',610,475,68,58,14);
furnish('lighthouse','wayfinding','street-sign',480,350,48,10,12);
furnish('lighthouse','bench','bench',350,450,68,58,14);
furnish('dock','tackle','fishing-kit',460,360,43,35,24);
furnish('dock','bench','bench',580,420,68,58,14);
furnish('bazaar','notice','noticeboard',480,365,50,44,12);
furnish('bazaar','empty-bench','bench',650,450,68,58,14);
furnish('beach','timber','driftwood',385,370,62,54,21);
furnish('path','footbridge','bridge-broken',480,330,170,0,0);rooms.path.props.at(-1)!.state={flag:'bridge-fixed',art:'bridge'};
furnish('path','notice','noticeboard',345,330,40,32,10);
furnish('camp','old-table','cafe-table-v2',420,345,48,42,22);
furnish('camp','rest','bench',560,460,68,58,14);
furnish('garden','gate-note','noticeboard',475,340,44,38,12);
furnish('courtyard','flowers','flower-planter',395,335,66,55,16);
furnish('courtyard','bench','bench',630,430,68,58,14);
for(const scene of ['courtyard','garden','camp','path']){
 furnish(scene,'shade-west','canopy-tree',220,360,155,22,16);
 furnish(scene,'shade-east','canopy-tree',755,535,175,25,18);
 furnish(scene,'flowers-north','flower-planter',620,265,55,45,12);
}
// Apply outdoor topology independently of interior room assembly.
for(const [id,layout] of Object.entries(outdoors)){
 const room=rooms[id];room.interior=layout.bounds;room.spawn=layout.spawn;
 for(const e of room.entities){const p=e.id.startsWith('to-')?layout.entrances[e.destination!]:e.id.startsWith('road-')?layout.roadExits[e.destination!]:undefined;
  if(p){e.at={...p};e.approach={x:p.x-8,y:p.y+20}}
 }
}
// The first person is visible on arrival, near the station street landmark.
const landlord=rooms.station.entities.find(e=>e.id==='mara')!;landlord.at={x:565,y:685};landlord.approach={x:550,y:730};
// Outdoor furnishings share the same foot scale as indoor objects. Building foundations
// match outdoor barriers; foliage blocks only its trunk, never the entire canopy.
rooms.station.props.push(
 {id:'rental',art:'house-rental',at:{x:247,y:350},width:270},
 {id:'cafe-building',art:'house-cafe',at:{x:920,y:320},width:300},
 {id:'grocer-building',art:'house-grocery',at:{x:1080,y:880},width:250},
 {id:'bench-square',art:'bench',at:{x:805,y:665},width:68,footprint:{x:775,y:649,w:60,h:14}},
 {id:'arrival-bench',art:'bench',at:{x:675,y:775},width:68,footprint:{x:645,y:759,w:60,h:14}},
 {id:'wayfinding',art:'street-sign',at:{x:730,y:520},width:56,footprint:{x:724,y:506,w:12,h:14}},
 {id:'tree-south',art:'canopy-tree',at:{x:445,y:855},width:145,footprint:{x:434,y:837,w:22,h:18}},
 {id:'tree-west',art:'canopy-tree',at:{x:120,y:630},width:170,footprint:{x:107,y:610,w:26,h:20}},
 {id:'tree-east',art:'canopy-tree',at:{x:1185,y:435},width:150,footprint:{x:1174,y:417,w:22,h:18}},
 {id:'tree-garden',art:'canopy-tree',at:{x:1040,y:705},width:165,footprint:{x:1029,y:687,w:22,h:18}}
);
// Large outdoor districts are composed around landmarks and crossing routes.
rooms.harbor.props.push({id:'workshop-front',art:'house-workshop',at:{x:300,y:290},width:270},{id:'club-front',art:'house-gym',at:{x:802,y:305},width:280});
rooms.market.props.push({id:'old-shop',art:'house-rental',at:{x:232,y:350},width:250},{id:'courtyard-house',art:'house-grocery',at:{x:1100,y:355},width:280});
furnish('market','stall-west','market-stall',360,595,125,104,40);
furnish('market','stall-east','market-stall',935,690,130,110,42);
furnish('market','square-bench','bench',650,720,68,58,14);
furnish('harbor','crates-a','harbor-crates',200,505,46,32,22);
furnish('harbor','crates-b','harbor-crates',575,720,44,34,22);
furnish('harbor','quay-bench','bench',945,555,68,58,14);
furnish('harbor','pier-sign','street-sign',728,590,46,10,12);
furnish('coast','tower','lighthouse-building',1080,320,190,150,45);
furnish('coast','rock-west','coastal-rocks',275,315,105,80,35);
furnish('coast','rock-shore','coastal-rocks',820,820,90,65,25);
furnish('coast','view-bench','bench',695,565,68,58,14);
furnish('hill','station-building','weather-building',745,245,215,185,40);
furnish('hill','tent-east','camp-tent',1100,445,105,75,45);
furnish('hill','ridge-rock','coastal-rocks',850,760,100,75,38);
for(const id of ['market','hill'])for(const [i,x,y] of [[0,175,730],[1,1160,750],[2,1120,190],[3,425,195]])furnish(id,'landscape-'+i,'canopy-tree',x,y,150,24,18);
furnish('camp','tent','camp-tent',650,315,105,80,50);
furnish('camp','picnic-crate','harbor-crates',590,370,36,28,18);
furnish('dock','rope-crates','harbor-crates',600,310,43,34,22);
furnish('beach','rocks','coastal-rocks',720,475,95,65,24);
furnish('home','chair','bench',570,420,48,40,12);
furnish('cafe','chair-a','bench',450,510,48,40,12);
furnish('cafe','chair-b','bench',575,530,48,40,12);
furnish('secondhand','chair','bench',390,425,48,40,12);
furnish('workshop','spares','harbor-crates',605,350,44,34,22);
for(const [i,x,y] of [[0,315,330],[1,650,330],[2,650,520]]){furnish('bazaar','festival-stall-'+i,'market-stall-closed',x,y,110,90,32);rooms.bazaar.props.at(-1)!.state={flag:'market-open',art:'market-stall'}}
for(const n of [1,2]){
 const id='workshop-annex-'+n,x=n===1?345:620;labels[id]=['修理铺的小间 '+n,'Workshop annex '+n];
 rooms[id]={id,title:['修理铺的小间 '+n,'Workshop annex '+n],area:'harbor',outdoor:false,spawn:{x:470,y:550},interior:{x:270,y:225,w:420,h:360},props:[],entities:[portal('exit','workshop',{x:480,y:582},{x:470,y:559})],neighbors:['workshop'],map:{x:1,y:1}};
 rooms.workshop.neighbors.push(id);rooms.workshop.entities.push(portal('to-annex-'+n,id,{x,y:225},{x:x-8,y:257}));
 rooms.workshop.props.push({id:'annex-door-'+n,art:'door-front-v7',at:{x,y:225},width:46,visibleWhen:id});
 furnish(id,'desk-a','workbench',380,350,90,76,24);furnish(id,'desk-b','cafe-table-v2',575,420,60,50,24);furnish(id,'seat','bench',575,480,48,40,12);furnish(id,'green','plant',635,290,30,16,12);
 object(id,'observation-a',['台上的记录','Notes on the bench'],380,355,['notes-observe']);object(id,'observation-b',['收好的材料','Stored material'],575,420,['notes-observe']);
}
// Outdoor art refresh. Actor height remains 56 world units; orient the source,
// never rotate a flat sprite to pretend it is a differently facing bench.
for(const r of Object.values(rooms).filter(r=>r.outdoor)){
 let treeIndex=0;
 for(const p of r.props){
  if(p.art==='canopy-tree'){
   const n=treeIndex++;const tree=r.id==='hill'||r.id==='camp'?(n%3===2?'tree-birch-v3':'tree-pine-v3'):n%2?'tree-birch-v3':'tree-coastal-v3';
   p.art=tree;p.width=tree==='tree-pine-v3'?124:tree==='tree-birch-v3'?95:155;
  }
  if(p.art==='bench'){
   if(['coast','dock','beach'].includes(r.id)){p.art='bench-back-v3';p.width=76}
   if((r.id==='station'&&p.id==='arrival-bench')||['courtyard','garden'].includes(r.id)){p.art='bench-side-v3';p.width=26;p.footprint={x:p.at.x-12,y:p.at.y-47,w:24,h:47}}
  }
 }
 for(const e of r.entities){
  const link=e.destination&&passages[r.id]?.[e.destination];if(!link)continue;
  e.at={...link.at};e.approach={...link.approach};e.passage={side:link.side,sign:{...link.sign}};
  r.props.push({id:'route-sign-'+e.id,art:'trail-sign-v3',at:{...link.sign},width:29,footprint:{x:link.sign.x-4,y:link.sign.y-8,w:8,h:8}});
 }
}
// Small, purposeful groups: shade by seating and taller pines beyond the trail.
furnish('station','arrival-flowers','flower-planter',715,815,42,32,12);
furnish('station','birch-arrival','tree-birch-v3',775,810,90,18,14);
furnish('harbor','quay-planter','flower-planter',995,560,52,42,14);
furnish('market','square-birch','tree-birch-v3',740,775,95,18,14);
furnish('coast','wind-tree','tree-coastal-v3',700,680,148,23,16);
furnish('coast','young-birch','tree-birch-v3',390,360,82,16,12);
furnish('beach','dune-tree','tree-coastal-v3',235,290,130,21,16);
furnish('beach','shore-seat','bench-back-v3',650,570,76,65,14);
furnish('garden','garden-seat','bench-side-v3',635,450,26,24,47);
furnish('camp','pine-north','tree-pine-v3',715,300,112,21,16);

// Interior life is arranged in useful groups. Authored interaction positions and
// entrance clearances stay intact; textiles are flat decor below feet, not actors.
const refurnish=(scene:string,id:string,art:string,width:number,groundW:number,groundH:number)=>{
 const p=rooms[scene].props.find(p=>p.id===id)!;p.art=art;p.width=width;
 p.footprint={x:p.at.x-groundW/2,y:p.at.y-groundH,w:groundW,h:groundH};
};
for(const [scene,id] of [['home','chair'],['cafe','chair-a'],['cafe','chair-b'],['secondhand','chair']])refurnish(scene,id,'wooden-chair',23,19,17);
refurnish('grocery','counter','interior-grocery-v1',104,94,25);
refurnish('grocery','rest','harbor-crates',46,34,22);
refurnish('weather','desk','interior-mapdesk-v1',95,82,26);
furnish('home','books-and-linen','interior-bookcase-v1',345,288,65,57,19);
furnish('home','summer-coat','interior-coatstand-v1',625,505,19,12,10);
furnish('cafe','pantry','interior-grocery-v1',320,292,65,57,20);
furnish('grocery','shelf','interior-grocery-v1',615,290,80,72,23);
furnish('grocery','storage','harbor-crates',330,310,35,28,19);
furnish('workshop','tool-storage','interior-tools-v1',510,290,65,56,20);
furnish('workshop','coat','interior-coatstand-v1',650,505,19,12,10);
furnish('gym','towel-shelf','interior-bookcase-v1',320,500,62,53,18);
furnish('gym','club-coat','interior-coatstand-v1',640,290,19,12,10);
furnish('secondhand','book-shelf','interior-bookcase-v1',610,300,80,70,22);
furnish('secondhand','old-coat','interior-coatstand-v1',315,290,19,12,10);
furnish('weather','records','interior-bookcase-v1',620,290,72,64,21);
furnish('weather','raincoat','interior-coatstand-v1',650,530,19,12,10);
furnish('lighthouse','chart-table','interior-mapdesk-v1',610,310,85,74,25);
furnish('lighthouse','keeper-coat','interior-coatstand-v1',315,295,19,12,10);
furnish('lighthouse','records','interior-bookcase-v1',625,455,70,61,20);
for(const [scene,x,y,width] of [['home',475,490,240],['cafe',500,530,260]] as [string,number,number,number][])rooms[scene].props.push({id:'woven-rug',art:'interior-rug-v1',at:{x,y},width,floorDecoration:true});

dressHarbor(rooms);
organizeDailyLife(rooms);
enrichPlanting(rooms);
addChapel(rooms);

export const doorways=Object.fromEntries(Object.values(rooms).filter(r=>!r.outdoor).map(r=>{
 const floorEnd=r.interior.y+r.interior.h,door={id:'exit',side:'S' as const,center:480,width:50,leafWidth:46,leafBottom:floorEnd+8,opening:{start:455,end:505},activation:{x:441,y:floorEnd-58,w:78,h:58},closedFootprint:{x:455,y:floorEnd,w:50,h:8}};
 r.props.push({id:'exit-leaf',art:'door-front-v7',at:{x:door.center,y:door.leafBottom},width:door.leafWidth,foreground:true});
 return [r.id,door];
}));
rooms.garden.props.push({id:'visitor-notice',art:'noticeboard',at:{x:600,y:600},width:38,visibleWhen:'news:checked'});
export const world:World={width:1440,height:1088,step:12,actor:{w:16,h:12},scenes:Object.fromEntries(Object.values(rooms).map(r=>[r.id,{interior:r.interior,spawn:r.spawn,obstacles:[...(outdoors[r.id]?waterBarriers(outdoors[r.id]):[]),...(outdoors[r.id]?.barriers??[]),...r.props.flatMap(p=>p.footprint?[p.footprint]:[])]}]))};
const fern=rooms.garden.props.find(p=>p.art==='flora-fern-v1')!;fern.id='growing-fern';
rooms.garden.entities.push({id:'growing-fern',kind:'object',label:['路边的小蕨','Pathside fern'],at:{...fern.at},approach:{x:fern.at.x+28,y:fern.at.y+14},actions:['water-fern']});
for(const [person,routes] of Object.entries(residentRoutes))for(const route of routes){const existing=rooms[route.scene].entities.find(e=>e.person===person);if(existing){existing.at={...route.at};existing.approach={x:route.at.x-8,y:route.at.y+42}}else addPerson(route.scene,person,route.at.x,route.at.y);}
const cropSideRose=rooms.garden.props.find(p=>p.art==='flora-rose-v1'&&p.at.x===742);if(cropSideRose)cropSideRose.at.x=850;
for(let i=0;i<3;i++)object('garden','crop-bed-'+(i+1),['菜畦 '+(i+1),'Growing bed '+(i+1)],630+i*70,630,cropVerbs);
rooms.garden.entities.push({id:'visitor-note',kind:'object',label:['游客便条','Visitor note'],at:{x:600,y:600},approach:{x:592,y:634},actions:[]});
object('grocery','crop-counter',['种子与收获柜台','Seeds & harvest counter'],455,365,shopVerbs);
for(const {scene,entity} of authoredAnimalEntities(acceptedAnimals))rooms[scene].entities.push(entity);
for(const {scene,entity} of nativeCrabEntities)rooms[scene].entities.push(entity);
export function entityAt(scene:string,id:string){return rooms[scene]?.entities.find(e=>e.id===id)}

export function worldWithFlags(flags:string[]):World {
 if(flags.includes('bridge-fixed'))return world;
 return {...world,scenes:{...world.scenes,path:{...world.scenes.path,obstacles:[...world.scenes.path.obstacles,{x:452,y:285,w:52,h:48}]}}};
}
