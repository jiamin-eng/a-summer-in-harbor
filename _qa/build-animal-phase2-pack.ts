import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import choice from './fixtures/animal-phase2-quiet-after-gulls.json';
import first from '../server/content/reviewed-evening-gull-watch.json';
import {AnimalContentRegistry,builtInCommissions,contentHash} from '../server/animal-content';
import {compileQuietAfterGulls} from '../server/animal-phase2-copy';
import {animalContractHash,assertBoundAnimalReview,inspectAnimalChoice} from '../server/animal-grounded-review';
import type {AnimalCommission} from '../src/animal-life/types';

// This is a local fixture compiler. It never calls a model or authorizes use in production.
const review={format:'harbor-animal-review-v2' as const,passed:true,findings:[]};
const packet=inspectAnimalChoice(choice,['dani'],[...builtInCommissions,first.definition as AnimalCommission]);
assertBoundAnimalReview(review,packet);
const definition=compileQuietAfterGulls(choice);
const ref=new AnimalContentRegistry([definition]).ref(definition.id,definition.revision);
const continuation=['海鸥的傍晚已经记在册里。接下来，夜里去住户庭院看看第3只海湾猫安静睡觉；观察后可以改日找Dani分享。','The evening gull note is already in your book. Next, watch harbor cat 3 sleeping in Residents’ Courtyard at night; you can share it with Dani on another day.'];
const pack={schema:1,sourceKind:'offline-fixture',contractHash:animalContractHash,prerequisite:first.ref,
 continuation,continuationHash:contentHash(continuation),
 groundedChoice:choice,independentReview:review,definition,ref,choiceHash:contentHash(choice)};
const path=fileURLToPath(new URL('../server/content/phase2-quiet-after-gulls.json',import.meta.url));
writeFileSync(path,JSON.stringify(pack,null,2)+'\n');
process.stdout.write(JSON.stringify({path,ref,choiceHash:pack.choiceHash,issues:packet.issues.length,networkCalls:0})+'\n');
