import pack from './content/reviewed-evening-gull-watch.json';
import phase2 from './content/phase2-quiet-after-gulls.json';
import {AnimalContentRegistry,builtInCommissions,canonical,contentHash,validateCommission} from './animal-content';
import {compileAnimalStoryChoice} from './animal-grounding';
import {compileQuietAfterGulls} from './animal-phase2-copy';
import {inspectAnimalChoice,assertBoundAnimalReview,parseBoundAnimalReview,animalContractHash} from './animal-grounded-review';
import {createHarborLife} from './life-assembly';
import type {AnimalRef} from '../src/animal-life/types';

/** One frozen, already reviewed definition. No gateway, artifact transplantation,
 * model route or test-save adoption is needed to offer it to introduced Dani. */
export function reviewedAnimalRegistry(newStarts=true){
 if(pack.contractHash!==animalContractHash)throw Error('REVIEWED_ANIMAL_CONTRACT_MISMATCH');
 validateCommission(pack.definition);
 const inspection=inspectAnimalChoice(pack.groundedChoice,['dani'],builtInCommissions);
 assertBoundAnimalReview(parseBoundAnimalReview(JSON.stringify(pack.independentReview)),inspection);
 if(canonical(compileAnimalStoryChoice(pack.groundedChoice,['dani']))!==canonical(pack.definition))throw Error('REVIEWED_ANIMAL_DEFINITION_MISMATCH');
 const definitions=[...builtInCommissions,pack.definition];
 const enabled=[...builtInCommissions,...(newStarts?[pack.definition]:[])].map(d=>d.id+'@'+d.revision);
 const registry=new AnimalContentRegistry(definitions,enabled);
 if(canonical(registry.ref(pack.definition.id,pack.definition.revision))!==canonical(pack.ref))throw Error('REVIEWED_ANIMAL_REF_MISMATCH');
 return registry;
}

export function createReviewedAnimalLife(...args:Parameters<typeof createHarborLife>){
 return createHarborLife(args[0],args[1],args[2],reviewedAnimalRegistry());
}

/** Candidate continuation of Dani's already reviewed gull chapter. The second
 * chapter is invisible until the first pinned page is actually completed. */
export function reviewedAnimalArcRegistry(newStarts=true){
 const first=reviewedAnimalRegistry(newStarts);
 if(phase2.sourceKind!=='offline-fixture'||phase2.contractHash!==animalContractHash||canonical(phase2.prerequisite)!==canonical(pack.ref)||phase2.continuationHash!==contentHash(phase2.continuation))throw Error('ANIMAL_STORY_SOURCE_MISMATCH');
 validateCommission(phase2.definition);
 const existing=first.list().map(e=>e.definition);
 const inspection=inspectAnimalChoice(phase2.groundedChoice,['dani'],existing);
 assertBoundAnimalReview(parseBoundAnimalReview(JSON.stringify(phase2.independentReview)),inspection);
 if(canonical(compileQuietAfterGulls(phase2.groundedChoice))!==canonical(phase2.definition))throw Error('ANIMAL_STORY_DEFINITION_MISMATCH');
 const defs=[...existing,phase2.definition];
 const enabled=defs.filter(d=>d.id!==phase2.definition.id||newStarts).map(d=>d.id+'@'+d.revision);
 const key=phase2.ref.id+'@'+phase2.ref.revision;
 const registry=new AnimalContentRegistry(defs,enabled,{[key]:pack.ref as AnimalRef},{[key]:phase2.continuation as [string,string]});
 if(canonical(registry.ref(phase2.ref.id,phase2.ref.revision))!==canonical(phase2.ref))throw Error('ANIMAL_STORY_REF_MISMATCH');
 return registry;
}

export function createReviewedAnimalArcLife(...args:Parameters<typeof createHarborLife>){
 return createHarborLife(args[0],args[1],args[2],reviewedAnimalArcRegistry());
}
