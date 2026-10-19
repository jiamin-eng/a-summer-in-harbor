import {readFileSync} from 'node:fs';
import type {Save} from '../src/story/state';
import {fernQaAssembly} from './ornamental-fern-fixture';
/** For the existing QA supervisor's fresh synthetic SQLite enrollment only.
 * Never import a player save. Rebind owner solely when the QA authority issues
 * its new synthetic journey ID, before its first write. */
export function loadOrnamentalFernQaFixture(file:string,id:string,locale:'en'|'zh'):Save{
 const fixture=JSON.parse(readFileSync(file,'utf8'));
 if(fixture.fixtureSchema!==1||fixture.synthetic!==true||!fixture.save)throw Error('QA_SYNTHETIC_FIXTURE_REQUIRED');
 const s:Save=structuredClone(fixture.save);s.id=id;s.locale=locale;s.version=0;s.cursor=0;
 if(s.ornamentalFernV1?.plant)s.ornamentalFernV1.plant.ownerJourney=id;
 fernQaAssembly().runtime.assertReadable(s);return s;
}
