import {entrySpan} from '../account-link/entry-timing';
import {rememberReply,draftKey} from './dialogue-reading';
import {getGameApiBase} from '../game-id';import type {Save,Action} from './state';import type {Locale} from '../world/data';
import {identitySnapshot,identityFetch,enableAccountMode} from '../account-link/transport';
import {recordBootstrapFailure,clearBootstrapFailure} from '../account-link/entry-diagnostics';
import {applyMotionAck,motionActionId,type MotionAck} from '../candidate/clock-types';
import {applyActivePlayAck,confirmActivePlay,activePlayActionId,type ActivePlayAck} from '../candidate/active-play-types';
import {activePlayActionFence} from '../candidate/exploration-flush';
import {resolvedMotionFailure} from '../candidate/motion-errors';
const storage=()=>window.alteruLocalStorage;
type Scope=ReturnType<typeof identitySnapshot>;
const key=(name:string,s:Scope)=>s.account?`harbor-account:${encodeURIComponent(s.scope)}:${name}`:name;
const pendingKey=(s:Scope,id=bound?.scope===s.scope?bound.id:'unselected')=>key('harbor-pending-v2:'+id,s);
const resolvedFailure=(e:any)=>{if(e.status>=500||[401,408,425,429].includes(e.status)||/^(SERVICE_UNAVAILABLE|REQUEST_FAILED|MODEL_CALL_PENDING_OR_INTERRUPTED|E[A-Z0-9]+|[0-9]{2}[0-9A-Z]{3})$/.test(e.message??''))return false;return e.terminal===true||(e.terminal!==false&&e.status>=400&&e.status<500)};
function confirmMotion(ack:MotionAck,id:string,a:Action){const c=ack?.fields?.clock,p=a.payload as any;
 if(ack?.schema!==1||ack.id!==id||ack.mapVersion!==1||ack.actionId!==a.action_id||ack.ordinal!==p.ordinal||ack.baseVersion!==a.expected_version||ack.version!==a.expected_version+1||!Number.isSafeInteger(ack.cursor)||ack.cursor<1||typeof ack.token!=='string'||ack.token.length!==36||typeof ack.fields?.scene!=='string'||!Number.isFinite(ack.fields?.position?.x)||!Number.isFinite(ack.fields?.position?.y)||!Number.isFinite(ack.fields?.energy)||!Array.isArray(ack.fields?.visited)||!c||c.version!==2||![2000,4000].includes(c.millisecondsPerMinute)||!Number.isSafeInteger(c.remainderMs)||c.remainderMs<0||c.remainderMs>=c.millisecondsPerMinute||!c.lease||!Number.isSafeInteger(c.lease.sequence)||'transport' in c)throw Error('MOTION_REPLY_UNCONFIRMED');
 const play=ack.fields.play,l=play?.lease,f=p.foreground;
 if(f?(!play||play.schema!==1||![2000,4000].includes(play.millisecondsPerMinute)||!Number.isSafeInteger(play.remainderMs)||play.remainderMs<0||play.remainderMs>=play.millisecondsPerMinute||'transport' in play||!l||l.client!==f.client||l.id!==f.lease||l.sequence!==f.sequence||!Number.isSafeInteger(l.lastAt)||typeof l.boot!=='string'):!!play)throw Error('MOTION_REPLY_UNCONFIRMED');
}
export const hasPendingAction=()=>!!storage().getItem(pendingKey(identitySnapshot()));
async function request(path:string,body?:unknown,s=identitySnapshot()){
 if(!s.account)throw Error('PLATFORM_LOGIN_REQUIRED');
 if(!/^[1-9][0-9]{0,19}$/.test(s.account))throw Error('INVALID_SHELL_IDENTITY');
 const r=await identityFetch(getGameApiBase()+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'X-Harbor-Land':'2','X-Harbor-Dynamic-Assets':'1',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})},s);const data=await r.json();s.assert();if(!r.ok)throw Object.assign(Error(data.error??'REQUEST_FAILED'),{status:r.status,terminal:data.terminal,retryAfterMs:data.retryAfterMs});return data;
}
export type JourneyChoice={browserClaimed?:boolean;journeys:{id:string;version:number;scene:string;updated?:number}[];legacy:{id:string;version:number;scene:string;updated?:number}[]};
let choice:{scope:string;data:JourneyChoice;management?:boolean}|undefined;let bound:{scope:string;id:string}|undefined;
export function connectionChoice(){const s=identitySnapshot();return choice?.scope===s.scope?choice.data:undefined}
const bind=(s:Scope,head:Save)=>{s.assert();bound={scope:s.scope,id:head.id};return head};
function requireBound(head:Save,s:Scope){s.assert();if(bound?.scope!==s.scope||bound.id!==head.id)throw Error('IDENTITY_CHANGED')}
/** Read-only entry: no guest saves, enrollment, legacy claim or automatic play. */
export function assertCurrentJourney(head:Save){requireBound(head,identitySnapshot())}
export async function readEntryDirectory():Promise<JourneyChoice>{
 const s=identitySnapshot();
 const boot=await entrySpan('bootstrap',()=>request('/bootstrap',{},s)).then(value=>{clearBootstrapFailure();return value},error=>{recordBootstrapFailure(error);throw error});enableAccountMode(boot.mode);s.assert();
 const journeys=await entrySpan('session-directory',()=>request('/sessions',undefined,s)),data={journeys,legacy:[]};
 s.assert();choice={scope:s.scope,data};return data;
}
export async function connect(locale:Locale,selectedId?:string):Promise<Save>{
 const directory=await readEntryDirectory(),s=identitySnapshot();
 // The server orders by actual save activity. A browser pointer is not evidence
 // of the most recently played journey. Reload/switch may explicitly keep one.
 const id=selectedId??directory.journeys[0]?.id;
 if(!id)throw Error('JOURNEY_EMPTY');
 if(!directory.journeys.some(j=>j.id===id))throw Error('JOURNEY_NOT_FOUND');
 s.assert();storage().setItem(key('harbor-journey',s),id);choice=undefined;
 // Preserve historical pending envelopes by journey; never submit one as another account.
 const oldKey=key('harbor-pending-v1',s),old=storage().getItem(oldKey);if(old&&JSON.parse(old).id===id&&!storage().getItem(pendingKey(s,id!))){storage().setItem(pendingKey(s,id!),old);storage().removeItem(oldKey)}
 const pending=storage().getItem(pendingKey(s,id!));if(pending){const p=JSON.parse(pending);if(p.id===id){try{const recovered=await request('/sessions/'+id+(p.channel==='motion'?'/motion':p.channel==='active-play'?'/active-play':'/action'),p.action,s);if(p.channel==='motion')confirmMotion(recovered,id!,p.action);if(p.channel==='active-play')confirmActivePlay(recovered,id!,p.action);const entry=recovered.head?.history.find((h:{id:string})=>h.id===p.action.action_id);if(entry){rememberReply(storage(),recovered.head,entry,locale);if(entry.person&&entry.question&&storage().getItem(draftKey(id!,entry.person))?.trim()===entry.question)storage().removeItem(draftKey(id!,entry.person))};s.assert();storage().removeItem(pendingKey(s,id!))}catch(e:any){s.assert();if(['motion','active-play'].includes(p.channel)?resolvedMotionFailure(e):resolvedFailure(e))storage().removeItem(pendingKey(s,id!));else throw e}}}
 return bind(s,await entrySpan('session-get',()=>request('/sessions/'+id,undefined,s)));
}
export async function chooseJourney(locale:Locale,option:{kind:'existing'|'claim'|'new';id?:string;confirmed?:boolean}):Promise<Save>{
 const s=identitySnapshot(),c=connectionChoice();
 if(!s.account)throw Error('PLATFORM_LOGIN_REQUIRED');
 if(option.kind==='claim')throw Error('LEGACY_CLAIM_CLOSED');
 if(!c)throw Error('JOURNEY_SELECTION_REQUIRED');
 if(hasPendingAction())throw Error('PENDING_ACTION');let id=option.id;
 if(option.kind==='new'){
  const k=key('harbor-choice-enroll',s);let enrollment=storage().getItem(k);
  // A full directory can still recover the same uncertain enrollment request.
  if(c.journeys.length>=100&&!enrollment)throw Error('SESSION_LIMIT');
  if(!enrollment){enrollment=crypto.randomUUID();storage().setItem(k,enrollment)}
  id=(await request('/sessions',{enrollment_id:enrollment,locale},s)).id;s.assert();
 }else if(!c.journeys.some(j=>j.id===id))throw Error('JOURNEY_NOT_FOUND');
 s.assert();storage().setItem(key('harbor-journey',s),id!);choice=undefined;
 const head=await connect(locale,id);if(option.kind==='new')storage().removeItem(key('harbor-choice-enroll',s));return head;
}
/** Explicit normal-play entry. A directory read neither claims nor creates a journey. */
export async function readJourneyDirectory(head:Save):Promise<JourneyChoice>{
 const s=identitySnapshot();requireBound(head,s);if(hasPendingAction())throw Error('PENDING_ACTION');
 const journeys=await entrySpan('session-directory',()=>request('/sessions',undefined,s)),legacy:JourneyChoice['legacy']=[];
 requireBound(head,s);const data={journeys,legacy};choice={scope:s.scope,data,management:true};return data;
}
export async function send(head:Save,a:Action):Promise<{head:Save;text:[string,string]}>{
 const s=identitySnapshot();requireBound(head,s);const pending=pendingKey(s,head.id);
 if(head.activePlayClock)a={...a,activePlay:activePlayActionFence(head)??{client:activePlayClientId(),activeMs:Math.min(3000,Math.max(0,Date.now()-(head.activePlayClock.lease?.lastAt??Date.now()))),...(head.activePlayClock.lease?{lease:head.activePlayClock.lease.id}:{})}};
 const work=async()=>{requireBound(head,s);if(storage().getItem(pending))throw Error('PENDING_ACTION');storage().setItem(pending,JSON.stringify({id:head.id,action:a}));
  try{const result=await request('/sessions/'+head.id+'/action',a,s);requireBound(head,s);const entry=result.head.history.find((h:{id:string})=>h.id===a.action_id);if(entry)rememberReply(storage(),result.head,entry,(a.payload as {locale?:Locale})?.locale??head.locale);s.assert();storage().removeItem(pending);const latest=await request('/sessions/'+head.id,undefined,s);requireBound(head,s);return {...result,head:bind(s,latest)}}catch(e:any){s.assert();if(resolvedFailure(e))storage().removeItem(pending);throw e}
 };return navigator.locks?navigator.locks.request('harbor-authority-writer:'+s.scope,work):work();
}
export async function checkpoint(head:Save,position:{x:number;y:number}){const s=identitySnapshot();requireBound(head,s);if(storage().getItem(pendingKey(s,head.id)))return;await request('/sessions/'+head.id+'/checkpoint',{expected_version:head.version,sceneId:head.scene,position},s)}
/** New channel shares the original single persistent pending and identity-scoped writer lock. Old envelopes still recover via /action. */
export async function candidateMotion(head:Save,action:string,position:Save['position'],payload:unknown){
 const a:Action={action_id:crypto.randomUUID(),expected_version:head.version,scene:head.scene,position,target:'',action,payload};
 if(action==='candidate-clock-enable')return send(head,a);
 const s=identitySnapshot();requireBound(head,s);const pending=pendingKey(s,head.id);const last=head.movingClock?.transport?.last.ack;
 a.payload={...(payload as object),transport:1,ordinal:(last?.ordinal??0)+1,previous:last?.token??''};
 a.action_id=motionActionId(head.id,(last?.ordinal??0)+1);
 const work=async()=>{requireBound(head,s);if(storage().getItem(pending))throw Error('PENDING_ACTION');storage().setItem(pending,JSON.stringify({id:head.id,channel:'motion',action:a}));
  try{const ack:MotionAck=await request('/sessions/'+head.id+'/motion',a,s);requireBound(head,s);confirmMotion(ack,head.id,a);const next=applyMotionAck(head,ack);requireBound(head,s);storage().removeItem(pending);return {head:bind(s,next),text:['移动进度已保存。','Walking progress saved.'] as [string,string]}}
  catch(e:any){s.assert();if(resolvedMotionFailure(e))storage().removeItem(pending);throw e}
 };return navigator.locks?navigator.locks.request('harbor-authority-writer:'+s.scope,work):work();
}
export type Usage={room?:{remaining:number};resetAt:number;dialogue:{remaining:number;maximum:number;retryAt:number|null;pending:number}};
export async function readUsage():Promise<Usage>{return request('/usage')}
export type NoteMedia={status:string;room:string;retryable?:boolean;url?:string};
export async function ensureNoteImage(id:string,room:string):Promise<NoteMedia>{return request('/sessions/'+id+'/media/'+room+'/prepare',{})}
export async function loadNoteImage(id:string,room:string){const s=identitySnapshot();const r=await identityFetch(getGameApiBase()+'/api/sessions/'+id+'/media/'+room,{},s);if(!r.ok)throw Error('MEDIA_UNAVAILABLE');const blob=await r.blob();s.assert();return URL.createObjectURL(blob)}

export async function readLife(head:Save):Promise<import('../ui/LifeBag').LifeView>{const scope=identitySnapshot();requireBound(head,scope);return request('/sessions/'+head.id+'/life',undefined,scope)}
export async function readLandPreview(head:Save,region:string,at?:{x:number;y:number}):Promise<import('../life/land').LandPreview>{const scope=identitySnapshot();requireBound(head,scope);const query=new URLSearchParams({region,...(at?{x:String(at.x),y:String(at.y)}:{})});return request('/sessions/'+head.id+'/land-preview?'+query,undefined,scope)}
let playClient:string|undefined;
export const activePlayClientId=()=>playClient??(playClient=crypto.randomUUID());
export async function candidateActivePlay(head:Save,action:string,client=activePlayClientId(),activeMs=Math.min(3000,Math.max(0,Date.now()-(head.activePlayClock?.lease?.lastAt??Date.now())))){
 const s=identitySnapshot();requireBound(head,s);const pending=pendingKey(s,head.id),last=head.activePlayClock?.transport?.last.ack,l=head.activePlayClock?.lease;
 const a:Action={action_id:activePlayActionId(head.id,(last?.ordinal??0)+1),expected_version:head.version,scene:head.scene,position:head.position,target:'',action,payload:{ordinal:(last?.ordinal??0)+1,previous:last?.token??'',client,...(action==='candidate-active-open'?{}:{lease:l?.id,sequence:(l?.sequence??0)+1,activeMs})}};
 const work=async()=>{requireBound(head,s);if(storage().getItem(pending))throw Error('PENDING_ACTION');storage().setItem(pending,JSON.stringify({id:head.id,channel:'active-play',action:a}));
  try{const ack:ActivePlayAck=await request('/sessions/'+head.id+'/active-play',a,s);requireBound(head,s);confirmActivePlay(ack,head.id,a);const next=applyActivePlayAck(head,ack);requireBound(head,s);storage().removeItem(pending);return {head:bind(s,next)}}catch(e:any){s.assert();if(resolvedMotionFailure(e))storage().removeItem(pending);throw e}
 };return navigator.locks?navigator.locks.request('harbor-authority-writer:'+s.scope,work):work();
}
