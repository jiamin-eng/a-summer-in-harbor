import type {Point,Rect} from '../engine/world';
export type TerrainPatch=Rect&{material:'stone'|'grass'|'sand'|'water'|'wood'};
export type Passage={at:Point;approach:Point;sign:Point;side:'N'|'S'|'E'|'W'};
// Authored spatial links: the route, approach, sign and arrival share one contract.
export const passages:Record<string,Record<string,Passage>>={};
export type OutdoorLayout={bounds:Rect;spawn:Point;landmark:Point;patches:TerrainPatch[];barriers:Rect[];entrances:Record<string,Point>;roadExits:Record<string,Point>;quietZone:Rect};
// The topmost terrain patch is also the collision authority. Partition at patch
// edges so no invisible water strip is accidentally walkable beside a pier.
export function waterBarriers(layout:OutdoorLayout):Rect[]{
 const b=layout.bounds;
 const xs=[...new Set([b.x,b.x+b.w,...layout.patches.flatMap(p=>[Math.max(b.x,p.x),Math.min(b.x+b.w,p.x+p.w)])])].filter(x=>x>=b.x&&x<=b.x+b.w).sort((a,b)=>a-b);
 const ys=[...new Set([b.y,b.y+b.h,...layout.patches.flatMap(p=>[Math.max(b.y,p.y),Math.min(b.y+b.h,p.y+p.h)])])].filter(y=>y>=b.y&&y<=b.y+b.h).sort((a,b)=>a-b);
 const result:Rect[]=[];
 for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){
  const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;
  const top=layout.patches.slice().reverse().find(p=>x>=p.x&&x<p.x+p.w&&y>=p.y&&y<p.y+p.h);
  if(top?.material==='water')result.push({x:xs[i],y:ys[j],w:xs[i+1]-xs[i],h:ys[j+1]-ys[j]});
 }
 return result;
}
// Shared layout drives terrain assembly, collision and destination positions. No surrounding room walls.
export const outdoors:Record<string,OutdoorLayout>={
 station:{bounds:{x:40,y:80,w:1280,h:880},spawn:{x:540,y:760},landmark:{x:620,y:530},quietZone:{x:750,y:610,w:250,h:180},patches:[{x:40,y:80,w:1280,h:880,material:'grass'},{x:120,y:430,w:1140,h:220,material:'stone'},{x:480,y:80,w:230,h:880,material:'stone'},{x:790,y:235,w:300,h:210,material:'stone'},{x:212,y:330,w:75,h:110,material:'stone'}],barriers:[{x:130,y:130,w:235,h:210},{x:790,y:150,w:260,h:155},{x:975,y:690,w:210,h:180}],entrances:{home:{x:247,y:350},cafe:{x:920,y:320},grocery:{x:1080,y:880}},roadExits:{harbor:{x:1290,y:540},market:{x:585,y:110}}},
 harbor:{bounds:{x:40,y:80,w:1280,h:880},spawn:{x:120,y:440},landmark:{x:855,y:585},quietZone:{x:520,y:420,w:240,h:150},patches:[{x:40,y:80,w:1280,h:880,material:'water'},{x:40,y:80,w:1080,h:520,material:'stone'},{x:80,y:570,w:570,h:390,material:'wood'},{x:750,y:550,w:110,h:355,material:'wood'}],barriers:[{x:1150,y:80,w:170,h:880},{x:650,y:635,w:100,h:325},{x:860,y:635,w:290,h:325},{x:190,y:100,w:240,h:175},{x:680,y:115,w:250,h:175}],entrances:{dock:{x:803,y:835},workshop:{x:300,y:290},gym:{x:802,y:305}},roadExits:{station:{x:70,y:450},coast:{x:1100,y:450},hill:{x:555,y:110}}},
 market:{bounds:{x:40,y:80,w:1280,h:880},spawn:{x:615,y:880},landmark:{x:650,y:490},quietZone:{x:90,y:530,w:190,h:200},patches:[{x:40,y:80,w:1280,h:880,material:'grass'},{x:280,y:220,w:790,h:560,material:'stone'},{x:500,y:80,w:210,h:880,material:'stone'},{x:980,y:460,w:340,h:160,material:'stone'}],barriers:[{x:120,y:125,w:220,h:205},{x:975,y:145,w:255,h:190},{x:310,y:510,w:100,h:85},{x:875,y:605,w:120,h:80}],entrances:{bazaar:{x:650,y:430},secondhand:{x:232,y:350},courtyard:{x:1100,y:355}},roadExits:{station:{x:615,y:920},hill:{x:1280,y:530}}},
 coast:{bounds:{x:40,y:80,w:1280,h:880},spawn:{x:110,y:475},landmark:{x:1070,y:235},quietZone:{x:610,y:570,w:280,h:210},patches:[{x:40,y:80,w:1280,h:880,material:'water'},{x:40,y:80,w:1280,h:520,material:'grass'},{x:80,y:510,w:880,h:350,material:'sand'},{x:50,y:415,w:1240,h:120,material:'stone'},{x:1010,y:120,w:150,h:400,material:'stone'}],barriers:[{x:40,y:870,w:1280,h:90},{x:970,y:630,w:350,h:240},{x:180,y:150,w:190,h:170}],entrances:{beach:{x:560,y:755},path:{x:820,y:460},lighthouse:{x:1025,y:320}},roadExits:{harbor:{x:70,y:475},hill:{x:550,y:110}}},
 hill:{bounds:{x:40,y:80,w:1280,h:880},spawn:{x:650,y:900},landmark:{x:750,y:225},quietZone:{x:430,y:440,w:260,h:180},patches:[{x:40,y:80,w:1280,h:880,material:'grass'},{x:70,y:500,w:1210,h:100,material:'sand'},{x:590,y:250,w:150,h:710,material:'sand'},{x:300,y:200,w:780,h:130,material:'sand'},{x:960,y:250,w:100,h:350,material:'sand'}],barriers:[{x:120,y:100,w:180,h:150},{x:780,y:675,w:180,h:130},{x:1020,y:100,w:140,h:125}],entrances:{garden:{x:360,y:295},camp:{x:1010,y:540},weather:{x:745,y:245}},roadExits:{market:{x:70,y:540},harbor:{x:650,y:920},coast:{x:1270,y:540}}}
};

// Smaller outdoor destinations retain natural boundaries and distinct terrain.
// These are clearings, beaches and piers, not interior room envelopes.
const clearing=(patches:TerrainPatch[],spawn:Point={x:460,y:540}):OutdoorLayout=>({bounds:{x:80,y:120,w:800,h:560},spawn,landmark:{x:480,y:350},quietZone:{x:560,y:400,w:160,h:100},patches,barriers:[],entrances:{},roadExits:{}});
outdoors.dock=clearing([{x:80,y:120,w:800,h:560,material:'water'},{x:325,y:120,w:330,h:560,material:'wood'},{x:120,y:540,w:680,h:140,material:'stone'}]);
outdoors.beach=clearing([{x:80,y:120,w:800,h:560,material:'sand'},{x:80,y:120,w:800,h:120,material:'grass'},{x:0,y:620,w:1440,h:468,material:'water'}]);
outdoors.path=clearing([{x:80,y:120,w:800,h:560,material:'grass'},{x:150,y:285,w:650,h:100,material:'stone'},{x:435,y:120,w:90,h:235,material:'water'},{x:392,y:285,w:176,h:48,material:'wood'},{x:430,y:380,w:100,h:300,material:'stone'}]);
for(const id of ['garden','camp','courtyard'])outdoors[id]=clearing([{x:80,y:120,w:800,h:560,material:'grass'},{x:430,y:210,w:110,h:470,material:id==='camp'?'sand':'stone'},{x:240,y:340,w:460,h:100,material:id==='camp'?'sand':'stone'}]);
outdoors.bazaar=clearing([{x:80,y:120,w:800,h:560,material:'grass'},{x:190,y:210,w:580,h:380,material:'stone'},{x:430,y:590,w:100,h:90,material:'stone'}]);

function route(scene:string,destination:string,x:number,y:number,side:Passage['side'],sign:Point){
 const dx=side==='W'?28:side==='E'?-28:0,dy=side==='N'?28:side==='S'?-28:0;
 (passages[scene]??={})[destination]={at:{x,y},approach:{x:x+dx-8,y:y+dy-6},sign,side};
}
route('station','harbor',1280,540,'E',{x:1240,y:610});
route('station','market',585,110,'N',{x:670,y:160});
route('harbor','station',70,450,'W',{x:120,y:520});
route('harbor','coast',1280,450,'E',{x:1235,y:535});
route('harbor','hill',555,110,'N',{x:625,y:160});
route('harbor','dock',805,645,'S',{x:835,y:585});
route('market','station',615,920,'S',{x:690,y:885});
route('market','hill',1280,530,'E',{x:1240,y:595});
route('market','bazaar',605,110,'N',{x:685,y:170});
// The courtyard keeps its visible house gate, rather than becoming a ground exit.
route('coast','harbor',70,475,'W',{x:130,y:550});
route('coast','hill',550,110,'N',{x:620,y:170});
route('coast','path',1280,475,'E',{x:1235,y:550});
route('coast','beach',550,805,'S',{x:625,y:765});
route('hill','market',70,540,'W',{x:125,y:615});
route('hill','harbor',650,920,'S',{x:735,y:880});
route('hill','coast',1270,540,'E',{x:1230,y:610});
route('hill','garden',355,110,'N',{x:420,y:170});
route('hill','camp',1005,110,'N',{x:1080,y:170});
for(const [scene,parent] of [['garden','hill'],['camp','hill'],['courtyard','market'],['bazaar','market'],['dock','harbor']])route(scene,parent,480,650,'S',{x:555,y:605});
route('beach','coast',480,150,'N',{x:555,y:205});
route('path','coast',125,335,'W',{x:195,y:400});

// Each passage follows terrain to a visible continuation; no transport in blank grass.
outdoors.station.patches.push({x:120,y:430,w:1200,h:220,material:'stone'},{x:995,y:875,w:150,h:50,material:'stone'},{x:630,y:890,w:500,h:55,material:'stone'});
outdoors.coast.patches.push({x:495,y:80,w:110,h:450,material:'stone'},{x:495,y:525,w:110,h:335,material:'sand'});
outdoors.hill.patches.push({x:305,y:110,w:100,h:160,material:'sand'},{x:955,y:110,w:100,h:180,material:'sand'});
outdoors.beach.patches.push({x:430,y:120,w:100,h:430,material:'sand'});
outdoors.path.patches.push({x:80,y:285,w:150,h:100,material:'stone'});
// The west/east edges of the quay need a physical dry route to the next district.
outdoors.harbor.patches.push({x:40,y:395,w:1280,h:110,material:'stone'});
outdoors.harbor.barriers=outdoors.harbor.barriers.filter(b=>b.x!==1150);
outdoors.harbor.barriers.push({x:1150,y:80,w:170,h:315},{x:1150,y:505,w:170,h:455});

// Rocks/trees/tents already have grounded prop footprints. Old placeholder
// rectangles here blocked empty grass and no longer represent scenery.
outdoors.coast.barriers=outdoors.coast.barriers.filter(b=>b.x!==180);
outdoors.hill.barriers=[];

// Most passages continue into off-map scenery. Hill's soil roads instead stop
// inside bounds, where the native grass seam can draw a complete endpoint.
// Travel still needs an explicit action.
for(const [scene,links] of Object.entries(passages))for(const p of Object.values(links)){
 const layout=outdoors[scene];
 const ground=layout.patches.slice().reverse().find(t=>p.at.x>=t.x&&p.at.x<=t.x+t.w&&p.at.y>=t.y&&p.at.y<=t.y+t.h);
 const material=ground?.material??'stone';const width=material==='wood'?100:110;
 // Hill's east road is a visible cul-de-sac at the playable edge. Keep its
 // coast portal at x=1270, but end the soil at x=1280 so its native end trim
 // fits inside bounds (x=1320) instead of drawing a false road to x=1440.
 const eastEnd=scene==='hill'&&p===passages.hill.coast?1280:1440;
 const westStart=scene==='hill'&&p===passages.hill.market?70:0;
 const northStart=scene==='hill'&&(p===passages.hill.garden||p===passages.hill.camp)?110:0;
 const patch=p.side==='N'?{x:p.at.x-width/2,y:northStart,w:width,h:p.at.y+40-northStart}:
  p.side==='S'?{x:p.at.x-width/2,y:p.at.y-40,w:width,h:1088-p.at.y+40}:
  p.side==='W'?{x:westStart,y:p.at.y-width/2,w:p.at.x+40-westStart,h:width}:
  {x:p.at.x-40,y:p.at.y-width/2,w:eastEnd-p.at.x+40,h:width};
 if((p.side==='N'||p.side==='S')&&ground&&ground.w<=230){patch.x=ground.x;patch.w=ground.w}
 if((p.side==='E'||p.side==='W')&&ground&&ground.h<=230){patch.y=ground.y;patch.h=ground.h}
 layout.patches.push({...patch,material});
}
