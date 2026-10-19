import {randomUUID} from 'node:crypto';
import {createExplorationAssembly} from '../server/exploration-assembly';
import {createReviewedAnimalLife} from '../server/reviewed-animal-life';
import {withBasilPlantUses} from '../server/plant-basil';
import {withWildMint} from '../server/wild-mint';
import {rooms,entityAt} from '../src/world/data';
import type {Save,Action} from '../src/story/state';
import {fernSlot,type OrnamentalFernVerb} from '../src/life/ornamental-fern-config';

/** Mirrors public business assembly with all external generation forbidden. */
export const fernQaAssembly=(options:any={})=>createExplorationAssembly({afterRain:true,weather:{enabled:true,ecology:true},crabEnabled:true,createLife:createReviewedAnimalLife,resolveDialogue:async()=>{throw Error('QA_MODEL_DISABLED')},decorateLife:(a:any)=>withWildMint(withBasilPlantUses(a),{enabled:true,newStarts:true}),...options});
export function fernCommand(s:Save,verb:OrnamentalFernVerb):Action{
 const giving=verb==='read-offer'||verb==='accept',e=giving?rooms[s.scene].entities.find(e=>e.person==='mara')!:entityAt('home',fernSlot.id)!;
 return {action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{...e.approach},target:e.id,action:'fern:'+verb};
}
export async function fernStep(s:Save,verb:OrnamentalFernVerb,assembly=fernQaAssembly()):Promise<Save>{return (await assembly.runtime.prepare(s,fernCommand(s,verb))).head}
/** Prerequisites are real authored commands. Only each command's approach
 * position is synthetic, using the existing non-motion test path. No player
 * data or relationship stage is injected, and no browser playthrough claimed. */
export async function fernReady(locale:'en'|'zh'='en',id=randomUUID()):Promise<Save>{
 const assembly=fernQaAssembly();let s=assembly.runtime.initial(locale,id);
 const action=async(target:string,verb:string)=>{const e=entityAt(s.scene,target)!;s=(await assembly.runtime.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{...e.approach},target,action:verb})).head};
 const travel=async(scene:string)=>action(rooms[s.scene].entities.find(e=>e.destination===scene)!.id,'travel');
 await action('mara','introduce');await action('mara','talk:key');await travel('home');await action('bed','unpack');await travel('station');await action('mara','talk:settle');await travel('cafe');await action('theo','introduce');await action('theo','talk:bag');await travel('station');await action('mara','talk:return-bag');
 assembly.runtime.assertReadable(s);return s;
}
export async function fernInBag(locale:'en'|'zh'='en'){
 let s=await fernReady(locale);s=await fernStep(s,'read-offer');return fernStep(s,'accept');
}
export async function fernAtHome(s:Save,assembly=fernQaAssembly()):Promise<Save>{
 const e=rooms[s.scene].entities.find(e=>e.destination==='home')!;
 return (await assembly.runtime.prepare(s,{action_id:randomUUID(),expected_version:s.version,scene:s.scene,position:{...e.approach},target:e.id,action:'travel'})).head;
}
