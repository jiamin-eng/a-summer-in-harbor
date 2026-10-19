import type {RelationshipProfile} from './relationship-growth';

/** A separate optional save root keeps the published Owen-only validator stable. */
export const relationshipNextProfiles:Record<string,RelationshipProfile>={
 dani:{
  interest:['你为什么把落叶夹进本子？','Why do you press fallen leaves into your notebook?'],
  personal:['“它已经落下来了，不用为了写一页故事去摘活叶。图书馆也一样：先听人愿意讲什么，再决定记什么。”','“It has already fallen. I needn’t pick a living leaf to fill a page. The library is similar: I listen to what someone wishes to share before deciding what to record.”'],
  private:['“有人把一件心事讲给我听，我常怕没记下来就辜负了他们。后来才明白，有些话是让我听见，不是让我替他们公开。”','“When someone tells me something personal, I worry that failing to write it down lets them down. I’m learning that some words are meant to be heard, not published by me.”'],
  request:['“有空去山坡花园看看那株路边的小蕨吗？只看看它现在怎样，回来告诉我。别摘叶，也不用替谁决定要不要浇水。”','“Would you look at the little fern by the Hillside Garden path? Tell me what you actually see when you return. Please don’t pick a frond or decide for anyone whether it needs water.”'],
  observation:['你看了路边的小蕨，记住当时看见的叶片；没有摘取或改变它，也没有把这次观察当作浇水。','You observe the pathside fern as it is. You do not pick or change it, and this observation does not count as watering.'],
  thanks:['“谢谢你只讲亲眼看见的。那一页可以慢慢写，植物还在原处，别人的故事也仍由他们自己决定。”','“Thank you for telling me only what you saw. I can write that page slowly. The plant stays where it belongs, and people still decide which stories are theirs to share.”'],
  observeScene:'garden',observeTarget:'growing-fern',eventScene:'courtyard',
  company:['你和丹妮在院子里留出通路，轻声聊起今天看到的一片落叶。你们没有替住户讲他们的故事。','You and Dani leave the courtyard path clear and speak softly about a fallen leaf you noticed today. You do not tell the residents’ stories for them.'],
  privateEvent:['丹妮合上本子，说有时朋友只是愿意坐在一旁，不要求她把每句话变成资料。你们安静地待了一会儿。','Dani closes her notebook. Sometimes a friend is willing to sit nearby without asking her to turn every conversation into a record. You stay quietly for a while.'],
  recall:['“那株小蕨还在那里。你回来讲了看见的事，也陪我把没获准讲的留在本子外面。今天我们可以只聊自己的日子。”','“The little fern is still there. You came back with what you saw, and helped me leave unshared stories outside the notebook. Today we can simply talk about our own day.”'],
 },
};
