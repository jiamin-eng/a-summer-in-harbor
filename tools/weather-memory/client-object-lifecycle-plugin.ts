/** RpgClientObject subscribes to the engine's permanent tick without retaining
 * its handle. Dispose scene-specific streams when map reset removes an actor;
 * preserve the current player retained by RPGJS's existing reset semantics. */
export function clientObjectLifecyclePlugin(){return{name:'isolated-client-object-lifecycle',enforce:'pre' as const,transform(code:string,id:string){if(id.endsWith('/@rpgjs/client/dist/Game/Object.js')){for(const anchor of ['this._frames.observable.subscribe(','combineLatest([this.graphics.observable','engine.tick.pipe().subscribe(','getFrameTimestamp(frame) {'])if(!code.includes(anchor))throw Error('CLIENT_OBJECT_LIFECYCLE_TARGET_MISMATCH');code=code.replace('this._frames.observable.subscribe(','this._harborFramesSubscription = this._frames.observable.subscribe(').replace('combineLatest([this.graphics.observable','this._harborGraphicsSubscription = combineLatest([this.graphics.observable').replace('engine.tick.pipe().subscribe(','this._harborTickSubscription = engine.tick.pipe().subscribe(');code=code.replace('getFrameTimestamp(frame) {',`disposeSceneSubscriptions() {
  if(this._harborSceneDisposed)return;
  this._harborSceneDisposed=true;
  this._harborFramesSubscription?.unsubscribe();
  this._harborGraphicsSubscription?.unsubscribe();
  this._harborTickSubscription?.unsubscribe();
  this.frames.length=0;
 this._harborConstructorSubscriptions?.forEach(subscription=>subscription.unsubscribe());
 this._harborConstructorSubscriptions=[];

}
getFrameTimestamp(frame) {`);return{code,map:null}}if(id.endsWith('/@rpgjs/client/dist/Game/Map.js')){const player='player.resetAnimationState?.();';const event='event?.resetAnimationState?.();';if(!code.includes(player)||!code.includes(event))throw Error('CLIENT_MAP_LIFECYCLE_TARGET_MISMATCH');code=code.replace(player,player+'player.disposeSceneSubscriptions?.();').replace(event,event+'event?.disposeSceneSubscriptions?.();');return{code,map:null}}if(id.endsWith('/@rpgjs/client/dist/RpgClientEngine.js')){const identity='this.playerIdSignal.set(data.pId);';if(!code.includes(identity))throw Error('CLIENT_LOCAL_PLAYER_RETIREMENT_TARGET_MISMATCH');code=code.replace(identity,`const harborPreviousLocalId=this.playerIdSignal();
if(harborPreviousLocalId&&harborPreviousLocalId!==data.pId&&this.activeSceneKind()==='map'){
 const players=this.sceneMap.players(),retired=players[harborPreviousLocalId];
 if(retired){retired.resetAnimationState?.();retired.disposeSceneSubscriptions?.();const retained={...players};delete retained[harborPreviousLocalId];this.sceneMap.players.set(retained);}
}
this.playerIdSignal.set(data.pId);`);const load='load(this.sceneMap, payload, true);';if(!code.includes(load))throw Error('CLIENT_PLAYER_REPLACEMENT_TARGET_MISMATCH');code=code.replace(load,`const harborPreviousPlayers=Object.values(this.sceneMap.players());
load(this.sceneMap,payload,true);
const harborRetainedPlayers=new Set(Object.values(this.sceneMap.players()));
harborPreviousPlayers.forEach(player=>{if(!harborRetainedPlayers.has(player))player?.disposeSceneSubscriptions?.()});`);return{code,map:null}}if(id.includes('/@signe_sync@3.1.1_') && id.endsWith('/@signe/sync/dist/index.js')){const anchor='current[part] = !isClass(classType) ? classType(part) : new classType();';if(!code.includes(anchor))throw Error('SYNC_CONSTRUCTOR_SCOPE_TARGET_MISMATCH');code=code.replace(anchor,`const store=globalThis.__REACTIVE_STORE__, previousTracker=store?.currentSubscriptionsTracker, subscriptions=[];
if(store)store.currentSubscriptionsTracker=subscription=>subscriptions.push(subscription);
try { current[part] = !isClass(classType) ? classType(part) : new classType(); }
finally {if(store)store.currentSubscriptionsTracker=previousTracker;}
if(typeof current[part]?.disposeSceneSubscriptions==='function')current[part]._harborConstructorSubscriptions=subscriptions;
else subscriptions.forEach(subscription=>previousTracker?.(subscription));`);return{code,map:null}}return null}}}
