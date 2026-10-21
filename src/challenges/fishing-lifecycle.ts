/** Shared focus/visibility gate: no frame budget or held input survives a pause. */
export function fishingLifecycle(windowTarget:Pick<Window,'addEventListener'|'removeEventListener'>,documentTarget:Pick<Document,'hidden'|'hasFocus'|'addEventListener'|'removeEventListener'>,change:(paused:boolean)=>void){
 let paused=documentTarget.hidden||!documentTarget.hasFocus();
 const pause=()=>{paused=true;change(true)},resume=()=>{if(documentTarget.hidden||!documentTarget.hasFocus())return;paused=false;change(false)},visibility=()=>documentTarget.hidden?pause():resume();
 const bindings:[Pick<EventTarget,'addEventListener'|'removeEventListener'>,string,()=>void][]=[[windowTarget,'blur',pause],[windowTarget,'focus',resume],[windowTarget,'pagehide',pause],[windowTarget,'pageshow',resume],[documentTarget,'visibilitychange',visibility],[documentTarget,'freeze',pause],[documentTarget,'resume',resume]];
 for(const [target,event,fn]of bindings)target.addEventListener(event,fn);change(paused);
 return {get paused(){return paused},dispose(){for(const [target,event,fn]of bindings)target.removeEventListener(event,fn)}};
}
