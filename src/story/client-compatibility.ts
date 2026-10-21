import {FISHING_PROTOCOL} from '../fishing-release';
let issue:string|undefined;
export const clientCompatibilityIssue=()=>issue;
export function requireClientUpdate(code='CLIENT_REFRESH_REQUIRED'):never{issue=code;window.dispatchEvent(new CustomEvent('harbor-client-update',{detail:code}));throw Object.assign(Error(code),{status:409,terminal:false})}
export function checkFishingContract(value:any){if(value?.fishingProtocol!==FISHING_PROTOCOL||!['open','stop-new'].includes(value?.mode))requireClientUpdate('SERVER_UPDATE_REQUIRED')}
