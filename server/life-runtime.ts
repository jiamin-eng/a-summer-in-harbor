import type {createRuntime} from './runtime';
import type {Action,Save} from '../src/story/state';
import type {Admission,Command,LifeSave} from '../src/life/types';
import {ContentRegistry} from '../src/life/registry';
import {assertLifeReadable,reconcileAuthored} from '../src/life/save';
import {applyLife} from '../src/life/rules';
import {applyLand,landPoint,assertLandReadable,landWorld} from '../src/life/land';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {walkable} from '../src/engine/world';

type Base=ReturnType<typeof createRuntime>;
export type LifeHost={admit:(save:Readonly<LifeSave>,action:Readonly<Action>,command:Readonly<Command>)=>Admission|Promise<Admission>};
const fields:Record<Command['verb'],string[]>={
 'permit-land':['verb','region'],cultivate:['verb','region','at'],
 'buy-seed':['verb','ref'],plant:['verb','ref','plot'],water:['verb','plot'],harvest:['verb','plot'],sell:['verb','ref'],'save-seed':['verb','ref','harvestBatch'],
 'accept-order':['verb','ref'],'deliver-order':['verb'],'close-order':['verb'],'share-dani':['verb'],'observe-animal':['verb','animal','behavior'],'display-gift':['verb','slot','gift'],'news-memento':['verb','edition'],
};
export function parseLifeCommand(a:Action):Command{
 const p=a.payload as any,c=p?.command;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).join(',')!=='command'||!c||typeof c!=='object'||Array.isArray(c)||!Object.hasOwn(fields,c.verb))throw Error('INVALID_LIFE_COMMAND');
 const allowed=fields[c.verb as Command['verb']];if(a.action!=='life:'+c.verb||Object.keys(c).some(k=>!allowed.includes(k))||allowed.some(k=>!['gift','harvestBatch'].includes(k)&&c[k]===undefined))throw Error('INVALID_LIFE_COMMAND');
 for(const k of ['plot','animal','behavior','slot','gift','edition','region','harvestBatch'])if(c[k]!==undefined&&(typeof c[k]!=='string'||c[k].length>80||!c[k]))throw Error('INVALID_LIFE_COMMAND');
 if(c.ref!==undefined&&(!c.ref||typeof c.ref!=='object'||Array.isArray(c.ref)||Object.keys(c.ref).sort().join(',')!=='capability,hash,id,revision'))throw Error('INVALID_LIFE_COMMAND');
 if(c.verb==='observe-animal'&&!['sun-rest','sleep'].includes(c.behavior))throw Error('INVALID_LIFE_COMMAND');
 if(c.at!==undefined&&!landPoint(c.at))throw Error('INVALID_LIFE_COMMAND');
 return structuredClone(c);
}
/** Requires an explicit trusted host. The fixed candidate adds bag, land and
 * admitted crop routes; animal/news/resident collection premises remain closed. */
export function createLifeRuntime(base:Base,registry:ContentRegistry,host:LifeHost){
 if(typeof host?.admit!=='function')throw Error('LIFE_HOST_REQUIRED');
 return {
  ...base,upgrade:(s:LifeSave)=>s,
  assertReadable(s:LifeSave){base.assertReadable(s);assertLifeReadable(s,registry);assertLandReadable(s);this.position(s,s.position)},
  position(s:LifeSave,p:{x:number;y:number}){base.position(s,p);if(!walkable(landWorld(dynamicWorld(s.flags,false),s.landV1),s.scene,p))throw Error('INVALID_POSITION');return {...p}},
  validateAction(a:Action){base.validateAction(a);if(a.action.startsWith('life:'))parseLifeCommand(a)},
  async prepare(s:LifeSave,a:Action,cancel?:unknown,context?:{owner:string}){
   if(!a.action.startsWith('life:')){
    assertLandReadable(s);this.position(s,a.position);assertLifeReadable(s,registry);const result=await base.prepare(s,a,cancel,context);this.position(result.head,result.head.position);return {...result,head:reconcileAuthored(s,result.head,registry,a.action_id)};
   }
   assertLandReadable(s);this.position(s,a.position);if(a.scene!==s.scene)throw Error('SCENE_MISMATCH');const command=parseLifeCommand(a);
   // Host is a server dependency, never an optional payload field.
   const admission=await host.admit(structuredClone(s),structuredClone(a),structuredClone(command));
   if(!admission||admission.scene!==s.scene||admission.target!==a.target)throw Error('LIFE_ADMISSION_MISMATCH');
   const intent={actionId:a.action_id,expectedVersion:a.expected_version,command};
   const result=command.verb==='permit-land'||command.verb==='cultivate'?applyLand(s,intent,admission):applyLife(s,intent,registry,admission);
   result.head.position={...a.position};result.head.version=s.version+1;result.head.cursor=s.cursor+1;
   result.head.history.push({id:a.action_id,kind:'action',...(admission.resident?{person:admission.resident}:{}),text:result.text});result.head.history=result.head.history.slice(-500);
   return {...result,kind:'life:'+command.verb,accepted:true,actionId:a.action};
  },
  preserveConcurrent(next:Save,current:Save){return base.preserveConcurrent(next,current)},
 };
}
