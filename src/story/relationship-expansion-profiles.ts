import type {RelationshipProfile} from './relationship-growth';

/** Local continuation slice, not a historically approved batch roster. */
export const relationshipExpansionProfiles:Record<string,RelationshipProfile>={
 owen:{
  interest:['没听清的时候，你会再等一会儿吗？','When you miss a sound, do you wait for it again?'],
  personal:['“会。以前修公交车，得先分清听见的和猜的。现在听鸟也一样。你不用为了陪我，就跟着说认出来了。”','“I do. Repairing buses taught me to separate what I heard from what I guessed. Listening for birds is much the same. You needn’t pretend to recognize one just to keep me company.”'],
  private:['“以前人家找我，常是因为有东西坏了。退休后有时会想，如果不修点什么，还值不值得来找我。你肯陪我等一阵，我就没那么着急找工具了。”','“People used to come to me when something broke. Since retiring, I sometimes wonder whether I’m worth visiting without a repair to do. When you wait with me, I feel less need to reach for tools.”'],
  request:['“有空去旧气象站看看那本记录本吗？留意上面写的是过去的记录。回来聊聊它怎样帮人记事；没写的就别替它补，也不用替我认鸟。”','“Would you look at the log at the old weather station? Notice that it records the past. Come back and tell me how it helps people remember. Don’t fill in what isn’t there, or identify a bird for me.”'],
  observation:['你把旧记录本当作过去的记录来读。纸上没写的仍留作未知；你准备只把亲眼读到的内容告诉欧文。','You read the old log as a record of the past. You leave what it does not say uncertain, and prepare to tell Owen only what you found.'],
  thanks:['“谢谢你回来，还把没写的留成没写的。这样我才知道，哪些是我们真的一起弄明白的。”','“Thank you for coming back, and leaving the unwritten parts unwritten. That helps me know what we actually learned together.”'],
  observeScene:'weather',observeTarget:'logbook',eventScene:'coast',
  company:['你和欧文在海岸边停了一会儿。他没有急着给远处的声音起名字，你也没有猜。你们决定下回还可以一起慢慢听。','You and Owen pause by the coast. He doesn’t hurry to name a distant sound, and you don’t guess. You agree that you could listen slowly together again.'],
  privateEvent:['欧文说起一位总在车修好后才来道谢的老乘客，随后笑了：“今天没修好任何东西，也有人坐在旁边。这样的一天，我也想记下来。”你们又待了一会儿。','Owen recalls a passenger who would return to thank him after a repair. Then he smiles. “I haven’t fixed anything today, and someone still sat with me. I’d like to remember a day like this.” You stay a little longer.'],
  recall:['“你回来讲过记录本，也陪我听过。没听清的就再等，不用为了给我一个答案而猜。老朋友，今天也可以只坐一会儿。”','“You came back to talk about the log, and you listened with me. If we miss a sound, we can wait rather than guess an answer for my sake. My friend, today we can simply sit a while.”'],
 },
};
