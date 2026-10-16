/** No transport/model dependency. Candidates choose an authored line; rules keep every effect. */
import type {Save} from '../src/story/state';
import {relationshipStage,relationshipLastMemory,relationshipGreeting,relationshipRuleVersion} from '../src/story/relationship-growth';
import type {Words} from '../src/world/data';
export function relationshipNarrativeContext(s:Save,p:string){
 const lines:Record<string,Words>={};const greeting=relationshipGreeting(s,p),memory=relationshipLastMemory(s,p);
 if(greeting)lines.greeting=greeting;if(memory)lines.memory=memory;
 return {schema:1 as const,rules:relationshipRuleVersion(p),journey:s.id,basisVersion:s.version,person:p,stage:relationshipStage(s,p),lines,rule:'Choose one admitted line ID. No new facts, romance, stage change, points, items, rewards, unlocks or action selection.'};
}
export function admitRelationshipNarrative(s:Save,p:string,candidate:unknown):Words|undefined{
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return;
 const c=candidate as Record<string,unknown>,context=relationshipNarrativeContext(s,p);
 if(Object.keys(c).some(k=>!['schema','journey','basisVersion','person','lineId'].includes(k))||c.schema!==1||c.journey!==s.id||c.basisVersion!==s.version||c.person!==p||typeof c.lineId!=='string'||!Object.prototype.hasOwnProperty.call(context.lines,c.lineId))return;
 return context.lines[c.lineId];
}
