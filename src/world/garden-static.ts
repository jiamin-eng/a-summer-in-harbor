import type {Prop} from './data';

// Four pinned local static consumers. Their source canvases are 1254 square;
// anchor at the last visible source row so the object touches its footprint.
// These placements do not create harvests, quests, Library identities or saves.
export const gardenStaticProps:Prop[]=[
 {id:'static-sundial',art:'pedestal-sundial',at:{x:340,y:270},width:96,footprint:{x:326,y:254,w:28,h:16}},
 {id:'static-chiminea',art:'clay-chiminea',at:{x:130,y:550},width:98,footprint:{x:119,y:532,w:22,h:18}},
 {id:'static-birdhouse',art:'nest-birdhouse',at:{x:770,y:250},width:91,footprint:{x:761,y:238,w:18,h:12}},
 {id:'static-beehive',art:'wooden-beehive-box',at:{x:815,y:470},width:90,footprint:{x:797,y:448,w:36,h:22}}
];

export const gardenStaticAnchors:Record<string,[number,number]>={
 'pedestal-sundial':[.5,1143/1254],
 'clay-chiminea':[.5,1111/1254],
 'nest-birdhouse':[.5,1101/1254],
 'wooden-beehive-box':[.5,1118/1254]
};
