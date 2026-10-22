import type {Words} from '../world/data';
export const fishCatalog={
 'bay-silverside':{name:['海湾银鳞鱼','Bay silverside'],water:'saltwater',look:['细长银亮身体，窄尾，明亮银色侧线','Slender silver body, narrow tail and bright silver flank'],prefer:'reusable-fishing-lure'},
 'night-mullet':{name:['夜游鲻鱼','Night mullet'],water:'saltwater',look:['灰蓝圆筒体，钝头，分开的背鳍和细横纹','Blue-grey cylindrical body, blunt head, separated dorsal fins and fine horizontal stripes'],prefer:'bait-fish-chunk'},
 'harbor-goby':{name:['港湾虾虎鱼','Harbor goby'],water:'saltwater',look:['褐色斑驳大头小鱼，鼓起的双眼和圆扇胸鳍','Small mottled brown fish, broad head, raised eyes and fan-shaped pectoral fins'],prefer:'bait-worm'},
 'sand-flounder':{name:['沙地比目鱼','Sand flounder'],water:'saltwater',look:['扁椭圆沙色体，两眼同侧，边缘连续鱼鳍','Flat oval sandy body, both eyes on one visible side and a fin fringe'],prefer:'bait-shrimp'},
 'coastal-bass':{name:['海岸鲈鱼','Coastal bass'],water:'saltwater',look:['银灰长体，大嘴，明显深色背脊和分开的背鳍','Long silver-grey body, large mouth, dark back and distinct dorsal fins'],prefer:'bait-shrimp'},
 'striped-mackerel':{name:['青纹鲭鱼','Striped mackerel'],water:'saltwater',look:['蓝绿梭形体，背部波浪深纹，尖叉尾','Streamlined blue-green body, wavy dark back markings and a deeply forked tail'],prefer:'bait-fish-chunk'},
 'silver-herring':{name:['银光鲱鱼','Silver herring'],water:'saltwater',look:['侧扁银体，蓝灰背，小嘴，单一背鳍和叉尾','Laterally flattened silver body, blue-grey back, small mouth, one dorsal fin and forked tail'],prefer:'bait-fish-chunk'},
 'shore-bream':{name:['近岸海鲷','Shore bream'],water:'saltwater',look:['高背椭圆银金体，短嘴，深色鳃后斑','Deep oval silver-gold body, short mouth and a dark mark behind the gill'],prefer:'bait-worm'},
 'stream-minnow':{name:['溪边小鱼','Stream minnow'],water:'stream',look:['细小棕金体，深色侧线，短透明鳍','Tiny brown-gold body, dark side stripe and short translucent fins'],prefer:'bait-worm'},
 'river-perch':{name:['河纹鲈鱼','River perch'],water:'stream',look:['橄榄绿高背，明显竖条，橙红腹鳍尾鳍','Olive-green high back, clear vertical bars and orange-red lower fins'],prefer:'bait-shrimp'},
 'brown-trout':{name:['褐点鳟鱼','Brown trout'],water:'stream',look:['棕金修长体，黑红圆点，小脂鳍，方浅叉尾','Long brown-gold body, dark and red round spots, small adipose fin and a shallow-forked tail'],prefer:'bait-worm'},
 'river-chub':{name:['河岸雅罗鱼','River chub'],water:'stream',look:['粗圆银金体，大鳞深边，较大圆头，橙色腹鳍','Robust silver-gold body, large dark-edged scales, broad rounded head and orange lower fins'],prefer:'bait-fish-chunk'},
} as const satisfies Record<string,{name:Words;water:'saltwater'|'stream';look:Words;prefer:string}>;
export type SpeciesId=keyof typeof fishCatalog;
export const speciesIds=Object.keys(fishCatalog) as SpeciesId[];
export const fishItem=(id:SpeciesId)=>'fish-'+id;
export const fishSpeciesForItem=(item:string)=>speciesIds.find(id=>fishItem(id)===item);
export const baitCatalog={
 'reusable-fishing-lure':{name:['永久基础拟饵','Reusable lure'],price:0},
 'bait-worm':{name:['虫饵','Worm bait'],price:2},
 'bait-shrimp':{name:['虾饵','Shrimp bait'],price:3},
 'bait-fish-chunk':{name:['鱼块饵','Fish chunk bait'],price:3},
}as const satisfies Record<string,{name:Words;price:number}>;
export type BaitId=keyof typeof baitCatalog;
export const baitIds=Object.keys(baitCatalog) as BaitId[];
export const basicBait:BaitId='reusable-fishing-lure';
export const paidBaits=baitIds.filter(id=>id!==basicBait);
export const fishingShopVerbs=paidBaits.map(id=>'fishing:buy-bait:'+id);
export const fishingItems=Object.fromEntries([...speciesIds.map(id=>[fishItem(id),{name:fishCatalog[id].name,description:['独立记录的鱼获，可在咖啡馆交给西奥，每条$6。','A distinct catch. Deliver to Theo at the café for $6.']as Words,kind:'objects'as const}]),...paidBaits.map(id=>[id,{name:baitCatalog[id].name,description:['偏好饵，确认钓获入包才消耗1份；收竿、脱钩不扣。','Preference bait. One is used only when a catch is confirmed to your bag; withdrawal and escape use none.']as Words,kind:'objects'as const}])]);
