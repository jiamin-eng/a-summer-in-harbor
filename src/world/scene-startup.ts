import {rendererFailure,type RendererFailure} from './renderer-capability';
/** In-memory, allowlisted diagnostics only: never retain exception text, URLs,
 * account IDs, request bodies or storage. Each mount/scene owns its attempt. */
export type StartupStage='scene-assets'|'renderer'|'map'|'ready';
export type StartupCode='NONE'|'SCENE_ASSET_TIMEOUT'|'SCENE_ASSET_FAILED'|'SCENE_LOAD_TIMEOUT'|'MAP_LOAD_TIMEOUT'|'RENDERER_EVAL_UNAVAILABLE'|'WASM_POLICY_BLOCKED'|'RENDERER_UNAVAILABLE'|'RENDERER_FAILED'|'TEXTURE_WORKER_FAILED'|'SCENE_START_CANCELLED';
export type StartupSnapshot={schema:'scene-start-v1';status:'loading'|'ready'|'failed'|'cancelled';stage:StartupStage;code:StartupCode;textureLoader:'main-thread';evalMode:'static-polyfills';rendererFailure?:RendererFailure};
const codes=new Set<StartupCode>(['NONE','SCENE_ASSET_TIMEOUT','SCENE_ASSET_FAILED','SCENE_LOAD_TIMEOUT','MAP_LOAD_TIMEOUT','RENDERER_EVAL_UNAVAILABLE','WASM_POLICY_BLOCKED','RENDERER_UNAVAILABLE','RENDERER_FAILED','TEXTURE_WORKER_FAILED','SCENE_START_CANCELLED']);
let active:symbol|undefined,snapshot:StartupSnapshot|undefined;
export function readSceneStartup():StartupSnapshot|undefined{return snapshot&&{...snapshot}}
export function startupCode(error:unknown,stage:StartupStage):StartupCode{
 let message='';try{if(typeof error==='string')message=error;else if(error&&typeof(error as {message?:unknown}).message==='string')message=(error as {message:string}).message}catch{/* do not call a foreign error's toString */}
 if(codes.has(message as StartupCode)&&message!=='NONE')return message as StartupCode;
 if(/WebAssembly\.(?:instantiate|compile)/.test(message)&&/Content Security [Pp]olicy|unsafe-eval|wasm-unsafe-eval/.test(message))return 'WASM_POLICY_BLOCKED';
 if(message.startsWith('Current environment does not allow unsafe-eval'))return 'RENDERER_EVAL_UNAVAILABLE';
 if(rendererFailure(error))return 'RENDERER_UNAVAILABLE';
 if(message.startsWith('[WorkerManager.loadImageBitmap]'))return 'TEXTURE_WORKER_FAILED';
 return stage==='scene-assets'?'SCENE_ASSET_FAILED':'RENDERER_FAILED';
}
export function beginSceneStartup(){
 const owner=Symbol(),controller=new AbortController();active=owner;
 const state:StartupSnapshot={schema:'scene-start-v1',status:'loading',stage:'scene-assets',code:'NONE',textureLoader:'main-thread',evalMode:'static-polyfills'};
 const publish=()=>{if(active===owner)snapshot={...state}};publish();
 const loading=()=>active===owner&&state.status==='loading'&&!controller.signal.aborted;
 return {signal:controller.signal,isLoading:loading,
  phase(stage:StartupStage){if(loading()){state.stage=stage;publish()}},
  ready(){if(!loading())return false;state.status='ready';state.stage='ready';state.code='NONE';publish();return true},
  fail(error:unknown):StartupCode|undefined{if(!loading())return;const code=startupCode(error,state.stage);if(code==='SCENE_START_CANCELLED')return;state.code=code;const reason=rendererFailure(error);if(reason){state.rendererFailure=reason;state.stage='renderer'}state.status='failed';publish();controller.abort();return code},
  cancel(){if(loading()){state.status='cancelled';state.code='SCENE_START_CANCELLED';publish()}controller.abort()}
 };
}
export type SceneStartupAttempt=ReturnType<typeof beginSceneStartup>;
export type StartupTimers={set:(callback:()=>void,ms:number)=>unknown;clear:(timer:unknown)=>void};
const timers:StartupTimers={set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id as ReturnType<typeof setTimeout>)};
/** A timeout remains a failure. Late completion/rejection is consumed; it must
 * never create a renderer or mutate a newer scene's ready state. */
export function sceneAssetDeadline<T>(work:()=>Promise<T>,signal:AbortSignal,ms=18000,clock:StartupTimers=timers):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let settled=false,timer:unknown;
  const finish=(ok:boolean,value:unknown)=>{if(settled)return;settled=true;clock.clear(timer);signal.removeEventListener('abort',abort);if(ok)resolve(value as T);else reject(value)};
  const abort=()=>finish(false,Error('SCENE_START_CANCELLED'));
  if(signal.aborted){abort();return}
  signal.addEventListener('abort',abort,{once:true});timer=clock.set(()=>finish(false,Error('SCENE_ASSET_TIMEOUT')),ms);
  Promise.resolve().then(()=>{if(signal.aborted)throw Error('SCENE_START_CANCELLED');return work()}).then(value=>finish(true,value),error=>finish(false,error));
 });
}
