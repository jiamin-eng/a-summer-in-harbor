import type {Words} from './data';

export const chapelPriestId='gabriel';
/** Reviewed local consumer art; formal Library admission and release remain separate gates. */
export const chapelPriest={
 id:chapelPriestId,age:56,
 name:['加布里埃尔·沃德神父','Father Gabriel Ward'] as Words,
 unknown:['整理椅子的神父','Priest arranging the chairs'] as Words,
 intro:['“我叫加布里埃尔·沃德，在这里做神父。小时候住在海湾，后来去了内陆十八年。现在又回来了。”他把椅子往旁边挪了一点。“叫我加布里埃尔就好。进来坐坐？”','“Gabriel Ward. I’m the priest here. I grew up by the bay, then spent eighteen years inland. Now I’m back.” He moves a chair aside. “Gabriel is fine. Would you like to sit?”'] as Words,
 role:['教堂的神父。重回故乡，喜欢修旧收音机，也在学着把空闲留给自己。','The chapel priest, home again. He repairs old radios and is learning to leave himself some time off.'] as Words,
 art:'gabriel',mapArt:'gabriel',avatarArt:'gabriel',portraitShape:'square' as const,
 artStatus:'local-consumer-qualified-formal-library-pending',
 routes:[{scene:'chapel',at:{x:475,y:315}},{scene:'hill',at:{x:600,y:500}},{scene:'chapel',at:{x:475,y:315}}],
 activities:[
  ['他做完晨祷，正把阅读角的椅子摆好，给早来的邻居留位置。','After morning prayer, he sets out chairs for the first neighbors at the reading corner.'],
  ['他沿山坡走一小段，停下来听风；口袋里装着还没修好的收音机旋钮。','He takes a short walk on the hill and stops to hear the wind, an unrepaired radio knob in his pocket.'],
  ['他把一天用过的杯子收好，坐下翻父亲留下的航船明信片。','He puts the day’s cups away and sits with the boat postcards his father left him.'],
 ] as Words[],
};
export const chapelPriestPeople={[chapelPriestId]:chapelPriest};
export const chapelPriestRoutes={[chapelPriestId]:chapelPriest.routes};
export const chapelPriestRoles={[chapelPriestId]:chapelPriest.role};
