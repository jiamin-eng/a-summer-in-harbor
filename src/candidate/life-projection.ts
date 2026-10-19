import type {Save} from '../story/state';
import {battleLocksWorld} from '../story/turn-battle';
export type LifeProjectionHead=import('../life/types').LifeSave;
export type LifeProjectionDTO={schema:1;snapshotVersion:number;snapshotCursor:number;gameMinute:number};
export type LifePresentation<V>={view:V|null;current:boolean;status:'idle'|'loading'|'current'|'error'};
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
/** Matches the fixed B2 lifeView inputs. Snapshot stamps remain the server's original stamps. */
export function lifeProjectionKey(head:LifeProjectionHead){
 const sample=head.animalNotebookV1?.sample,native=head.nativeCrabV1;
 return JSON.stringify(canonical({weather:head.weatherV1??null,weatherEcology:head.weatherEcologyV1??null,minute:head.townMinutes??540,scene:head.scene,position:head.position,known:head.known,relations:head.relations,relationships:head.relationshipsV1??null,relationshipExpansion:head.relationshipExpansionV1??null,relationshipNext:head.relationshipNextV1??null,ornamentalFern:head.ornamentalFernV1??null,flags:head.flags,cash:head.cash,items:head.items,life:head.lifeV1??null,plantUses:(head as LifeProjectionHead&{plantUsesV1?:unknown}).plantUsesV1??null,land:head.landV1??null,nativeCrab:native?{pin:native.pin,observation:native.observation,brief:native.brief,plan:native.plan,page:native.page,sample:native.sample}:null,nativeProofCurrent:!!native?.sample&&native.sample.version===head.version,notebook:head.animalNotebookV1??null,animals:head.animalsV1??null,legacyPlots:head.plots??null,animalProofCurrent:!!sample&&sample.version===head.version,blocked:!!head.activeChallenge||battleLocksWorld(head)}));
}
/** One read in flight, latest requested content wins; harmless motion versions do not cancel reads. */
export function createLifeProjection<V extends LifeProjectionDTO>(read:(head:LifeProjectionHead)=>Promise<V>,changed:()=>void=()=>{}){
 type Desired={head:LifeProjectionHead;context:string;key:string};
 const proofs=new Map<number,{cursor:number;key:string;minute:number}>();
 let desired:Desired|undefined,entry:{context:string;key:string;view:V}|undefined,flight:Promise<void>|undefined,epoch=0,errorKey:string|undefined,unconfirmedVersion:number|undefined;
 const presentation=(target:Desired|undefined):LifePresentation<V>=>{
  const visible=target&&entry?.context===target.context?entry:undefined,current=!!visible&&visible.key===target!.key&&target!.head.version>=visible.view.snapshotVersion&&target!.head.cursor>=visible.view.snapshotCursor;
  return {view:visible?.view??null,current,status:!target?'idle':current?'current':errorKey===target.key?'error':'loading'};
 };
 const present=()=>presentation(desired);
 const pump=()=>{
  if(!desired||flight||present().current||errorKey===desired.key)return;
  const requested=desired,at=epoch;
  const task=Promise.resolve().then(async()=>{try{
   const view=await read(requested.head);if(at!==epoch||!desired||desired.context!==requested.context)return;
   // Only exact versions observed in guarded heads can confirm a concurrent read, including an intermediate ACK.
   const basis=view.snapshotVersion===requested.head.version?{cursor:requested.head.cursor,key:requested.key,minute:requested.head.townMinutes??540}:proofs.get(view.snapshotVersion);
   if(!basis&&view.schema===1&&Number.isSafeInteger(view.snapshotVersion)&&view.snapshotVersion>requested.head.version)unconfirmedVersion=view.snapshotVersion;
   const animalStamp=(view as LifeProjectionDTO&{animals?:{snapshotVersion:number}}).animals?.snapshotVersion;
   if(view.schema!==1||!basis||basis.key!==requested.key||view.snapshotCursor!==basis.cursor||view.gameMinute!==basis.minute||animalStamp!==undefined&&animalStamp!==view.snapshotVersion)throw Error('LIFE_SNAPSHOT_UNCONFIRMED');
   entry={context:requested.context,key:requested.key,view};errorKey=undefined;unconfirmedVersion=undefined;
  }catch{if(at===epoch&&desired?.context===requested.context&&desired.key===requested.key)errorKey=requested.key}
  finally{if(flight===task){flight=undefined;if(desired){changed();pump()}}}});
  flight=task;changed();
 };
 return {
  update(head:LifeProjectionHead|null,scope:string,assembly:string,enabled=true){
   const context=head&&enabled?JSON.stringify([scope,head.id,assembly]):undefined;
   if(context!==desired?.context){epoch++;entry=undefined;errorKey=undefined;unconfirmedVersion=undefined;proofs.clear()}
   const key=head?lifeProjectionKey(head):undefined;
   desired=context&&head?{head,context,key:desired&&desired.key===key?desired.key:key!}:undefined;
   if(desired){proofs.set(head!.version,{cursor:head!.cursor,key:desired.key,minute:head!.townMinutes??540});while(proofs.size>64)proofs.delete(proofs.keys().next().value!)}
   if(head&&unconfirmedVersion!==undefined&&head.version>=unconfirmedVersion){errorKey=undefined;unconfirmedVersion=undefined}
   if(errorKey&&errorKey!==desired?.key)errorKey=undefined;changed();pump();return present();
  },
  present,forHead(head:LifeProjectionHead|null,scope:string,assembly:string,enabled=true){return presentation(head&&enabled?{head,context:JSON.stringify([scope,head.id,assembly]),key:lifeProjectionKey(head)}:undefined)},retry(){errorKey=undefined;pump()},
  async settled(){while(flight)await flight},
  dispose(){epoch++;desired=undefined;entry=undefined;errorKey=undefined;unconfirmedVersion=undefined;proofs.clear()},
 };
}
