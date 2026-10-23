/** Explicit, once-per-failed-overlay diagnostic. No requests, storage, raw error,
 * GPU vendor/renderer/limits or host fingerprint. All created resources are ours. */
export type RendererFailure='NO_SUPPORTED_BACKEND'|'WEBGPU_ADAPTER_UNAVAILABLE'|'WEBGL_CONTEXT_CREATION_FAILED'|'WEBGL_UNSUPPORTED_LEGACY'|'AUTO_DETECT_UNAVAILABLE_LEGACY';
export function rendererFailure(error:unknown):RendererFailure|undefined{
 let message='';try{if(typeof error==='string')message=error;else if(error&&typeof(error as {message?:unknown}).message==='string')message=(error as {message:string}).message}catch{return}
 if(message==='No available renderer for the current environment')return 'NO_SUPPORTED_BACKEND';
 if(message==='WebGPU not supported. No GPU adapter was returned by navigator.gpu.requestAdapter().')return 'WEBGPU_ADAPTER_UNAVAILABLE';
 if(message==='This browser does not support WebGL. Try using the canvas renderer')return 'WEBGL_CONTEXT_CREATION_FAILED';
 if(message.startsWith('WebGL unsupported'))return 'WEBGL_UNSUPPORTED_LEGACY';
 if(message.startsWith('Unable to auto-detect a suitable renderer'))return 'AUTO_DETECT_UNAVAILABLE_LEGACY';
}
export type ContextProbe={result:'created'|'null'|'exception';stencil:'yes'|'no'|'unavailable';lost:'yes'|'no'|'unavailable';creationError:boolean};
export type RendererCapability={schema:'renderer-capability-v1';webglGlobal:boolean;webgl2Global:boolean;webgl:ContextProbe;webgl2:ContextProbe;webgpuAPI:boolean;webgpuAdapter:'not-run'|'absent'|'available'|'exception'|'timeout';webgpuDevice:'not-run'|'created'|'exception'|'timeout'};
type ProbeGL={getContextAttributes:()=>{stencil?:boolean}|null;isContextLost:()=>boolean;getExtension:(name:string)=>{loseContext?:()=>void}|null};
type ProbeCanvas={width:number;height:number;getContext:(kind:string,options:unknown)=>ProbeGL|null;addEventListener:(name:string,fn:()=>void)=>void;removeEventListener:(name:string,fn:()=>void)=>void};
type ProbeDevice={destroy:()=>void};type ProbeAdapter={requestDevice:()=>Promise<ProbeDevice>};
export type ProbeEnvironment={webglGlobal:boolean;webgl2Global:boolean;createCanvas:()=>ProbeCanvas;gpu?:{requestAdapter:()=>Promise<ProbeAdapter|null>};setTimer:(fn:()=>void,ms:number)=>unknown;clearTimer:(id:unknown)=>void};
function context(env:ProbeEnvironment,kind:string):ContextProbe{
 const result:ContextProbe={result:'exception',stencil:'unavailable',lost:'unavailable',creationError:false};let canvas:ProbeCanvas|undefined,gl:ProbeGL|null=null;const creationError=()=>{result.creationError=true};
 try{canvas=env.createCanvas();canvas.width=canvas.height=1;canvas.addEventListener('webglcontextcreationerror',creationError);gl=canvas.getContext(kind,{stencil:true,failIfMajorPerformanceCaveat:false});result.result=gl?'created':'null';if(gl){const a=gl.getContextAttributes();result.stencil=a?(a.stencil?'yes':'no'):'unavailable';result.lost=gl.isContextLost()?'yes':'no'}}catch{/* fixed enums only */}
 finally{canvas?.removeEventListener('webglcontextcreationerror',creationError);try{gl?.getExtension('WEBGL_lose_context')?.loseContext?.()}catch{/* only our detached test canvas */}}
 return result;
}
async function bounded<T>(env:ProbeEnvironment,work:()=>Promise<T>,late?:(v:T)=>void):Promise<{result:'ok';value:T}|{result:'exception'|'timeout'}>{
 return new Promise(resolve=>{let settled=false;const timer=env.setTimer(()=>{settled=true;resolve({result:'timeout'})},2500);Promise.resolve().then(work).then(value=>{if(settled){try{late?.(value)}catch{}return}settled=true;env.clearTimer(timer);resolve({result:'ok',value})},()=>{if(!settled){settled=true;env.clearTimer(timer);resolve({result:'exception'})}})});
}
export async function probeRendererCapability(env:ProbeEnvironment):Promise<RendererCapability>{
 const out:RendererCapability={schema:'renderer-capability-v1',webglGlobal:env.webglGlobal,webgl2Global:env.webgl2Global,webgl:context(env,'webgl'),webgl2:context(env,'webgl2'),webgpuAPI:!!env.gpu,webgpuAdapter:'not-run',webgpuDevice:'not-run'};
 if(!env.gpu)return out;
 const adapter=await bounded(env,()=>env.gpu!.requestAdapter());if(adapter.result!=='ok'){out.webgpuAdapter=adapter.result;return out}if(!adapter.value){out.webgpuAdapter='absent';return out}out.webgpuAdapter='available';
 const device=await bounded(env,()=>adapter.value!.requestDevice(),value=>value.destroy());if(device.result!=='ok'){out.webgpuDevice=device.result;return out}out.webgpuDevice='created';try{device.value.destroy()}catch{}return out;
}
export function browserRendererProbe(){return probeRendererCapability({webglGlobal:typeof WebGLRenderingContext!=='undefined',webgl2Global:typeof WebGL2RenderingContext!=='undefined',createCanvas:()=>document.createElement('canvas') as unknown as ProbeCanvas,gpu:(navigator as unknown as {gpu?:ProbeEnvironment['gpu']}).gpu,setTimer:(fn,ms)=>setTimeout(fn,ms),clearTimer:id=>clearTimeout(id as ReturnType<typeof setTimeout>)});}
