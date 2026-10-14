import type {ForegroundRevealConfig} from '../engine/foreground-reveal';
import dimensions from './art-dimensions.json';
import {rooms} from './data';

// Outdoor facades have walkable strips behind their roofs and beside walls.
// The courtyard tree canopy also overlaps the house's rear approach. Local
// cutaways preserve those routes without moving scenery or saved positions.
const targets=[
 ['station','rental'],['station','cafe-building'],['station','grocer-building'],
 ['market','old-shop'],['market','courtyard-house'],
 ['market','landscape-2'],
 ['harbor','workshop-front'],['harbor','club-front'],
 ['coast','tower'],['hill','station-building'],
] as const;

export function outdoorBuildingReveals():ForegroundRevealConfig[]{
 return targets.map(([scene,id])=>{
  const prop=rooms[scene].props.find(p=>p.id===id)!;
  const art=dimensions[prop.art as keyof typeof dimensions];
  const height=art.height*prop.width/art.width;
  const left=prop.at.x-prop.width/2,top=prop.at.y-height;
  const revealUntil=Math.min(prop.at.y-10,prop.at.y+(prop.depthOffset??0));
  return {
   textureForScene:current=>current===scene?prop.art+'.png':'__no-outdoor-building__',
   size:{w:1440,h:1088},
   originForScene:()=>({x:left,y:top,width:art.width,height:art.height,worldWidth:prop.width,worldHeight:height}),
   center:{x:8,y:-20},radius:50,opacity:.24,
   active:(p,current)=>current===scene&&p.x+8>=left-24&&p.x+8<=left+prop.width+24&&p.y>=Math.max(top,rooms[scene].interior.y)&&p.y<revealUntil,
  };
 });
}
