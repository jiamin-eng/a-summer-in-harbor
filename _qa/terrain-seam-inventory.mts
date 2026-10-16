import {mkdirSync,writeFileSync} from 'node:fs';
import {terrainContacts} from '../src/world/terrain-contacts';
import {terrainSeams,terrainJunctions,seamPair} from '../src/world/terrain-seam-plan';

const scenes=['station','harbor','market-bazaar','coast-beach-path','hill','dock','garden','camp','courtyard'];
const report={base:'55c8eabc46fdd11d5f19195c135ef1b5ab2b6f0f',scope:'top-patch visual geometry; no bitmap/pixel acceptance',scenes:{}} as {base:string;scope:string;scenes:Record<string,unknown>};
for(const scene of scenes){
 const pairs:Record<string,{length:number;pieces:number;zones:string[]}>={};
 for(const e of terrainSeams(scene)){
  const key=seamPair(e.negative,e.positive),p=pairs[key]??={length:0,pieces:0,zones:[]};
  p.length+=e.axis==='x'?e.rect.h:e.rect.w;p.pieces++;
  if(!p.zones.includes(e.zone))p.zones.push(e.zone);
 }
 report.scenes[scene]={pairs,contactOverlaysAdmitted:terrainContacts(scene).length,junctions:terrainJunctions(scene).map(({zone,at,materials,quadrants})=>({zone,at,materials,quadrants}))};
}
mkdirSync('../evidence',{recursive:true});
writeFileSync('../evidence/contact-inventory.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.scenes).map(([k,v])=>[k,(v as any).pairs]))));
