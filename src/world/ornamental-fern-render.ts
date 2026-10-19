import {fernDisplayFlag} from '../life/ornamental-fern-config';

export const fernGraphicId='prop-home-owned-fern-display';
export const fernDisplayAnimation=(flags:readonly string[])=>flags.includes(fernDisplayFlag)?'stand':'hidden';
type FernActor={graphics:()=>string[];setGraphic:(graphic:string)=>void;animationName:{():string;set:(animation:string)=>void};syncChanges:()=>void};

/** Keep one sheet mounted: clearing graphics left a stale visible sheet in QA.
 * Hidden and stand frames explicitly set opacity, including on scene entry. */
export function syncFernDisplay(actor:FernActor,flags:readonly string[]){
 const animation=fernDisplayAnimation(flags);let changed=false;
 if(actor.graphics().length!==1||actor.graphics()[0]!==fernGraphicId){actor.setGraphic(fernGraphicId);changed=true}
 if(actor.animationName()!==animation){actor.animationName.set(animation);changed=true}
 if(changed)actor.syncChanges();
}
