import {writeFileSync} from 'node:fs';
import {structuralContactPlan,structuralArtGaps} from '../src/world/structural-contact-plan';
import {coastalMaterialAt} from '../src/world/coastal-material-field';
import {outdoors} from '../src/world/outdoors';
import {terrainAt} from '../src/world/road-boundaries';

const pairs=new Set(['stone/water','water/wood','stone/wood','grass/wood']);
const result={base:'55c8eabc46fdd11d5f19195c135ef1b5ab2b6f0f',sampleWorldStep:4,scope:'final visible material field, sampled boundary geometry; visual pixel acceptance remains separate',scenes:{}} as any;
for(const scene of ['harbor','dock','coast-beach-path']){
 const b=scene==='coast-beach-path'?{x:0,y:0,w:2600,h:1744}:outdoors[scene].bounds;
 const at=scene==='coast-beach-path'?coastalMaterialAt:(x:number,y:number)=>terrainAt(outdoors[scene],{x,y});
 const plan=structuralContactPlan(scene),gaps=structuralArtGaps(scene),counts={} as Record<string,{sampled:number;planned:number;held:number;uncovered:number;examples:{x:number;y:number}[]}>;
 for(let y=b.y+2;y<b.y+b.h-4;y+=4)for(let x=b.x+2;x<b.x+b.w-4;x+=4){
  const a=at(x,y);
  for(const [dx,dy] of [[4,0],[0,4]]){
   const c=at(x+dx,y+dy),pair=[a,c].sort().join('/');if(a===c||!pairs.has(pair))continue;
   const gx=x+dx/2,gy=y+dy/2,entry=counts[pair]??={sampled:0,planned:0,held:0,uncovered:0,examples:[]};entry.sampled++;
   if(gaps.some(j=>Math.abs(gx-j.at.x)<20&&Math.abs(gy-j.at.y)<20)){entry.held++;continue}
   if(plan.some(p=>gx>=p.rect.x-2&&gx<p.rect.x+p.rect.w+2&&gy>=p.rect.y-2&&gy<p.rect.y+p.rect.h+2)){entry.planned++;continue}
   entry.uncovered++;if(entry.examples.length<8)entry.examples.push({x:gx,y:gy});
  }
 }
 result.scenes[scene]={counts,artGaps:gaps.map(j=>({at:j.at,quadrants:j.quadrants}))};
}
writeFileSync('../evidence/structural-coverage.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.scenes));
