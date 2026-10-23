import type { Ability, Anchor, DayNote, Goal, PersonPage, ResidentConfig, Words } from "./town";

type Extra = "work" | "quote" | "trade" | "gift" | "borrow" | "return" | "reserve" | "speak" | "propose" | "attend";
type Seed = {
  id: string;
  name: Words;
  persona: string;
  aim: string;
  /** What they are already doing at the start. Staying keeps this line. */
  doing: Words;
  /** Morning, afternoon, evening. A reference for where they are usually found, not this hour's place. */
  anchors: [Anchor, Anchor, Anchor];
  goal: Goal;
  extra: Extra[];
  voice?: string;
  temperament?: string;
  /** The one unfinished stake that has their attention. One sentence, naming who, the good, and why it presses. */
  worry?: string;
  opening?: { pages?: { who: string; text: string; met?: PersonPage["met"] }[]; events?: { who: string; text: string; sealed?: boolean; heard?: boolean; bent?: "lie" | "rumor"; about?: string[] }[] };
};

const base: Ability[] = [
  { action: "stay" }, { action: "go" }, { action: "talk" }, { action: "plan" },
  { action: "sign" }, { action: "exit" }, { action: "invite" },
  { action: "accept" }, { action: "refuse" }, { action: "deliver" },
];
const can = (...extra: Extra[]): Ability[] => [...base, ...extra.map((action) => ({ action }))];
/** The loop still stores a line in both slots. This config writes the same English sentence into each. */
const line = (text: string): Words => [text, text];

/** One false claim. Dani told it. June only heard it. Samira's batch is still in her bag. */
const soldOn = "Samira sold the tomato batch Samira was holding for June.";
const stillHere = "The tomato batch is still with Samira, and Samira promised to hold it for June.";

const seeds: Seed[] = [
  {
    id: "owen",
    name: ["欧文", "Owen"],
    persona: "Carpenter gathering material for a larger workshop. Knows the real labor hours and the missing tools. Keeps this rule: he cannot walk away from an order whose materials were already received.",
    aim: "Gather the materials to expand the workshop and set the work himself.",
    doing: ["欧文在攒工坊扩建要用的材料。", "Owen is gathering material to expand the workshop."],
    anchors: [{ scene: "harbor", at: { x: 680, y: 540 } }, { scene: "path", at: { x: 360, y: 480 } }, { scene: "coast", at: { x: 600, y: 600 } }],
    goal: { scene: "coast", who: "idris", intent: "Gather the materials to expand the workshop." },
    extra: ["work", "quote", "trade", "gift", "borrow", "return", "reserve"],
    voice: "He does not promise a schedule before the materials are in.",
    temperament: "He stays with the work once he has started it, and being slower than someone else begins to feel like a slight.",
    worry: "Theo still has Owen's plane, and Owen's workshop stays short of the plane.",
  },
  {
    id: "mara",
    name: ["玛拉", "Mara"],
    persona: "Restaurant keeper who needs steady customers. Knows the orders and the flow of guests. Keeps this rule: she does not serve a meal that has turned.",
    aim: "Finish the meal orders and keep a steady set of customers.",
    doing: ["玛拉在张罗下一单供餐，想留住稳定的客人。", "Mara is lining up the next meal service and the customers who stay."],
    anchors: [{ scene: "station", at: { x: 565, y: 685 } }, { scene: "courtyard", at: { x: 365, y: 500 } }, { scene: "market", at: { x: 560, y: 650 } }],
    goal: { scene: "market", who: "luis", intent: "Finish the meal orders." },
    extra: ["work", "quote", "trade", "gift", "reserve"],
    voice: "If a meal has turned, she does not send it out.",
    temperament: "She likes a price that leaves the other person a little short, and she enjoys it more when they cannot walk away.",
    worry: "Mara's fish will waste unsold, and Luis brought the off-season crop.",
    opening: {
      pages: [{ who: "luis", text: "Luis brings Mara the off-season crop. Mara still needs fish." }],
    },
  },
  {
    id: "samira",
    name: ["萨米拉", "Samira"],
    persona: "Grower racing a harvest that will not keep. Knows when it ripens and how much is actually there. Keeps this rule: after she promises to hold produce, she does not sell that same batch again.",
    aim: "Sell the harvest before it turns, and find a buyer who stays.",
    doing: ["萨米拉在找人接走快过期的收成。", "Samira is looking for someone to take the harvest before it turns."],
    anchors: [{ scene: "market", at: { x: 550, y: 430 } }, { scene: "chapel", at: { x: 600, y: 400 } }, { scene: "dock", at: { x: 505, y: 450 } }],
    goal: { scene: "dock", who: "june", intent: "Sell the harvest before it turns." },
    extra: ["work", "quote", "trade", "gift"],
    voice: "She counts the stock herself and does not change the number because of a rumor.",
    temperament: "Once the promise is out, she keeps to that sentence.",
    worry: "June has not taken Samira's tomato batch, and the batch will turn.",
    opening: {
      pages: [{ who: "june", text: "Samira promised to hold the tomato batch for June, and June is still waiting.", met: "familiar" }],
    },
  },
  {
    id: "dani",
    name: ["丹妮", "Dani"],
    persona: "Buyer who stays necessary by delivering on time. Knows which transport notices and batches she already has. Keeps this rule: goods that have been accepted must be settled.",
    aim: "Finish reliable deliveries and keep her place as the person others go through.",
    doing: ["丹妮在跑一件必须按时送到的货。", "Dani is carrying a delivery that has to arrive on time."],
    anchors: [{ scene: "garden", at: { x: 430, y: 510 } }, { scene: "chapel", at: { x: 355, y: 405 } }, { scene: "courtyard", at: { x: 540, y: 480 } }],
    goal: { scene: "chapel", who: "samira", intent: "Finish a reliable delivery." },
    extra: ["work", "quote", "trade", "gift"],
    voice: "She is still here while people still take what she carries.",
    temperament: "She does not mind if the version that keeps her in the middle makes someone else look careless, and a deal that skips her feels like a theft.",
    worry: "A handoff that skips Dani leaves June's tomato account out of Dani's hands.",
    opening: {
      pages: [{ who: "june", text: "Dani stays necessary by being the one June still hears from.", met: "familiar" }],
      events: [{ who: "june", text: soldOn, bent: "rumor", about: ["samira"] }],
    },
  },
  {
    id: "gabriel",
    name: ["加布里埃尔", "Gabriel"],
    persona: "Priest who mediates and does not run the town. Knows the worries people choose to tell him, and that those words are confidential. Keeps this rule: he does not repeat a private confidence, and he does not use faith to force support.",
    aim: "Hold a chapel gathering and shared care, and have the mediation recognized.",
    doing: ["加布里埃尔在张罗一场能让人坐下的教堂活动。", "Gabriel is arranging a chapel gathering where people can sit together."],
    anchors: [{ scene: "chapel", at: { x: 475, y: 315 } }, { scene: "hill", at: { x: 600, y: 500 } }, { scene: "chapel", at: { x: 475, y: 315 } }],
    goal: { scene: "chapel", who: "nell", intent: "Hold a chapel gathering and shared care." },
    extra: ["speak", "attend", "propose", "gift"],
    voice: "A thing said in private stops with him.",
    temperament: "He would rather leave a person as they seem than decide they meant harm, and he likes being the one they choose to tell.",
    worry: "Gabriel's chapel gathering still has nobody seated.",
    opening: {
      pages: [{ who: "nell", text: "Nell chose Gabriel to hear what worries Nell about the chapel gathering." }],
      events: [{ who: "nell", text: "Nell worries Gabriel's chapel gathering may have nobody there.", sealed: true }],
    },
  },
  {
    id: "avery",
    name: ["艾弗里", "Avery"],
    persona: "Newcomer looking for a first real cooperation. Knows her own free hours and what she has seen herself. Keeps this rule: she does not claim someone else's labor.",
    aim: "Finish a first cooperation and find steady work and a place here.",
    doing: ["艾弗里在等第一次能和别人一起做成的事。", "Avery is waiting for a first piece of work done with someone else."],
    anchors: [{ scene: "station", at: { x: 520, y: 490 } }, { scene: "market", at: { x: 650, y: 520 } }, { scene: "dock", at: { x: 560, y: 450 } }],
    goal: { scene: "dock", who: "june", intent: "Finish a first cooperation." },
    extra: ["work", "propose", "attend"],
    voice: "She just arrived and wants one piece of work done with someone else.",
    temperament: "She is still hoping to be included, and someone who already has a place here makes a closed door sharper.",
    worry: "Avery still has no work with June, and June's place stays closed.",
  },
  {
    id: "theo",
    name: ["西奥", "Theo"],
    persona: "Repairer building a reputation one tool at a time.",
    aim: "Finish tool repairs and build a reputation of his own.",
    doing: ["西奥在等下一件需要他亲手修的工具。", "Theo is waiting for the next tool that needs his hands."],
    anchors: [{ scene: "cafe", at: { x: 579, y: 330 } }, { scene: "cafe", at: { x: 579, y: 330 } }, { scene: "harbor", at: { x: 500, y: 640 } }],
    goal: { scene: "cafe", who: "owen", intent: "Finish a tool repair." },
    extra: ["work", "borrow", "return"],
    voice: "While a thing is still in his hands, he does not call it repaired.",
    temperament: "He is slow to hand a tool back, and praise for another pair of hands sits worse than the delay.",
    worry: "Owen is waiting, and Theo still has not handed Owen the plane.",
    opening: {
      pages: [{ who: "owen", text: "Owen is waiting on Theo's plane, and Theo has not handed the plane to Owen." }],
    },
  },
  {
    id: "june",
    name: ["琼", "June"],
    persona: "Stall keeper trying to hold a regular pitch.",
    aim: "Sell the prepared food and keep a stall she can count on.",
    doing: ["琼在争一个能稳定出摊的位置。", "June is trying to hold a stall she can keep."],
    anchors: [{ scene: "workshop", at: { x: 510, y: 358 } }, { scene: "workshop", at: { x: 510, y: 358 } }, { scene: "dock", at: { x: 370, y: 490 } }],
    goal: { scene: "dock", who: "samira", intent: "Keep a stall she can count on." },
    extra: ["work", "quote", "trade", "gift", "reserve"],
    voice: "She keeps two accounts apart and does not smooth them over.",
    temperament: "When I hear two accounts, I see the person more coldly.",
    worry: "Samira's tomato account and Dani's tomato account still do not agree.",
    opening: {
      pages: [
        { who: "samira", text: "June trusts Samira less because Samira's tomato account and Dani's tomato account do not agree.", met: "familiar" },
        { who: "dani", text: "Dani passed June an account of Samira that June did not see." },
      ],
      events: [
        { who: "samira", text: stillHere, heard: true },
        { who: "dani", text: soldOn, heard: true, about: ["samira"] },
      ],
    },
  },
  {
    id: "idris",
    name: ["伊德里斯", "Idris"],
    persona: "Hauler looking for the next short handoff.",
    aim: "Finish short handoffs and find more work carrying things.",
    temperament: "Once the load is already on him, he treats the agreed price as a start, and he resents the thanks going to whoever arranged it.",
    worry: "Idris has no next load, and Ruth's last handoff paid him no thanks.",
    doing: ["伊德里斯在找下一趟短途交接。", "Idris is looking for the next short haul."],
    anchors: [{ scene: "gym", at: { x: 443, y: 380 } }, { scene: "gym", at: { x: 443, y: 380 } }, { scene: "coast", at: { x: 670, y: 580 } }],
    goal: { scene: "coast", who: "ruth", intent: "Finish a short handoff." },
    extra: ["work", "trade"],
  },
  {
    id: "ruth",
    name: ["露丝", "Ruth"],
    persona: "Warehouse keeper filling empty storage.",
    aim: "Take storage commissions and keep the warehouse in use.",
    doing: ["露丝在看还有没有空仓可以接保管。", "Ruth is checking whether the warehouse has room for another commission."],
    anchors: [{ scene: "dock", at: { x: 390, y: 350 } }, { scene: "dock", at: { x: 390, y: 350 } }, { scene: "coast", at: { x: 520, y: 650 } }],
    goal: { scene: "dock", who: "idris", intent: "Take a storage commission." },
    extra: ["work", "reserve", "trade", "gift"],
    voice: "She accepts a delivery when it is complete, and not before.",
    temperament: "She waits until a thing is finished before she treats it as settled, and she likes being the one who can still say no.",
    worry: "Ruth's warehouse is still empty, and Idris has brought no goods to store.",
    opening: {
      pages: [{ who: "idris", text: "Ruth and Idris finished the last short handoff.", met: "familiar" }],
    },
  },
  {
    id: "luis",
    name: ["路易斯", "Luis"],
    persona: "Garden supplier opening a second outlet.",
    aim: "Deliver the off-season crop and open another way to sell it.",
    doing: ["路易斯在为错期的作物另找一条销路。", "Luis is opening another outlet for the off-season crop."],
    anchors: [{ scene: "grocery", at: { x: 552, y: 376 } }, { scene: "grocery", at: { x: 552, y: 376 } }, { scene: "market", at: { x: 690, y: 650 } }],
    goal: { scene: "market", who: "mara", intent: "Open another way to sell the crop." },
    extra: ["work", "quote", "trade", "gift"],
    voice: "This crop does not fit her menu, so he looks for another place to take it.",
    temperament: "He will talk a tired crop into sounding better than it is, and a fresher stall getting his crowd bites.",
    worry: "Mara needs fish, so Luis's off-season crop still has nowhere to go.",
    opening: {
      pages: [{ who: "mara", text: "Mara needs fish. Luis still has the off-season crop." }],
    },
  },
  {
    id: "nell",
    name: ["内尔", "Nell"],
    persona: "Organizer who only counts people who actually arrive.",
    aim: "Hold a gathering that people actually attend.",
    doing: ["内尔在约人来一场真的有人到场的交流。", "Nell is inviting people to a meeting they will actually attend."],
    anchors: [{ scene: "secondhand", at: { x: 510, y: 380 } }, { scene: "secondhand", at: { x: 510, y: 380 } }, { scene: "courtyard", at: { x: 350, y: 500 } }],
    goal: { scene: "courtyard", who: "dani", intent: "Hold a gathering people attend." },
    extra: ["reserve", "speak", "attend", "propose"],
    voice: "If a person does not arrive, she does not count the gathering.",
    temperament: "When someone fails to come, she likes the room to notice, and a full room gathered by someone else bites the same way.",
    worry: "Dani has not come, and Nell's gathering still has no one to notice.",
    opening: {
      pages: [{ who: "dani", text: "Dani is someone whose absence Nell wants the room to notice." }],
      events: [{ who: "dani", text: "Dani said Dani would come to Nell's gathering, and Nell has not seen Dani." }],
    },
  },
];

/** The activity a new town starts with. The map shows this until a later hour writes a new one. */
export function harborDoings(): Record<string, Words> {
  return Object.fromEntries(seeds.map((seed) => [seed.id, seed.doing]));
}

/** Morning, afternoon, and evening places for the harbor cast. The map reads these same points. */
export function harborAnchors(): Record<string, [Anchor, Anchor, Anchor]> {
  return Object.fromEntries(seeds.map((seed) => [seed.id, seed.anchors]));
}

/** Harbor residents, including the base schedule and the memory a new town starts with. */
export function harborResidents(): ResidentConfig[] {
  return seeds.map((seed) => {
    const anchors = seed.anchors;
    const opening = seed.opening ? {
      pages: seed.opening.pages?.map((item): PersonPage => ({ who: item.who, met: item.met ?? "once", view: line(item.text), about: [item.who] })),
      events: seed.opening.events?.map((item): DayNote => ({ who: item.who, text: line(item.text), ...(item.sealed ? { sealed: true } : {}), ...(item.heard ? { heard: true } : {}), ...(item.bent ? { bent: item.bent } : {}), ...(item.about ? { about: item.about } : {}) })),
    } : undefined;
    return {
      id: seed.id,
      name: seed.name,
      persona: seed.persona,
      aim: seed.aim,
      doing: seed.doing,
      voice: seed.voice ?? "",
      temperament: seed.temperament ? line(seed.temperament) : undefined,
      worry: seed.worry ? line(seed.worry) : undefined,
      anchors,
      goal: seed.goal,
      can: can(...seed.extra),
      sees: ["people"],
      opening,
    };
  });
}
