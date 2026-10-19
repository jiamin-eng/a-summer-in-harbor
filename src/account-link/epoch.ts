/** Request-local snapshots prevent a late response from being applied after switching.
 * This protects the client lifecycle, not the authenticity of the supplied ID. */
export class IdentityEpoch{
 private value:string|null=null;private credential:string|null=null;private version=0;private active=false;private controller=new AbortController();private listeners=new Set<()=>void>();
 // A credential is held only in this in-memory epoch, never in a save, URL,
 // diagnostic, or storage key. Rotation cancels replies from the old token.
 constructor(private read:()=>string|null,private readCredential?:()=>string|null){}
 enable(enabled:boolean){if(this.active===enabled)return;this.active=enabled;this.observe()}
 observe(){const value=this.active?this.read():null,credential=this.active&&value&&value!=='__invalid_shell_identity__'&&this.readCredential?this.readCredential():null;if(value===this.value&&credential===this.credential)return false;this.value=value;this.credential=credential;this.version++;this.controller.abort();this.controller=new AbortController();for(const f of this.listeners)f();return true}
 subscribe(f:()=>void){this.listeners.add(f);return()=>{this.listeners.delete(f)}}
 capture(){this.observe();const epoch=this.version,value=this.value,signal=this.controller.signal;return {epoch,account:value,scope:value===null?'browser':`temporary-unverified:${value}`,signal,assert:()=>{this.observe();if(epoch!==this.version||signal.aborted)throw Error('IDENTITY_CHANGED')}}}
}
