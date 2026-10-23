import {applyWeatherPatch,type WeatherPatch} from '../weather/state';
import {validNativeCrabField} from '../animals/native-crab-game';
export type ActivePlayRate=2000|4000;
export type ActivePlayClock={schema:1;millisecondsPerMinute:ActivePlayRate;remainderMs:number;lease?:{id:string;client:string;boot:string;sequence:number;lastAt:number};transport?:{last:{digest:string;ack:ActivePlayAck}}};
export type ActivePlayAck={schema:1;channel:'active-play';id:string;mapVersion:1;baseVersion:number;version:number;cursor:number;ordinal:number;actionId:string;token:string;fields:{weather?:WeatherPatch;nativeCrabV1?:import('../animals/native-crab-game').NativeCrabSave;townMinutes:number;awakeMinutes:number;energy:number;clock:Omit<ActivePlayClock,'transport'>;npcLoopV1?:import('../npc/town').NpcTownState}};
export const activePlayActionId=(id:string,ordinal:number)=>`play-${id}-${ordinal}`;
export function confirmActivePlay(ack:ActivePlayAck,id:string,a:{action_id:string;expected_version:number;action:string;payload?:unknown}){
 const p=a.payload as any,c=ack?.fields?.clock,l=c?.lease;
 if(ack?.schema!==1||ack.channel!=='active-play'||ack.id!==id||ack.mapVersion!==1||ack.actionId!==a.action_id||ack.ordinal!==p?.ordinal||ack.baseVersion!==a.expected_version||ack.version!==a.expected_version+1||!Number.isSafeInteger(ack.cursor)||ack.cursor<1||typeof ack.token!=='string'||ack.token.length!==36||!Number.isSafeInteger(ack.fields?.townMinutes)||ack.fields.townMinutes<0||!Number.isSafeInteger(ack.fields?.awakeMinutes)||ack.fields.awakeMinutes<0||!Number.isFinite(ack.fields?.energy)||!c||c.schema!==1||![2000,4000].includes(c.millisecondsPerMinute)||!Number.isSafeInteger(c.remainderMs)||c.remainderMs<0||c.remainderMs>=c.millisecondsPerMinute||'transport' in c||l&&(!Number.isSafeInteger(l.sequence)||typeof l.id!=='string'||l.client!==p.client||typeof l.boot!=='string'||!Number.isSafeInteger(l.lastAt))||a.action==='candidate-active-pause'&&l||a.action!=='candidate-active-pause'&&!l)throw Error('ACTIVE_REPLY_UNCONFIRMED');
 if(!validNativeCrabField(ack.fields.nativeCrabV1,ack.version,ack.fields.townMinutes))throw Error('ACTIVE_REPLY_UNCONFIRMED');
}
export function applyActivePlayAck<T extends {id:string;mapVersion:1;version:number;cursor:number;activePlayClock?:ActivePlayClock}>(head:T,ack:ActivePlayAck):T{
 if(ack.id!==head.id||ack.mapVersion!==head.mapVersion||ack.baseVersion!==head.version||ack.version!==head.version+1)throw Error('ACTIVE_HEAD_RESYNC');
 const {clock,weather,...fields}=ack.fields;return applyWeatherPatch({...head,...fields,version:ack.version,cursor:ack.cursor,activePlayClock:{...clock,transport:{last:{digest:'',ack}}}},weather,head);
}
