/** Controlled local scene/day fixture. Every relationship fact uses original actions. */
import {randomUUID} from 'node:crypto';
import {initial,applyAction,type Save,type Action} from '../src/story/state';
import {rooms} from '../src/world/data';
export function localAt(s:Save,scene:string,minute=s.townMinutes??540):Save{return {...structuredClone(s),scene,townMinutes:minute,position:{...rooms[scene].spawn}}}
export function neighborCommand(s:Save,target:string,action:string):Action{const e=rooms[s.scene].entities.find(e=>e.id===target)!;return {action_id:randomUUID(),expected_version:s.version,scene:s.scene,target,action,position:{...e.approach}}}
export function neighborStep(s:Save,target:string,action:string){return applyAction(s,neighborCommand(s,target,action)).head}
export function neighborReady():Save{
 let s=initial('en','synthetic-neighbor-'+randomUUID());s.flags=['key','unpacked','bag-returned','chapel:visited'];s.visited=['station','market','coast','chapel'];
 for(const [p,scene] of [['mara','station'],['avery','station'],['samira','market'],['theo','cafe']]){
  s=localAt(s,scene);s=neighborStep(s,p,'introduce');if(p!=='theo'){s=neighborStep(s,p,'talk:rg-greet');s=neighborStep(s,p,'talk:rg-personal')}
 }
 for(const [p,scene,observeScene,target] of [['mara','station','',''],['avery','station','camp','old-map'],['samira','market','weather','logbook']]){
  s=localAt(s,scene,1980);s=neighborStep(s,p,'talk:rg-greet');
  if(p!=='mara'){s=neighborStep(s,p,'talk:rg-request');s=localAt(s,observeScene,1980);s=neighborStep(s,target,'relationship-observe:'+p);s=localAt(s,scene,1980);s=neighborStep(s,p,'talk:rg-fulfill')}
 }
 return localAt(s,'chapel',1980);
}
