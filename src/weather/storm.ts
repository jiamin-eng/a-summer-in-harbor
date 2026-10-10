import {validWeatherState,type WeatherState} from './state';
/** Presentation subtype only: the existing weather pin and committed minute
 * remain authoritative. No new enum, save field, yield, or time settlement. */
export function rainProfileForSave(s:{townMinutes?:number;weatherV1?:WeatherState}):'light'|'heavy'|'storm'{
 const minute=s.townMinutes??540,pin=s.weatherV1;
 if(!pin||!validWeatherState(pin,minute)||pin.kind!=='light-rain')return 'light';
 const cycle=Math.floor((minute-540)/(pin.parameters.slotMinutes*4));
 return cycle<0?'light':(['light','heavy','storm'] as const)[cycle%3];
}
export const stormForSave=(s:{townMinutes?:number;weatherV1?:WeatherState})=>rainProfileForSave(s)==='storm';
export const heavyRainForSave=(s:{townMinutes?:number;weatherV1?:WeatherState})=>rainProfileForSave(s)==='heavy';
export type StormFrame={gust:boolean;flash:number};
type Clock={after:(fn:()=>void,ms:number)=>unknown;cancel:(id:unknown)=>void};
/** At most one six-second presentation timer. Teardown cancels delayed audio;
 * recreating the sequence never catches up missed pulses. */
export function startStormSequence(clock:Clock,frame:(f:StormFrame)=>void,thunder:()=>void,cancelThunder:()=>void,flashes:boolean){
 let disposed=false,tick=0,timer:unknown;
 const next=()=>{if(disposed)return;tick++;const pulse=tick%4===1;frame({gust:tick%2===1,flash:flashes&&pulse?tick:0});if(pulse)thunder();timer=clock.after(next,6000)};
 timer=clock.after(next,6000);
 return ()=>{disposed=true;clock.cancel(timer);cancelThunder()};
}
