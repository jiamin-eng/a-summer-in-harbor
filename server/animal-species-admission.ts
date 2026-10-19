import {acceptedAnimals} from '../src/animals/art';

/** Phase-three intake only. A passing packet may be reviewed by the owner;
 * this module never edits the accepted roster or enables a runtime species. */
export type FutureAnimalPacket={
 id:string;species:string;rights:{source:string;scope:string;reviewed:boolean};
 media:{atlasSha256:string;poseSha256:string[];portraitSha256:string};
 profile:{width:number;height:number;footX:number;footY:number;scale:number};
 behavior:{scheduleFacts:number;observationContract:boolean;collisionReviewed:boolean};
 qa:{renderer320Sha256:string;renderer390Sha256:string;continuousMotion:boolean;saveCompatibility:boolean};
};
const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function inspectFutureAnimalAdmission(value:unknown){
 const p=value as Partial<FutureAnimalPacket>|null,missing:string[]=[];
 if(!p||typeof p!=='object'||Array.isArray(p))return {readyForOwnerReview:false,runtimeAdmitted:false,missing:['packet']};
 if(typeof p.id!=='string'||!/^harbor-[a-z]+-[1-9][0-9]*$/.test(p.id)||acceptedAnimals.some(a=>a.id===p.id))missing.push('new-stable-id');
 if(typeof p.species!=='string'||!['dog','crab','other'].includes(p.species))missing.push('species-policy');
 if(!p.rights?.reviewed||!p.rights.source||!p.rights.scope)missing.push('rights');
 if(!sha(p.media?.atlasSha256)||!sha(p.media?.portraitSha256)||!Array.isArray(p.media?.poseSha256)||p.media.poseSha256.length<9||p.media.poseSha256.some(h=>!sha(h)))missing.push('native-media');
 if(!p.profile||![p.profile.width,p.profile.height,p.profile.footX,p.profile.footY,p.profile.scale].every(Number.isFinite)||p.profile.width<=0||p.profile.height<=0||p.profile.scale<=0||p.profile.footX<0||p.profile.footX>p.profile.width||p.profile.footY<0||p.profile.footY>p.profile.height)missing.push('consumer-profile');
 if(!p.behavior?.scheduleFacts||!p.behavior.observationContract||!p.behavior.collisionReviewed)missing.push('behavior-safety');
 if(!sha(p.qa?.renderer320Sha256)||!sha(p.qa?.renderer390Sha256)||!p.qa?.continuousMotion||!p.qa?.saveCompatibility)missing.push('consumer-qa');
 return {readyForOwnerReview:missing.length===0,runtimeAdmitted:false,missing};
}
