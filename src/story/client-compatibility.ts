import {FISHING_PROTOCOL} from '../fishing-release';
let issue:string|undefined;
const compatibilityAbort=new AbortController();
const failure=()=>Object.assign(Error(issue??'CLIENT_REFRESH_REQUIRED'),{status:409,terminal:false});
export const clientCompatibilityIssue=()=>issue;
export const clientCompatibilitySignal=()=>compatibilityAbort.signal;
/** Shared by every game transport, including media and dynamic-asset readers. */
export function assertClientCompatible(){if(issue)throw failure()}
export function requireClientUpdate(code='CLIENT_REFRESH_REQUIRED'):never{
 if(!issue){issue=code;compatibilityAbort.abort(failure());window.dispatchEvent(new CustomEvent('harbor-client-update',{detail:code}))}
 throw failure();
}
export function checkFishingContract(value:any){if(value?.fishingProtocol!==FISHING_PROTOCOL||!['open','stop-new'].includes(value?.mode))requireClientUpdate('SERVER_UPDATE_REQUIRED')}
