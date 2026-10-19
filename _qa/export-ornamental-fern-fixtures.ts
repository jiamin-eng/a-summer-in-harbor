import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fernReady,fernStep,fernAtHome,fernQaAssembly} from './ornamental-fern-fixture';
import {fernSlot} from '../src/life/ornamental-fern-config';
const out=resolve(process.argv[2]??'../qa-fern-20261019/fixtures');mkdirSync(out,{recursive:true});
const files:any[]=[],assembly=fernQaAssembly();
function save(name:string,head:any,preparation:string){
 assembly.runtime.assertReadable(head);const path=join(out,name+'.fixture.json');
 writeFileSync(path,JSON.stringify({fixtureSchema:1,synthetic:true,preparation,save:head},null,2)+'\n');
 files.push({name,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),scene:head.scene,locale:head.locale,id:head.id,version:head.version,minute:head.townMinutes,holder:head.ornamentalFernV1?.plant?.holder??null});
}
for(const locale of ['en','zh'] as const){
 let s=await fernReady(locale);save('ready-'+locale,s,'Real authored key/unpack/settle/toolbag commands using synthetic approach positions; no ornamental grant or flags injected.');
 s=await fernStep(s,'read-offer');save('offer-read-'+locale,s,'Real fern:read-offer; no acceptance. Browser must resume and finish the saved offer before showing accept.');
 s=await fernStep(s,'accept');s=await fernAtHome(s);s.position={...fernSlot.approach};save('bag-home-'+locale,s,'Real accepted gift and ordinary travel home, then explicit offline staging at shared slot approach; not browser movement evidence.');
 s=await fernStep(s,'place');save('displayed-home-'+locale,s,'Real fern:place through full public business assembly; cost and weather settled.');
 s=await fernStep(s,'take');save('returned-home-'+locale,s,'Real fern:take; same instance and source, two move costs.');
 save('low-energy-home-'+locale,{...structuredClone(s),energy:3},'Real returned save with explicitly synthetic low-energy=3 for refusal QA.');
}
writeFileSync(join(out,'FIXTURE-MANIFEST.json'),JSON.stringify({synthetic:true,realPlayerData:false,fixtures:files},null,2)+'\n');console.log(JSON.stringify({out,fixtures:files.length}));
