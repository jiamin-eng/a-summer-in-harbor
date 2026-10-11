import type {Room,Words} from './data';
export const gatheringResidents=['mara','avery','samira'] as const;
export type NeighborChapter={schema:1;rules:'neighbor-chapter-v1';roster:'harbor22-v1'|'harbor23-priest-v2';invited:string[];gatheredAt?:number;allKnownAt?:number;party?:{scene:'coast'|'chapel';people:string[];chatted:string[];startedAt:number;first:boolean};lastParty?:{scene:'coast'|'chapel';people:string[];endedAt:number}};
export type PartyContext={scene?:string;townMinutes?:number;neighborChapterV1?:NeighborChapter;neighborPartyEnabled?:boolean};
/** A paused invitation keeps its progress; ordinary routines resume elsewhere/night. */
export function neighborPartyActive(s:PartyContext){const p=s.neighborChapterV1?.party,m=(s.townMinutes??540)%1440;return s.neighborPartyEnabled??!!(p&&p.scene===s.scene&&m>=360&&m<1260)}
export const gatheringVerbs=['neighbor-select:mara','neighbor-select:avery','neighbor-select:samira','neighbor-start','neighbor-move-inside','neighbor-finish','neighbor-recall'];
export function addNeighborGathering(rooms:Record<string,Room>){
 for(const scene of ['coast','chapel'] as const){
  const at=scene==='coast'?{x:600,y:560}:{x:550,y:515};
  rooms[scene].entities.push({id:'neighbor-gathering',label:['一起坐坐的地方','A place to sit together'],kind:'object',at,approach:{x:at.x-8,y:at.y+34},actions:[...gatheringVerbs]});
  gatheringResidents.forEach((person,i)=>{const existing=rooms[scene].entities.find(e=>e.person===person);if(existing){existing.gatheringRole='routine';return}const foot=scene==='coast'?{x:550+i*50,y:500}:{x:430+i*50,y:420};rooms[scene].entities.push({id:'gathering-'+person,person,gatheringRole:'guest',label:['来小聚的邻居','Neighbor at the gathering'] as Words,kind:'person',at:foot,approach:{x:foot.x-8,y:foot.y+42}})});
 }
}
