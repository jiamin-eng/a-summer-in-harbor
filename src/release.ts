import {FISHING_RELEASE,FISHING_MODE} from './fishing-release';
/** Paired build mode is visible in frontend and backend health; exact hashes live in the build manifest. */
export const RELEASE=FISHING_RELEASE+':'+FISHING_MODE;
