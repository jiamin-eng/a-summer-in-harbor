import type {AnimalCommission} from '../src/animal-life/types';
import {contentHash,validateCommission} from './animal-content';
import {compileAnimalStoryChoice} from './animal-grounding';

// Authored copy for this exact, frozen choice. The generic compiler still checks
// every animal, behavior, place and period before any words are customized.
const quietAfterGullsChoiceHash='aa3601b0e296c8731b717329b49e49a1716fcb1790b3b898874a6aa5d4c8cc58';
export function compileQuietAfterGulls(choice:unknown):AnimalCommission{
 if(contentHash(choice)!==quietAfterGullsChoiceHash)throw Error('ANIMAL_PHASE2_CHOICE_MISMATCH');
 const base=compileAnimalStoryChoice(choice,['dani']);
 const definition:AnimalCommission={...base,
  brief:[
   '“上次已经记下第3只岸边海鸥傍晚在海岸安静活动。这次请在夜间去住户庭院，安静观察第3只海湾猫睡觉。沿用上次的海鸥记录；别叫醒猫。没有期限。”',
   '“Your earlier note already records shore gull 3 moving quietly in The Coast (evening). This time, quietly watch harbor cat 3 sleeping in Residents’ Courtyard at night. Keep the gull note; let the cat sleep. No deadline.”',
  ],
  page:[
   '我与Dani Costa分享了两段不同时刻的观察：先前在海岸傍晚记下的第3只岸边海鸥安静活动，以及这次夜间在住户庭院看到的第3只海湾猫睡觉。我们都给它们留了空间。',
   'I shared two observations with Dani Costa: the earlier note of shore gull 3 moving quietly in The Coast (evening), and harbor cat 3 sleeping in Residents’ Courtyard at night. We gave them both space.',
  ]};
 validateCommission(definition);return definition;
}
