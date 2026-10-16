import type {Room} from './data';
/** Existing approved source sprites, assembled as a local functional hall. The
 * exterior remains a clearly labelled entry, pending a church facade contract. */
export function addChapel(rooms:Record<string,Room>){
 const entrance={id:'to-chapel',label:['教堂大厅','Chapel Hall'] as [string,string],kind:'portal' as const,destination:'chapel',at:{x:510,y:365},approach:{x:502,y:397}};
 rooms.hill.entities.push(entrance);rooms.hill.neighbors.push('chapel');
 // No added outdoor footprint: preserve all old saved hill positions.
 rooms.hill.props.push({id:'chapel-wayfinding',art:'street-sign',at:{x:510,y:365},width:46});
 rooms.chapel={id:'chapel',title:['教堂大厅','Chapel Hall'],area:'hill',outdoor:false,spawn:{x:470,y:559},interior:{x:270,y:225,w:420,h:360},map:{x:1.28,y:-.1},neighbors:['hill'],entities:[
  {id:'exit',label:['山坡','The Hill'],kind:'portal',destination:'hill',at:{x:480,y:582},approach:{x:470,y:559}},
  {id:'chapel-note',label:['社区活动便条','Community activity note'],kind:'object',at:{x:625,y:525},approach:{x:617,y:559},actions:['chapel-read-notice','chapel-recall']},
  {id:'chapel-reading',label:['阅读角','Reading corner'],kind:'object',at:{x:355,y:352},approach:{x:347,y:386},actions:['chapel-help-reading','chapel-recall']},
  {id:'chapel-seat',label:['靠过道的座席','Aisle-side seats'],kind:'object',at:{x:580,y:485},approach:{x:572,y:519},actions:['chapel-listen','chapel-recall']},
 ],props:[
  {id:'bookcase',art:'interior-bookcase-v1',at:{x:335,y:280},width:65,footprint:{x:307,y:263,w:56,h:17}},
  {id:'reading-table',art:'dining-table-front-v1',at:{x:355,y:352},width:58,footprint:{x:329,y:327,w:52,h:25}},
  {id:'reading-chair',art:'dining-chair-back-v1',at:{x:392,y:352},width:23,visibleWhen:'chapel:participation:reading'},
  ...[365,440,515].flatMap((y,i)=>[355,590].map((x,j)=>({id:'bench-'+i+'-'+j,art:'chapel-wood-pew',at:{x,y},width:68,footprint:{x:x-32,y:y-14,w:64,h:14}}))).filter(p=>p.id!=='bench-0-0'),
  {id:'note',art:'noticeboard',at:{x:625,y:525},width:38,footprint:{x:609,y:515,w:32,h:10}},
  {id:'coat',art:'interior-coatstand-v1',at:{x:310,y:535},width:19,footprint:{x:304,y:525,w:12,h:10}},
  {id:'stained-window',art:'chapel-stained-glass-window',at:{x:475,y:225},width:32},
  {id:'altar',art:'chapel-altar',at:{x:475,y:275},width:94,footprint:{x:433,y:253,w:84,h:22}},
  {id:'candle-left',art:'chapel-floor-candlestick',at:{x:412,y:285},width:12,footprint:{x:407,y:275,w:10,h:10}},
  {id:'candle-right',art:'chapel-floor-candlestick',at:{x:538,y:285},width:12,footprint:{x:533,y:275,w:10,h:10}},
 ]};
}
