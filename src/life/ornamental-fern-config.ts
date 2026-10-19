/** One authored target, shared by rendering, collision, UI and authority. */
export const fernSlot={id:'owned-fern-slot',scene:'home',at:{x:670,y:350},approach:{x:662,y:378},width:30,footprint:{x:662,y:338,w:16,h:12}} as const;
export const fernOwnedFlag='ornamental-fern:owned:v1';
export const fernDisplayFlag='ornamental-fern:displayed:v1';
export const fernRules='ornamental-fern-v1.0';
export const fernGiftEvent='mara:owned-fern-gift-v1';
export const fernImage='./art/plant.png';
export const fernVerbs=['read-offer','accept','place','take'] as const;
export type OrnamentalFernVerb=typeof fernVerbs[number];
export const fernMoveCost={energy:4,minutes:20,cash:0} as const;
