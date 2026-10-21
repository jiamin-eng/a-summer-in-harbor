/** Local compiled-mode probe only; never a public entry or alternate API. */
export {FISHING_MODE,FISHING_PROTOCOL,FISHING_RELEASE,fishingContract} from '../src/fishing-release';
export {createRuntime} from '../server/runtime';
export {initial,applyAction} from '../src/story/state';
export {checkShore} from '../src/world/shore-water';
export {worldWithFlags} from '../src/world/data';
export {fishingInitial,fishingStep,recordFishing} from '../src/challenges/fishing';
