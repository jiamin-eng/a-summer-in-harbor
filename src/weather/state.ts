import {landMaximum} from '../life/land-contract';
import type {Save} from '../story/state';
import type {LifePlot} from '../life/types';
import type {PlantUsesSave} from '../life/plant-uses';
import {validWeatherEcology,type WeatherEcologyState,mintRainCap} from './ecology';
import {crops,validPlots} from '../story/crops';
export type WeatherKind='clear'|'cloudy'|'light-rain';
export type WeatherParameters={slotMinutes:number;rainMinutesPerDay:number};
export const defaultWeatherParameters:Readonly<WeatherParameters>=Object.freeze({slotMinutes:180,rainMinutesPerDay:60});
export const weatherKinds:readonly WeatherKind[]=['clear','cloudy','light-rain','cloudy'];
export const weatherNames:Record<WeatherKind,[string,string]>={clear:['晴','Clear'],cloudy:['阴','Cloudy'],'light-rain':['小雨','Light rain']};
export type WeatherState={schema:1;ruleset:'harbor-weather-v1';parameters:WeatherParameters;activatedAt:number;settledThrough:number;kind:WeatherKind;rainDay:number;water:Record<string,number>};
export type WeatherPatch={weatherV1:WeatherState;weatherEcologyV1?:WeatherEcologyState;mintRecovery?:{recoverAt:number};plots?:Save['plots'];lifePlots?:Record<string,LifePlot>};
const int=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function validWeatherParameters(v:unknown):v is WeatherParameters{return object(v)&&exact(v,['slotMinutes','rainMinutesPerDay'])&&int(v.slotMinutes)&&v.slotMinutes>=60&&v.slotMinutes<=720&&int(v.rainMinutesPerDay)&&v.rainMinutesPerDay<=120}
export function weatherAt(minute:number,parameters:Readonly<WeatherParameters>=defaultWeatherParameters):WeatherKind{
 if(!int(minute)||!validWeatherParameters(parameters))throw Error('INVALID_WEATHER_INPUT');
 const slot=Math.floor((minute-540)/parameters.slotMinutes);return weatherKinds[((slot%4)+4)%4];
}
export function createWeatherState(minute:number,parameters:Readonly<WeatherParameters>=defaultWeatherParameters):WeatherState{
 if(!int(minute)||!validWeatherParameters(parameters))throw Error('INVALID_WEATHER_INPUT');
 return {schema:1,ruleset:'harbor-weather-v1',parameters:{...parameters},activatedAt:minute,settledThrough:minute,kind:weatherAt(minute,parameters),rainDay:Math.floor(minute/1440),water:{}};
}
export function validWeatherState(v:unknown,minute:number,maximumBeds=4):v is WeatherState{
 if(!object(v)||!exact(v,['schema','ruleset','parameters','activatedAt','settledThrough','kind','rainDay','water'])||v.schema!==1||v.ruleset!=='harbor-weather-v1'||!validWeatherParameters(v.parameters)||!int(minute)||!int(v.activatedAt)||!int(v.settledThrough)||v.activatedAt>v.settledThrough||v.settledThrough!==minute||v.kind!==weatherAt(minute,v.parameters)||v.rainDay!==Math.floor(minute/1440)||!object(v.water)||![2,4].includes(maximumBeds)||Object.keys(v.water).length>3+maximumBeds)return false;
 return Object.entries(v.water).every(([id,n])=>/^(garden:crop-bed-[123]|land:life-bed-[1-4])$/.test(id)&&(!id.startsWith('land:')||Number(id.slice(-1))<=maximumBeds)&&int(n)&&n<=v.parameters.rainMinutesPerDay);
}
export function assertWeatherReadable(s:Save){if(s.weatherV1!==undefined&&!validWeatherState(s.weatherV1,s.townMinutes??540,landMaximum(s.landV1)))throw Error('UNSUPPORTED_WEATHER_SAVE');if(s.weatherEcologyV1!==undefined&&!validWeatherEcology(s.weatherEcologyV1,s.townMinutes??540,s.weatherV1))throw Error('UNSUPPORTED_WEATHER_ECOLOGY_SAVE')}
export function weatherForSave(s:Pick<Save,'townMinutes'|'weatherV1'>):WeatherKind{return s.weatherV1?.kind??weatherAt(s.townMinutes??540)}
/** One bounded delta in the original compact confirmation; no full inventory/history. */
export function weatherPatch(before:Save,next:Save):WeatherPatch|undefined{
 if(!next.weatherV1)return undefined;
 const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),lifeBefore=(before as any).lifeV1?.plots,lifeNext=(next as any).lifeV1?.plots;
 const mintBefore=(before as PlantUsesSave).plantUsesV1?.mint,mintNext=(next as PlantUsesSave).plantUsesV1?.mint,mintChanged=!!mintNext&&mintNext.recoverAt!==null&&mintBefore?.recoverAt!==mintNext.recoverAt;
 if(equal(before.weatherV1,next.weatherV1)&&equal(before.weatherEcologyV1,next.weatherEcologyV1)&&equal(before.plots,next.plots)&&equal(lifeBefore,lifeNext)&&!mintChanged)return undefined;
 return {weatherV1:structuredClone(next.weatherV1),...(next.weatherEcologyV1?{weatherEcologyV1:structuredClone(next.weatherEcologyV1)}:{}),...(mintChanged?{mintRecovery:{recoverAt:mintNext!.recoverAt!}}:{}),...(!equal(before.plots,next.plots)?{plots:structuredClone(next.plots)}:{}),...(!equal(lifeBefore,lifeNext)?{lifePlots:structuredClone(lifeNext)}:{})};
}
/** Validate transport deltas before replacing same-bed growth. Never admit new refs. */
export function applyWeatherPatch<T extends {id:string}>(head:T,patch:WeatherPatch|undefined,previous:T):T{
 if(!patch)return head;
 const s=head as unknown as Save,old=previous as any;
 if(!object(patch)||Object.keys(patch).some(k=>!['weatherV1','weatherEcologyV1','mintRecovery','plots','lifePlots'].includes(k))||!validWeatherState(patch.weatherV1,s.townMinutes??540,landMaximum(s.landV1)))throw Error('WEATHER_REPLY_UNCONFIRMED');
 if(old.weatherV1&&(JSON.stringify(old.weatherV1.parameters)!==JSON.stringify(patch.weatherV1.parameters)||old.weatherV1.activatedAt!==patch.weatherV1.activatedAt))throw Error('WEATHER_REPLY_UNCONFIRMED');
 if(!old.weatherV1&&patch.weatherV1.activatedAt!==(old.townMinutes??540))throw Error('WEATHER_REPLY_UNCONFIRMED');
 if((s.townMinutes??540)<(old.townMinutes??540)||old.weatherV1?.rainDay===patch.weatherV1.rainDay&&Object.entries(old.weatherV1.water).some(([id,n])=>(patch.weatherV1.water[id]??0)<(n as number)))throw Error('WEATHER_REPLY_UNCONFIRMED');
 const sameKeys=(a:any,b:any)=>object(a)&&object(b)&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',');
 const grows=(p:any,old:any,max:number)=>JSON.stringify(p)===JSON.stringify(old)||(p&&old&&Number.isSafeInteger(p.grown)&&p.grown>=old.grown&&p.grown<=max&&p.updatedAt===s.townMinutes&&Number.isSafeInteger(p.wetUntil)&&p.wetUntil>=old.wetUntil&&p.wetUntil<=p.updatedAt+720);
 if(patch.plots!==undefined){if(!sameKeys(patch.plots,old.plots)||!validPlots({...s,plots:patch.plots})||Object.entries(patch.plots).some(([id,p])=>!object(p)||!exact(p,['crop','grown','updatedAt','wetUntil'])||p.crop!==old.plots[id].crop||!grows(p,old.plots[id],crops[p.crop].minutes)))throw Error('WEATHER_REPLY_UNCONFIRMED')}
 if(patch.lifePlots!==undefined){if(!sameKeys(patch.lifePlots,old.lifeV1?.plots)||Object.entries(patch.lifePlots).some(([id,p])=>!object(p)||!exact(p,['ref','grown','updatedAt','wetUntil'])||JSON.stringify(p.ref)!==JSON.stringify(old.lifeV1.plots[id].ref)||!grows(p,old.lifeV1.plots[id],4320)))throw Error('WEATHER_REPLY_UNCONFIRMED')}
 const e=patch.weatherEcologyV1,oldE=old.weatherEcologyV1,oldMint=old.plantUsesV1?.mint,mint=(s as PlantUsesSave).plantUsesV1?.mint;
 if(oldE&&!e||e&&(!validWeatherEcology(e,s.townMinutes??540,patch.weatherV1)||oldE&&e.activatedAt!==oldE.activatedAt||!oldE&&e.activatedAt!==(old.townMinutes??540)||oldE?.rainDay===e.rainDay&&e.mintRainUsed<oldE.mintRainUsed))throw Error('WEATHER_REPLY_UNCONFIRMED');
 if(e&&oldE?.rainDay===e.rainDay&&!patch.mintRecovery&&e.mintRainUsed!==oldE.mintRainUsed)throw Error('WEATHER_REPLY_UNCONFIRMED');
 if(patch.mintRecovery!==undefined){const r=patch.mintRecovery,d=oldMint?.recoverAt-r.recoverAt;
  if(!e||!object(r)||!exact(r,['recoverAt'])||!mint||!oldMint||mint.stock!==1||oldMint.stock!==1||!int(r.recoverAt)||r.recoverAt<720||!Number.isSafeInteger(oldMint.recoverAt)||d<0||d>(s.townMinutes??540)-(old.townMinutes??540)||d>mintRainCap*(Math.floor((s.townMinutes??540)/1440)-Math.floor((old.townMinutes??540)/1440)+1)||JSON.stringify({...mint,recoverAt:0})!==JSON.stringify({...oldMint,recoverAt:0})||oldE?.rainDay===e.rainDay&&e.mintRainUsed-oldE.mintRainUsed!==d)throw Error('WEATHER_REPLY_UNCONFIRMED');
 }
 return {...head,weatherV1:patch.weatherV1,...(e?{weatherEcologyV1:e}:{}),...(patch.mintRecovery?{plantUsesV1:{...(s as PlantUsesSave).plantUsesV1,mint:{...mint!,recoverAt:patch.mintRecovery.recoverAt}}}:{}),...(patch.plots!==undefined?{plots:patch.plots}:{}),...(patch.lifePlots!==undefined?{lifeV1:{...old.lifeV1,plots:patch.lifePlots}}:{})};
}
