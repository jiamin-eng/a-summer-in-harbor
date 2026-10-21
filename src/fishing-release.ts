/** Public protocol/build metadata; never identity or a credential. */
declare const __HARBOR_FISHING_MODE__: 'open'|'stop-new';
export const FISHING_PROTOCOL='2';
export const FISHING_RELEASE='harbor-shore-recovery-compat-20261021-v2';
export const FISHING_MODE=typeof __HARBOR_FISHING_MODE__==='undefined'?'open':__HARBOR_FISHING_MODE__;
if(!['open','stop-new'].includes(FISHING_MODE))throw Error('INVALID_FISHING_RELEASE_MODE');
export const FISHING_NEW_STARTS=FISHING_MODE==='open';
export const fishingContract=()=>({fishingProtocol:FISHING_PROTOCOL,fishingRelease:FISHING_RELEASE,mode:FISHING_MODE});
export function assertFishingStartAllowed(action:string,newStarts=FISHING_NEW_STARTS){if(!newStarts&&['fishing-kit:claim','fishing:start','challenge-start:fishing'].includes(action))throw Object.assign(Error('FISHING_NEW_STARTS_CLOSED'),{status:409,terminal:true})}
