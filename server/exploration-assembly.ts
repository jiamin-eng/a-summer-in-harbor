import {withOrnamentalFern} from './ornamental-fern';
import {createAfterRainIntegration} from './after-rain-runtime';
import {createWeatherSettlement,withWeatherRuntime,type WeatherOptions} from './weather';
import {nativeCrabCollision} from '../src/animals/native-crab-game';
import type {Save} from '../src/story/state';
import {dynamicWorld} from '../src/dynamic-assets/layout';
import {landWorld} from '../src/life/land';
import {createRuntime} from './runtime';
import {createHarborLife} from './life-assembly';
import {createMovingClock,withMovingClock} from './candidate-clock';
import {withCompactMotion} from './candidate-motion-authority';
import {createActivePlayClock,withActivePlayRuntime} from './active-play-clock';
import {withActivePlayAuthority} from './active-play-authority';

/** Published owner assembly. The caller's final
 * news wrapper is installed before the outer time settlement, and the account
 * service supplies its guarded transaction store to both compact channels. */
export function createExplorationAssembly({resolveDialogue,notes,now=Date.now,boot,defaultRate=4000,fishingNewStarts,plantStarts=true,ornamentalFernStarts=plantStarts,crabEnabled=false,observeWait,motionWait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms)),createLife=createHarborLife,decorateLife=(r:any)=>r,decorateRuntime=(r:any)=>({runtime:r}),initial,weather:weatherOptions={} as WeatherOptions,afterRain=false}:any={}){
 const motion=createMovingClock({now,boot,worldForSave:(s:Save)=>{const w=landWorld(dynamicWorld(s.flags,!!s.dynamicAssetRooms),s.landV1),b=nativeCrabCollision(s);return b.length?{...w,scenes:{...w.scenes,[s.scene]:{...w.scenes[s.scene],obstacles:[...w.scenes[s.scene].obstacles,...b]}}}:w}});
 const afterRainIntegration=afterRain===true?createAfterRainIntegration():undefined;
 const base=createRuntime(resolveDialogue,notes,motion,{fishingNewStarts,afterRainResolve:afterRainIntegration?.resolve});
 const life=withOrnamentalFern(decorateLife(createLife(initial?{...base,initial}:base,plantStarts,{enabled:crabEnabled,now,wait:observeWait})),{newStarts:ornamentalFernStarts});
 const decorated=decorateRuntime(life.runtime);
 const weather=createWeatherSettlement(weatherOptions);
 const weatherRuntime=withWeatherRuntime(decorated.runtime,weather);
 const originalPlay=createActivePlayClock({now,boot,defaultRate});
 const play={...originalPlay,apply:(s:Save,a:any)=>{const next=originalPlay.apply(s,a);life.advanceForeground(s,next);weather.settle(s,next);return next},business:(s:Save,a:any)=>{const next=originalPlay.business(s,a);life.advanceForeground(s,next);weather.settle(s,next);return next}};
 const runtime=withActivePlayRuntime(withMovingClock(weatherRuntime,motion),play);
 return {...life,...decorated,runtime,motion,play,
  ...(afterRainIntegration?{lifeProject:(s:Save)=>({...life.lifeProject(s),afterRain:afterRainIntegration.project(s)})}:{}),
  decorateAuthority:(authority:any,guardedStore:any,finalRuntime=runtime)=>withActivePlayAuthority(withCompactMotion(authority,guardedStore,finalRuntime,motion,now,play,motionWait),guardedStore,finalRuntime,play,now),
 };
}
