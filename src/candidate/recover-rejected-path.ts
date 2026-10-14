import type {Save} from '../story/state';
import type {Point} from '../engine/world';
import {globalPoint} from './continuity';
import {resolvedMotionFailure} from './motion-errors';

type Projection={points:Point[];traceStart:Point;restoreConfirmed?: (scene:string,position:Point)=>Promise<void>};

/** A definite pre-commit path rejection may discard prediction, never progress.
 * Ambiguous transport failures still require the existing durable recovery UI. */
export async function recoverRejectedPath(error:any,head:Save,projection:Projection,open:()=>Promise<Save>,current:()=>boolean){
 if(error?.message!=='INVALID_MOTION_PATH'||!resolvedMotionFailure(error))return null;
 if(!current())throw Error('MOTION_FLUSH_CANCELLED');
 if(!projection.restoreConfirmed)throw Error('MOTION_RENDERER_UNAVAILABLE');
 projection.points=[];
 projection.traceStart=globalPoint(head.scene,head.position);
 await projection.restoreConfirmed(head.scene,head.position);
 if(!current())throw Error('MOTION_FLUSH_CANCELLED');
 projection.points=[];
 projection.traceStart=globalPoint(head.scene,head.position);
 return open();
}
