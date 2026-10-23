import {heavyRainForSave} from './storm';
import type {WeatherState} from './state';
/** Read-only subtype of the pinned heavy-rain calendar. Heavy slots are cycles
 * 1,4,7,10,... from the existing 09:00 epoch; the fourth is cycle10. Count
 * calendar slots, never visits/reloads/activation time. No new save or timer. */
export function typhoonForSave(s:{scene:string;townMinutes?:number;weatherV1?:WeatherState}):boolean{
 if(!['coast','harbor'].includes(s.scene)||!heavyRainForSave(s))return false;
 const minute=s.townMinutes??540,length=s.weatherV1!.parameters.slotMinutes;
 const cycle=Math.floor((minute-540)/(4*length));
 const heavyOrdinal=(cycle-1)/3+1;
 const elapsed=minute-(540+(4*cycle+2)*length);
 return heavyOrdinal%4===0&&elapsed>=0&&elapsed<30;
}
