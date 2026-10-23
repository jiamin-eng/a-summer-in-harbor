import { test } from "node:test";
import assert from "node:assert/strict";
import { createNpcTown, eventsForPage, type Ability, type NpcIntent, type NpcView, type ResidentConfig } from "../src/npc/town";
import { npcActionQuestion, npcChangeInput, npcChangeQuestion, npcChatActQuestion, npcChatLineMessages, npcChatReplyQuestion, npcDecisionInput, npcDeedQuestion, npcDecisionMessages, npcMoveQuestion, npcRewritePageMessages, npcRewriteSelfMessages, npcRewriteWorryMessages, parseNpcDecision } from "../src/npc/model";
import { emptyLedger } from "../src/npc/society";
import { presenceRounds } from "../src/npc/presence";
import { samplePredicate } from "../src/npc/ports";
import { choiceDrawn, choiceNamed, decisionAnswers, decisionRequest } from "../src/npc/ports";
import { harborScheduleDecide } from "../src/npc/harbor-cast";
import { residentActivity, residentHere } from "../src/world/residents";
import { townScenes } from "../src/npc/places";
import "../src/world/data";

const everyday: Ability[] = [{ action: "stay" }, { action: "go" }, { action: "talk" }, { action: "plan" }];
const residents: ResidentConfig[] = [
  { id: "luis", name: "Luis", persona: "keeps the grocery", anchors: [{ scene: "grocery", at: { x: 10, y: 20 } }, { scene: "market", at: { x: 30, y: 40 } }], goal: { scene: "market", who: "samira", intent: "找人谈谈今天的菜" }, can: everyday },
  { id: "samira", name: "Samira", persona: "cooks and hums", anchors: [{ scene: "market", at: { x: 32, y: 40 } }, { scene: "dock", at: { x: 8, y: 8 } }], goal: { scene: "market", who: null, intent: "在集市听一会儿" }, can: everyday },
];

test("a resident only moves to an anchor and then talks once", () => {
  const town = createNpcTown({ residents, minute: 540, minutesPerTick: 60 });
  const first = town.tick();
  assert.deepEqual(first.moves, [{ id: "luis", scene: "market", at: { x: 30, y: 40 } }]);
  assert.equal(first.accepted.some((item) => item.action.type === "talk"), false);
  town.tick();
  const state = town.state();
  const luis = state.residents.find((resident) => resident.id === "luis");
  assert.equal(luis?.pages.length, 1);
  assert.equal(luis?.pages[0]?.who, "samira");
  assert.equal(luis?.pages[0]?.met, "once");
  assert.equal(luis?.pages[0]?.view, null);
  assert.match(luis?.events[0]?.text[0] ?? "", /Samira/);
  const samira = state.residents.find((resident) => resident.id === "samira");
  assert.equal(samira?.pages.length, 1);
  assert.equal(samira?.pages[0]?.who, "luis");
  assert.equal("relations" in state, false);
  const next = town.tick();
  assert.ok(!next.accepted.some((item) => item.action.type === "talk"));
  const planned = town.state().residents.find((resident) => resident.id === "luis");
  assert.equal(planned?.goal.scene, "market");
  assert.equal(planned?.goal.intent, "找人谈谈今天的菜");
  assert.equal(planned?.scene, "market");
});

test("a model choice outside the town is dropped", () => {
  const decide = (): NpcIntent => ({ type: "go", scene: "nowhere" });
  const town = createNpcTown({ residents: [residents[0]], decide });
  const tick = town.tick();
  assert.equal(tick.accepted.length, 0);
  assert.equal(tick.rejected[0].reason, "NPC_SCENE");
  assert.equal(town.state().residents[0].scene, "grocery");
});

test("a new plan must name a place in town", () => {
  const town = createNpcTown({
    residents: [residents[1]],
    decide: (): NpcIntent => ({ type: "plan", scene: "nowhere" }),
  });
  const tick = town.tick();
  assert.equal(tick.rejected[0].reason, "NPC_SCENE");
  assert.equal(town.state().residents[0].goal.scene, "market");
});

test("a game-chat reply updates the plan, the spoken lines, and the next prompt", async () => {
  const pair: ResidentConfig[] = [
    { ...residents[0], anchors: [residents[0].anchors[1], residents[0].anchors[0]], goal: { scene: "market", who: "samira", intent: "找人谈谈今天的菜" } },
    residents[1],
  ];
  const town = createNpcTown({ residents: pair, minute: 540 });
  const prompts: string[] = [];
  const choose = async (view: NpcView) => {
    const messages = npcDecisionMessages(view);
    prompts.push(messages[1].content);
    assert.equal(messages[0].role, "system");
    assert.equal(messages[1].role, "user");
    if (view.me.id !== "luis") return { type: "stay" } as const;
    if (!(view.events ?? []).length) return parseNpcDecision(JSON.stringify({ type: "talk", who: "samira", scene: null, lines: ["今天的番茄还够煮一锅。", "There are enough tomatoes for one more pot."] }));
    return parseNpcDecision(JSON.stringify({ type: "plan", scene: "grocery", lines: null }));
  };
  const first = await town.commit(choose);
  assert.equal(first.accepted.find((item) => item.id === "luis")?.action.type, "talk");
  const samiraPage = town.state().residents.find((resident) => resident.id === "samira")?.pages[0];
  assert.equal(samiraPage?.view, null);
  assert.equal(samiraPage?.met, "once");
  assert.match(town.state().residents.find((resident) => resident.id === "samira")?.events[0]?.text[0] ?? "", /番茄/);
  const second = await town.commit(choose);
  assert.equal(second.accepted.find((item) => item.id === "luis")?.action.type, "plan");
  const luis = town.state().residents.find((resident) => resident.id === "luis");
  assert.equal(luis?.goal.scene, "market");
  assert.equal(luis?.goal.intent, "找人谈谈今天的菜");
  assert.equal(luis?.scene, "grocery");
  assert.match(prompts[2], /番茄/);
  assert.match(prompts[2], /"who":"samira"/);
  assert.equal(prompts[2].includes('"trust"'), false);
  assert.equal(prompts[2].includes('"bonds"'), false);
});

test("an action or place missing from that resident's config is dropped", () => {
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "listens for birds", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "coast", at: { x: 2, y: 2 } }], goal: { scene: "coast", who: null, intent: "听鸟" }, can: [{ action: "stay" }, { action: "go", scenes: ["coast"] }, { action: "listen", scenes: ["coast"] }] };
  const blocked = createNpcTown({ residents: [owen], decide: (): NpcIntent => ({ type: "fish" }) });
  assert.equal(blocked.tick().rejected[0].reason, "NPC_ABILITY");
  const away = createNpcTown({ residents: [owen], decide: (): NpcIntent => ({ type: "listen" }) });
  assert.equal(away.tick().rejected[0].reason, "NPC_ABILITY");
  const offRoute = createNpcTown({ residents: [owen], decide: (): NpcIntent => ({ type: "go", scene: "harbor" }) });
  assert.equal(offRoute.tick().rejected[0].reason, "NPC_SCENE");
  const there = createNpcTown({ residents: [{ ...owen, anchors: [{ scene: "coast", at: { x: 2, y: 2 } }, { scene: "harbor", at: { x: 1, y: 1 } }] }], decide: (): NpcIntent => ({ type: "listen" }) });
  assert.equal(there.tick().accepted[0].action.type, "listen");
});

test("a notice is seen this hour and is not kept as a document", async () => {
  const coast = [{ scene: "coast", at: { x: 1, y: 1 } }, { scene: "harbor", at: { x: 2, y: 2 } }];
  const can: Ability[] = [{ action: "stay" }, { action: "go" }];
  const pair: ResidentConfig[] = [
    { id: "owen", name: "Owen", persona: "listens", anchors: coast, goal: { scene: "coast", who: null, intent: "听鸟" }, can, sees: ["birds"], knows: [["海岸上的叫声能分成几种。", "Calls fall into a few kinds."]], notices: [{ scene: "coast", topic: "birds", text: ["头顶有两种鸟叫。", "Two calls overhead."] }] },
    { id: "ruth", name: "Ruth", persona: "watches shoes", anchors: coast, goal: { scene: "coast", who: null, intent: "看鞋" }, can, sees: ["shoes"], knows: [["草籽说明走过小路。", "Seeds mean a side path."]], notices: [{ scene: "coast", topic: "shoes", text: ["鞋尖有草籽。", "Seeds on the toes."] }] },
  ];
  const town = createNpcTown({ residents: pair, minute: 1080 });
  const first = await town.commit(async (view) => {
    assert.equal((view.events ?? []).length, 0);
    assert.equal(view.seen.notices.length, 1);
    assert.equal(view.seen.people.length, 0);
    return { type: "stay" };
  });
  assert.equal(first.accepted.length, 2);
  assert.equal(town.state().residents.every((resident) => resident.pages.length === 0), true);
  await town.commit(async (view) => {
    assert.equal((view.events ?? []).length, 0);
    assert.equal(view.seen.notices.length, 1);
    return { type: "stay" };
  });
});

test("choice selects an action from the probabilities", () => {
  const view: NpcView = { minute: 540, me: { id: "owen", scene: "harbor", persona: "listens", background: "", voice: "", aim: "听鸟", goal: { scene: "coast", who: null, intent: "听鸟" }, can: [{ action: "stay" }, { action: "go" }, { action: "listen", scenes: ["coast"] }] }, anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "coast", at: { x: 2, y: 2 } }], plan: null, seen: { people: [], notices: [] }, known: [], here: [], talked: [], replannedToday: false, heard: [] };
  const action = npcMoveQuestion(view);
  assert.equal(action.type, "choice");
  if (action.type === "choice") assert.deepEqual(action.choices.map((choice) => choice.value), ["stay", "go"]);
  const request = decisionRequest("facts", [action]);
  assert.equal(request.input, "facts");
  assert.equal(request.questions.length, 1);
  const answers = decisionAnswers({
    answers: [
      { type: "choice", name: "action", choice: "go", probabilities: [{ value: "go", probability: 0.9 }], confidence: 0.8 },
    ],
  });
  assert.equal(choiceNamed(answers, "action"), "go");
  assert.equal(choiceDrawn(answers, "action", () => 0), "go");
  const skewed = decisionAnswers({
    answers: [{ type: "choice", name: "deed", choice: "nothing", probabilities: [{ value: "nothing", probability: 0.8 }, { value: "quote", probability: 0.2 }] }],
  });
  assert.equal(choiceDrawn(skewed, "deed", () => 0), "nothing");
  assert.equal(choiceDrawn(skewed, "deed", () => 0.95), "quote");
  const bare = decisionAnswers({ answers: [{ type: "choice", name: "move", choice: "stay" }] });
  assert.equal(choiceDrawn(bare, "move", () => 0.95), "stay");
  const shared = decisionAnswers({ answers: [{ type: "predicate", name: "share", probability: 0.2 }] });
  const predicate = shared.find((item) => item.name === "share");
  if (predicate?.type === "predicate") {
    assert.equal(samplePredicate(predicate.probability, () => 0.1), true);
    assert.equal(samplePredicate(predicate.probability, () => 0.95), false);
  }
  assert.throws(() => decisionAnswers({ answers: [{ type: "refusal", name: "action" }] }), /NPC_DECIDE/);
});

test("a talk writes one directed page and does not store an importance score", async () => {
  const pair: ResidentConfig[] = [
    { ...residents[0], anchors: [residents[0].anchors[1], residents[0].anchors[0]] },
    residents[1],
  ];
  const town = createNpcTown({ residents: pair, minute: 540 });
  await town.commit(async (view) => view.me.id === "luis" ? { type: "talk", who: "samira" } : { type: "stay" });
  const samira = town.state().residents.find((resident) => resident.id === "samira")?.pages[0];
  const luis = town.state().residents.find((resident) => resident.id === "luis")?.pages[0];
  assert.equal(samira?.who, "luis");
  assert.equal(samira?.view, null);
  assert.equal(luis?.who, "samira");
  assert.equal(JSON.stringify(town.state()).includes("importance"), false);
});

test("a later meeting rewrites that person's page, and the other person does not receive a private sight", async () => {
  const coast = [{ scene: "coast", at: { x: 1, y: 1 } }];
  const can: Ability[] = [{ action: "stay" }, { action: "talk" }, { action: "listen", scenes: ["coast"] }];
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "listens", anchors: coast, goal: { scene: "coast", who: "ruth", intent: "听鸟" }, can };
  const ruth: ResidentConfig = { id: "ruth", name: "Ruth", persona: "watches", anchors: coast, goal: { scene: "coast", who: null, intent: "看鞋" }, can: [{ action: "stay" }] };
  const town = createNpcTown({ residents: [owen, ruth], minute: 1080, decide: () => ({ type: "stay" }) });
  await town.commit(async (view) => view.me.id === "owen" ? { type: "talk", who: "ruth", lines: ["第一种鸟叫像哨子。", "The first call is a whistle."] } : { type: "stay" });
  await town.commit(async (view) => view.me.id === "owen" ? { type: "listen", lines: ["只有我听见的第三声。", "A third call only I heard."] } : { type: "stay" });
  const first = town.state().residents.find((resident) => resident.id === "owen")?.pages[0];
  assert.equal(first?.met, "once");
  assert.equal(first?.view, null);
  assert.match(town.state().residents.find((resident) => resident.id === "owen")?.events[0]?.text[0] ?? "", /哨子/);
  assert.equal(town.state().residents.find((resident) => resident.id === "ruth")?.events.some((event) => event.text[0].includes("第三声")), false);
  await town.seek(1080 + 1440);
  await town.commit(async (view) => {
    if (view.me.id === "ruth") assert.equal((view.events ?? []).some((item) => item.text[0].includes("哨子")), false);
    return view.me.id === "owen" ? { type: "talk", who: "ruth", lines: ["其实是海鸥。", "It was gulls."] } : { type: "stay" };
  });
  const page = town.state().residents.find((resident) => resident.id === "owen")?.pages[0];
  assert.equal(page?.met, "familiar");
  assert.equal(page?.view, null);
  assert.match(town.state().residents.find((resident) => resident.id === "owen")?.events.at(-1)?.text[0] ?? "", /海鸥/);
  const text = town.transcript("owen");
  assert.match(text, /身份：listens/);
  assert.match(text, /海鸥/);
  assert.equal(text.includes("归档"), false);
});

test("night rewrites a view and a temperament only when the review says so", async () => {
  const pair: ResidentConfig[] = [
    { ...residents[0], anchors: [residents[0].anchors[1], residents[0].anchors[0]] },
    residents[1],
  ];
  const quiet = createNpcTown({
    residents: pair,
    minute: 1200,
    decide: () => ({ type: "stay" }),
    review: async (facts) => {
      assert.equal(facts.pages.length, 1);
      assert.equal(facts.events.every((event) => event.who === facts.pages[0]?.who), true);
      return { pages: [], temperament: null };
    },
  });
  await quiet.commit(async (view) => view.me.id === "luis" ? { type: "talk", who: "samira", lines: ["一起留过番茄。", "We kept some tomatoes."] } : { type: "stay" });
  await quiet.seek(1260);
  const kept = quiet.state().residents.find((resident) => resident.id === "samira");
  assert.match(kept?.events[0]?.text[0] ?? "", /番茄/);
  assert.equal(kept?.events[0]?.reviewed, true);
  assert.equal(kept?.pages[0]?.view, null);
  assert.equal(quiet.state().residents.find((resident) => resident.id === "samira")?.temperament, undefined);
  const asked: string[] = [];
  const town = createNpcTown({
    residents: pair,
    minute: 1200,
    decide: () => ({ type: "stay" }),
    resume: { residents: [{ id: "samira", scene: "market", goal: residents[1].goal, pages: [{ who: "june", met: "once", view: ["还记得琼。", "June is still in mind."], about: ["june"] }] }] },
    review: async (facts) => {
      asked.push(...facts.pages.map((page) => page.who));
      assert.equal(facts.pages.some((page) => page.who === "june"), false);
      if (!facts.pages.some((page) => page.who === "luis")) return { pages: [], temperament: null };
      return {
        pages: [{ who: "luis", text: ["还想再一起留番茄，也更信他。", "Wants to keep tomatoes again, and trusts him more."] }],
        temperament: ["现在更愿意把菜留给熟人。", "More willing to keep produce for someone known."],
      };
    },
  });
  await town.commit(async (view) => view.me.id === "luis" ? { type: "talk", who: "samira", lines: ["还想再留一次。", "Want to keep some again."] } : { type: "stay" });
  const during = town.state().residents.find((resident) => resident.id === "samira")?.pages.find((page) => page.who === "luis");
  assert.equal(during?.view, null);
  assert.match(town.state().residents.find((resident) => resident.id === "samira")?.events.find((event) => event.who === "luis")?.text[0] ?? "", /再留/);
  await town.seek(1260);
  const page = town.state().residents.find((resident) => resident.id === "samira")?.pages.find((item) => item.who === "luis");
  const other = town.state().residents.find((resident) => resident.id === "samira")?.pages.find((item) => item.who === "june");
  assert.match(town.state().residents.find((resident) => resident.id === "samira")?.events.find((event) => event.who === "luis")?.text[0] ?? "", /再留/);
  assert.equal(town.state().residents.find((resident) => resident.id === "samira")?.events.find((event) => event.who === "luis")?.reviewed, true);
  assert.match(page?.view?.[0] ?? "", /更信/);
  assert.match(other?.view?.[0] ?? "", /琼/);
  assert.match(town.state().residents.find((resident) => resident.id === "samira")?.temperament?.[0] ?? "", /熟人/);
  assert.equal(asked.includes("luis"), true);
  assert.equal(asked.includes("june"), false);
});

test("night replaces a worry only when the review says so, and a settled worry can clear", async () => {
  const pair: ResidentConfig[] = [
    { ...residents[0], anchors: [residents[0].anchors[1], residents[0].anchors[0]] },
    { ...residents[1], worry: ["琼还没取走番茄。", "June has not taken the tomatoes."] },
  ];
  const kept = createNpcTown({
    residents: pair,
    minute: 1200,
    decide: () => ({ type: "stay" }),
    review: async () => ({ pages: [], temperament: null }),
  });
  await kept.commit(async (view) => view.me.id === "luis" ? { type: "talk", who: "samira", lines: ["路过。", "Passing by."] } : { type: "stay" });
  await kept.seek(1260);
  assert.equal(kept.state().residents.find((resident) => resident.id === "samira")?.worry?.[1], "June has not taken the tomatoes.");
  const replaced = createNpcTown({
    residents: pair,
    minute: 1200,
    decide: () => ({ type: "stay" }),
    review: async () => ({ pages: [], temperament: null, worry: ["番茄要坏了，琼还没取。", "The tomatoes will turn, and June has not taken them."] }),
  });
  await replaced.commit(async (view) => view.me.id === "luis" ? { type: "talk", who: "samira", lines: ["路过。", "Passing by."] } : { type: "stay" });
  await replaced.seek(1260);
  assert.match(replaced.state().residents.find((resident) => resident.id === "samira")?.worry?.[0] ?? "", /要坏了/);
  const cleared = createNpcTown({
    residents: pair,
    minute: 1200,
    decide: () => ({ type: "stay" }),
    review: async () => ({ pages: [], temperament: null, worry: null }),
  });
  await cleared.commit(async (view) => view.me.id === "luis" ? { type: "talk", who: "samira", lines: ["路过。", "Passing by."] } : { type: "stay" });
  await cleared.seek(1260);
  assert.equal(cleared.state().residents.find((resident) => resident.id === "samira")?.worry, undefined);
});

test("sleep clears today's lines and keeps the standing page", async () => {
  const pair: ResidentConfig[] = [
    { ...residents[0], anchors: [residents[0].anchors[1], residents[0].anchors[0]] },
    residents[1],
  ];
  const town = createNpcTown({ residents: pair, minute: 1200, decide: () => ({ type: "stay" }) });
  await town.commit(async (view) => view.me.id === "luis" ? { type: "talk", who: "samira", lines: ["今天的番茄还够。", "Enough tomatoes today."] } : { type: "stay" });
  assert.ok(town.state().residents.find((resident) => resident.id === "luis")?.events.length);
  await town.seek(1260);
  const state = town.state();
  const page = state.residents.find((resident) => resident.id === "luis")?.pages[0];
  assert.equal(state.residents.find((resident) => resident.id === "luis")?.events.length, 0);
  assert.equal(page?.view, null);
  assert.equal(state.residents[0].plan?.day, 1);
  assert.equal(JSON.stringify(state).includes("embedding"), false);
});

test("a resident keeps the latest 50 events", async () => {
  const coast = [{ scene: "coast", at: { x: 1, y: 1 } }];
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "listens", anchors: coast, goal: { scene: "coast", who: null, intent: "听鸟" }, can: [{ action: "stay" }, { action: "speak" }] };
  const events = Array.from({ length: 51 }, (_, index) => ({ who: "owen", text: [`第${index}件。`, `Event ${index}.`] as [string, string] }));
  const town = createNpcTown({
    residents: [owen],
    minute: 540,
    decide: () => ({ type: "stay" }),
    resume: { residents: [{ id: "owen", scene: "coast", goal: owen.goal, events }] },
  });
  const kept = town.state().residents[0].events;
  assert.equal(kept.length, 50);
  assert.match(kept[0].text[1], /Event 1\./);
  assert.match(kept.at(-1)?.text[1] ?? "", /Event 50\./);
  await town.commit(async () => ({ type: "speak" }));
  const next = town.state().residents[0].events;
  assert.equal(next.length, 50);
  assert.match(next[0].text[1], /Event 2\./);
  assert.match(next.at(-1)?.text[1] ?? "", /unfinished/);
});

test("repeated sights are not kept", async () => {
  const coast = [{ scene: "coast", at: { x: 1, y: 1 } }];
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "listens", anchors: coast, goal: { scene: "coast", who: null, intent: "听鸟" }, can: [{ action: "stay" }, { action: "listen", scenes: ["coast"] }] };
  const town = createNpcTown({ residents: [owen], minute: 60, decide: () => ({ type: "stay" }) });
  for (let index = 0; index < 6; index += 1) {
    await town.commit(async () => ({ type: "listen", lines: [`第${index}声鸟叫。`, `Call ${index}.`] }));
    await town.seek(town.state().minute + 60);
  }
  await town.seek(town.state().minute + 1440);
  assert.equal(town.state().residents[0].pages.length, 0);
  assert.equal(town.transcript("owen").includes("归档"), false);
  assert.equal(JSON.stringify(town.state()).includes("archive"), false);
});

test("the evening anchor is only a reference, and they meet when this hour goes there", async () => {
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "builds", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "path", at: { x: 2, y: 2 } }, { scene: "coast", at: { x: 3, y: 3 } }], goal: { scene: "coast", who: "ruth", intent: "碰头" }, can: everyday };
  const ruth: ResidentConfig = { id: "ruth", name: "Ruth", persona: "stores", anchors: [{ scene: "dock", at: { x: 4, y: 4 } }, { scene: "market", at: { x: 5, y: 5 } }, { scene: "coast", at: { x: 6, y: 6 } }], goal: { scene: "coast", who: "owen", intent: "碰头" }, can: everyday };
  const town = createNpcTown({ residents: [owen, ruth], minute: 1020 });
  const asked: string[] = [];
  const stayed = await town.commit(async (view) => {
    asked.push(view.me.id);
    assert.equal(view.anchors[2]?.scene, "coast");
    return { type: "stay" };
  });
  assert.deepEqual(asked, ["owen", "ruth"]);
  assert.deepEqual(stayed.moves, []);
  assert.equal(town.state().residents.find((resident) => resident.id === "owen")?.scene, "harbor");
  const going = createNpcTown({ residents: [owen, ruth], minute: 1020 });
  const moved = await going.commit(async () => ({ type: "go", scene: "coast" }));
  assert.deepEqual(moved.moves.map((move) => move.scene), ["coast", "coast"]);
  const arrived = createNpcTown({ residents: [owen, ruth], minute: 1080, resume: { residents: going.state().residents } });
  const next: string[] = [];
  const talked = await arrived.commit(async (view) => {
    next.push(view.me.id);
    const who = view.me.goal.who;
    return who && view.seen.people.includes(who) ? { type: "talk", who } : { type: "stay" };
  });
  assert.deepEqual(next, ["owen", "ruth"]);
  assert.equal(talked.accepted.find((item) => item.id === "owen")?.action.type, "talk");
});

test("every resident is asked once, including one who is not with the player", async () => {
  const calls: string[] = [];
  const town = createNpcTown({
    residents,
    minute: 540,
    decide: () => ({ type: "stay" }),
  });
  await town.commit(async (view) => {
    calls.push(view.me.id);
    return { type: "stay" };
  }, "grocery");
  assert.deepEqual(calls, ["luis", "samira"]);
});

test("choosing a place moves them there now", async () => {
  const wide: ResidentConfig = { id: "owen", name: "Owen", persona: "builds", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "path", at: { x: 2, y: 2 } }, { scene: "coast", at: { x: 3, y: 3 } }], goal: { scene: "coast", who: null, intent: "攒材料" }, can: [{ action: "stay" }, { action: "plan" }] };
  const town = createNpcTown({ residents: [wide], minute: 540 });
  const first = await town.commit(async () => ({ type: "plan", scene: "path" }));
  assert.deepEqual(first.moves, [{ id: "owen", scene: "path", at: { x: 2, y: 2 } }]);
  const second = await town.commit(async () => ({ type: "plan", scene: "coast" }));
  assert.deepEqual(second.moves, [{ id: "owen", scene: "coast", at: { x: 3, y: 3 } }]);
  assert.equal(town.state().residents[0].scene, "coast");
  assert.equal(town.state().residents[0].goal.intent, "攒材料");
});

test("a resident away from the player can change a step", async () => {
  const asked: string[] = [];
  const town = createNpcTown({ residents, minute: 540, decide: () => ({ type: "stay" }) });
  await town.commit(async (view) => {
    asked.push(view.me.id);
    return view.me.id === "samira" ? { type: "plan", scene: "dock" } : { type: "stay" };
  }, "grocery");
  assert.deepEqual(asked, ["luis", "samira"]);
  const samira = town.state().residents.find((resident) => resident.id === "samira");
  assert.equal(samira?.goal.scene, "market");
  assert.equal(samira?.goal.intent, "在集市听一会儿");
  assert.equal(samira?.scene, "dock");
  assert.equal(town.state().residents.find((resident) => resident.id === "luis")?.scene, "grocery");
});

test("a chosen place is where they stand, and the next hour uses the day route", async () => {
  const town = createNpcTown({ residents: [residents[1]], minute: 540, decide: harborScheduleDecide });
  const moved = await town.commit(async () => ({ type: "plan", scene: "dock" }));
  assert.deepEqual(moved.moves, [{ id: "samira", scene: "dock", at: { x: 8, y: 8 } }]);
  const walked = createNpcTown({ residents: [residents[1]], minute: 540, decide: harborScheduleDecide, resume: { residents: town.state().residents } });
  assert.deepEqual(walked.tick().moves, [{ id: "samira", scene: "market", at: { x: 32, y: 40 } }]);
});

test("Owen and Ruth keep the published places and remember the evening meeting", () => {
  const clock = { townMinutes: 540, scene: "harbor", flags: [] as string[], known: [] as string[] };
  assert.equal(residentHere(clock, "owen", "harbor"), true);
  assert.equal(residentHere(clock, "ruth", "dock"), true);
  assert.match(residentActivity(clock, "owen")![0], /材料/);
  const evening = { ...clock, townMinutes: 1080, scene: "coast" };
  assert.equal(residentHere(evening, "owen", "coast"), true);
  assert.equal(residentHere(evening, "ruth", "coast"), true);
  assert.equal(residentHere({ ...evening, townMinutes: 1300 }, "owen", "coast"), false);
  assert.match(residentActivity(evening, "owen")![0], /伊德里斯|材料/);
  assert.match(residentActivity(evening, "ruth")![0], /伊德里斯|保管/);
});

test("a resident can speak to the player once when they share the scene", async () => {
  const owen: ResidentConfig = { id: "owen", name: ["欧文", "Owen"], persona: "listens", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }], goal: { scene: "harbor", who: null, intent: "分清鸟叫" }, can: [{ action: "stay" }, { action: "talk" }], sees: ["people"] };
  const town = createNpcTown({ residents: [owen], minute: 540 });
  const greeted = await town.commit(async (view) => {
    assert.ok(view.seen.people.includes("player"));
    assert.ok(view.here.includes("player"));
    return { type: "talk", who: "player" };
  }, "harbor");
  assert.equal(greeted.accepted[0]?.action.type, "talk");
  const said = town.state().residents[0].pages[0];
  assert.equal(said?.who, "player");
  assert.equal(said?.met, "once");
  assert.equal(said?.view, null);
  assert.match(town.state().residents[0].events[0]?.text[0] ?? "", /和玩家说起「分清鸟叫」/);
  assert.equal("relations" in town.state(), false);
  const again = await town.commit(async () => ({ type: "talk", who: "player" }), "harbor");
  assert.equal(again.rejected[0]?.reason, "NPC_ALREADY_TALKED");
  const away = createNpcTown({ residents: [owen], minute: 540 });
  const missed = await away.commit(async () => ({ type: "talk", who: "player" }));
  assert.equal(missed.rejected[0]?.reason, "NPC_APART");
  assert.equal(away.state().residents[0].pages[0]?.who, "player");
  assert.equal(away.state().residents[0].pages[0]?.view, null);
  assert.match(away.state().residents[0].events[0]?.text[0] ?? "", /欧文和玩家因为不在一处，分清鸟叫还没了结/);
});

test("choosing someone else's shop moves them there now", async () => {
  const owen: ResidentConfig = { id: "owen", name: ["欧文", "Owen"], persona: "builds", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "path", at: { x: 2, y: 2 } }, { scene: "coast", at: { x: 3, y: 3 } }], goal: { scene: "coast", who: "idris", intent: "交接材料" }, can: everyday };
  const theo: ResidentConfig = { id: "theo", name: ["西奥", "Theo"], persona: "repairs", anchors: [{ scene: "cafe", at: { x: 9, y: 9 } }, { scene: "harbor", at: { x: 4, y: 4 } }], goal: { scene: "cafe", who: "owen", intent: "修好工具" }, can: everyday };
  const town = createNpcTown({ residents: [owen, theo], minute: 540, converse: async () => [] });
  const planned = await town.commit(async (view) => {
    if (view.me.id !== "owen") return { type: "stay" };
    assert.ok(view.places?.some((place) => place.scene === "cafe" && place.host === "theo" && place.kind === "shop"));
    return { type: "plan", scene: "cafe" };
  });
  assert.deepEqual(planned.moves, [{ id: "owen", scene: "cafe", at: { x: 9, y: 9 } }]);
  assert.equal(town.state().residents.find((resident) => resident.id === "owen")?.scene, "cafe");
  assert.equal(town.state().residents.find((resident) => resident.id === "theo")?.scene, "cafe");
  assert.equal(town.state().residents.every((resident) => resident.pages.length === 0), true);
});

test("a plan can use any scene in town", async () => {
  const light = townScenes().find((place) => place.scene === "lighthouse");
  assert.ok(light);
  assert.ok(townScenes().some((place) => place.scene === "home"));
  assert.ok(townScenes().some((place) => place.scene === "chapel"));
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "builds", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "path", at: { x: 2, y: 2 } }, { scene: "coast", at: { x: 3, y: 3 } }], goal: { scene: "coast", who: null, intent: "去灯塔看看" }, can: everyday };
  const town = createNpcTown({ residents: [owen], minute: 540 });
  await town.commit(async (view) => {
    assert.ok(view.places?.some((place) => place.scene === "lighthouse" && place.kind === "town"));
    assert.ok(view.places?.some((place) => place.scene === "beach"));
    return { type: "plan", scene: "lighthouse" };
  });
  assert.equal(town.state().residents[0].scene, "lighthouse");
});

test("a gift is this hour's own action and waits for the recipient's later hour", async () => {
  const meeting: NpcView = { minute: 540, me: { id: "samira", scene: "market", persona: "grows", background: "", voice: "", aim: "卖菜", goal: { scene: "market", who: "june", intent: "卖菜" }, can: [{ action: "talk" }, { action: "plan" }, { action: "gift" }, { action: "trade" }] }, anchors: [], plan: null, seen: { people: [], notices: [] }, known: [], here: [], talked: [], replannedToday: false, heard: [], limits: { may: ["message", "gift"], mayNot: [{ action: "trade", reason: "NPC_TERMS" }], playerMay: [], playerMayNot: [] } };
  const during = npcDeedQuestion(meeting);
  if (during?.type === "choice") assert.deepEqual(during.choices.map((choice) => choice.value), ["nothing", "gift"]);
  const replyView: NpcView = { ...meeting, me: { ...meeting.me, can: [{ action: "stay" }, { action: "go" }, { action: "work" }, { action: "accept" }, { action: "refuse" }, { action: "sign" }] }, limits: { may: ["wait", "move", "work", "accept", "refuse", "sign"], mayNot: [], playerMay: [], playerMayNot: [] } };
  const waiting = npcActionQuestion({ ...replyView, reply: { kind: "gift", id: "gift-1", from: "samira", answer: "yes-no" } });
  if (waiting.type === "choice") {
    assert.deepEqual(waiting.choices.map((choice) => choice.value), ["accept", "refuse"]);
    assert.match(waiting.choices.map((choice) => choice.description).join(" "), /gift/);
  }
  const reserved = npcActionQuestion({ ...replyView, reply: { kind: "reserve", id: "request-1", from: "mara", answer: "yes-no" } });
  const invited = npcActionQuestion({ ...replyView, reply: { kind: "invite", id: "meet-1", from: "luis", answer: "yes-no" } });
  for (const question of [reserved, invited]) {
    if (question.type !== "choice") continue;
    assert.deepEqual(question.choices.map((choice) => choice.value), ["accept", "refuse"]);
    assert.equal(question.choices.some((choice) => /gift/i.test(choice.description)), false);
  }
  if (reserved.type === "choice") assert.match(reserved.choices.map((choice) => choice.description).join(" "), /reservation/);
  if (invited.type === "choice") assert.match(invited.choices.map((choice) => choice.description).join(" "), /invitation/);
  const signing = npcActionQuestion({ ...meeting, me: { ...meeting.me, can: [{ action: "stay" }, { action: "work" }, { action: "sign" }, { action: "refuse" }] }, reply: { kind: "proposal", id: "proposal-1", from: "avery", answer: "sign" } });
  if (signing.type === "choice") {
    assert.deepEqual(signing.choices.map((choice) => choice.value), ["sign", "refuse"]);
    assert.match(signing.choices.map((choice) => choice.description).join(" "), /cooperation/);
    assert.equal(signing.choices.some((choice) => /gift/i.test(choice.description)), false);
  }
  const samira: ResidentConfig = { id: "samira", name: "Samira", persona: "grows", anchors: [{ scene: "market", at: { x: 1, y: 1 } }], goal: { scene: "market", who: "june", intent: "卖菜" }, can: [...everyday, { action: "gift" }, { action: "trade" }] };
  const june: ResidentConfig = { id: "june", name: "June", persona: "cooks", anchors: [{ scene: "market", at: { x: 2, y: 2 } }], goal: { scene: "market", who: "samira", intent: "备餐" }, can: [...everyday, { action: "accept" }] };
  const stocked = emptyLedger();
  stocked.bags.samira = { cash: 0, cashLocked: 0, items: { "crop-tomato": { amount: 2, locked: 0 } } };
  const offered = createNpcTown({ residents: [samira, june], minute: 540, resume: { residents: [], society: stocked } });
  await offered.commit(async (view) => view.me.id === "samira" ? { type: "gift" } : { type: "stay" });
  assert.equal(offered.state().society.bags.samira?.items["crop-tomato"]?.amount, 2);
  assert.equal(offered.state().society.bags.samira?.items["crop-tomato"]?.locked, 1);
  assert.equal(offered.state().society.bags.june?.items["crop-tomato"], undefined);
  assert.match(offered.state().residents.find((resident) => resident.id === "samira")?.events.find((event) => event.who === "june")?.text[0] ?? "", /Samira把crop-tomato留给June，June还没接受crop-tomato/);
  const agreed = createNpcTown({ residents: [samira, june], minute: 540, resume: { residents: offered.state().residents, society: offered.state().society } });
  await agreed.commit(async (view) => view.me.id === "june" ? { type: "accept" } : { type: "stay" });
  assert.equal(agreed.state().society.bags.samira?.items["crop-tomato"]?.amount, 1);
  assert.equal(agreed.state().society.bags.june?.items["crop-tomato"]?.amount, 1);
  const owed = createNpcTown({ residents: [samira, june], minute: 540, resume: { residents: [], society: offered.state().society } });
  const skipped = await owed.commit(async (view) => view.me.id === "june" ? { type: "go", scene: "market" } : { type: "stay" });
  assert.equal(skipped.rejected.find((item) => item.id === "june")?.reason, "NPC_REPLY");
  assert.equal(owed.state().society.pendingGifts.length, 1);
  assert.equal(owed.state().society.bags.samira?.items["crop-tomato"]?.locked, 1);
  const blocked = createNpcTown({ residents: [samira, june], minute: 540, resume: { residents: [], society: emptyLedger() } });
  await blocked.commit(async (view) => view.me.id === "samira" ? { type: "trade" } : { type: "stay" });
  assert.equal(blocked.state().society.quotes.length, 0);
  assert.equal(Object.keys(blocked.state().society.bags).length, 0);
  assert.equal(blocked.state().residents.find((resident) => resident.id === "samira")?.pages.length ?? 0, 0);
});

test("arriving asks what they are doing, and that line is what the player can hear", async () => {
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "builds", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "path", at: { x: 2, y: 2 } }, { scene: "coast", at: { x: 3, y: 3 } }], goal: { scene: "coast", who: null, intent: "攒材料" }, can: everyday };
  const town = createNpcTown({
    residents: [owen],
    minute: 540,
    narrate: async (view, scene) => {
      assert.ok(view.anchors.length > 0);
      assert.equal(scene, "lighthouse");
      return ["在灯塔边核对材料。", "Checking materials by the lighthouse."];
    },
  });
  await town.commit(async () => ({ type: "plan", scene: "lighthouse" }));
  assert.equal(town.state().residents[0].scene, "lighthouse");
  assert.deepEqual(town.state().residents[0].doing, ["在灯塔边核对材料。", "Checking materials by the lighthouse."]);
  assert.equal(town.consult("owen")?.doing?.[0], "在灯塔边核对材料。");
  assert.equal(residentActivity({ townMinutes: 540, scene: "lighthouse", flags: [], known: [], npcLoopV1: town.state() }, "owen")?.[0], "在灯塔边核对材料。");
  const later = createNpcTown({ residents: [{ ...owen, can: [{ action: "stay" }] }], minute: 540, resume: { residents: town.state().residents } });
  let next = "";
  await later.commit(async (view) => { next = view.doing?.[0] ?? ""; return { type: "stay" }; });
  assert.equal(next, "在灯塔边核对材料。");
});

test("a solo action is offered without anyone else, and news is still passed when someone is here", async () => {
  const speaker: NpcView = { minute: 540, me: { id: "samira", scene: "market", persona: "grows food", background: "", voice: "", aim: "卖菜", goal: { scene: "market", who: "june", intent: "卖菜" }, can: [{ action: "stay" }, { action: "gift" }, { action: "propose" }] }, anchors: [], plan: null, seen: { people: [], notices: [] }, known: [], events: [{ who: "june", text: ["听说码头缺菜。", "The dock is short of vegetables."] }], here: [], talked: [], replannedToday: false, heard: [], limits: { may: ["wait", "gift", "propose"], mayNot: [], playerMay: [], playerMayNot: [] } };
  const alone = npcDeedQuestion(speaker);
  if (alone?.type === "choice") assert.deepEqual(alone.choices.map((choice) => choice.value), ["nothing", "gift"]);
  const together = npcDeedQuestion({ ...speaker, here: ["june"] });
  if (together?.type === "choice") assert.deepEqual(together.choices.map((choice) => choice.value), ["nothing", "gift", "propose"]);
  const place = npcMoveQuestion(speaker);
  if (place.type === "choice") assert.deepEqual(place.choices.map((choice) => choice.value), ["stay"]);
  const chat = npcChatActQuestion(speaker, "june", [{ id: "e0", text: "The dock is short of vegetables." }]);
  if (chat.type === "choice") assert.deepEqual(chat.choices.map((choice) => choice.value), ["nothing", "relay", "complain", "lie", "rumor", "promise"]);
  const listener = { ...speaker, me: { ...speaker.me, id: "june", persona: "cooks", aim: "备餐" }, events: [] };
  const prompts: string[] = [];
  const rounds = await presenceRounds(async (input, questions) => {
    prompts.push(`${input}\n${questions.map((question) => question.type === "choice" ? question.instructions : "").join(" ")}`);
    const name = questions[0]?.name;
    const offered = questions[0]?.type === "choice" ? questions[0].choices.map((choice) => choice.value) : [];
    if (name === "act") {
      const value = offered.includes("relay") ? "relay" : "nothing";
      return [{ type: "choice" as const, name: "act", choice: value, probabilities: [{ value, probability: 1 }] }];
    }
    if (name === "item") return [{ type: "choice" as const, name: "item", choice: "e0", probabilities: [{ value: "e0", probability: 1 }] }];
    if (name === "reply") return [{ type: "choice" as const, name: "reply", choice: "listen", probabilities: [{ value: "listen", probability: 1 }] }];
    return [{ type: "choice" as const, name: name ?? "act", choice: "nothing", probabilities: [{ value: "nothing", probability: 1 }] }];
  }, async () => ["听说码头缺菜。", "The dock is short of vegetables."], speaker, listener, () => 0);
  assert.equal(rounds[0]?.event, "relay");
  assert.equal(rounds[0]?.who, "samira");
  assert.match(prompts[0], /grows food/);
  assert.match(prompts[0], /听说码头缺菜/);
});

test("a ledger action stays available while they are already occupied", async () => {
  const occupied = ["约了琼核对收成。", "Meeting June to check the harvest."] as [string, string];
  const busy = ["在摊位备餐。", "Preparing the stall."] as [string, string];
  const speaker: NpcView = { minute: 540, me: { id: "samira", scene: "market", persona: "grows food", background: "", voice: "", aim: "卖菜", goal: { scene: "market", who: "june", intent: "卖菜" }, can: [{ action: "stay" }, { action: "gift" }] }, anchors: [], plan: null, doing: occupied, seen: { people: ["dani"], notices: [] }, known: [], here: ["dani"], talked: [], replannedToday: false, heard: [] };
  const facts = JSON.parse(npcDecisionInput(speaker, { id: "dani", doing: busy })) as { doing: [string, string]; company: { id: string; doing: [string, string] } };
  const question = npcDeedQuestion(speaker);
  const prompt = question?.type === "choice" ? question.instructions : "";
  assert.deepEqual(facts.doing, occupied);
  assert.deepEqual(facts.company, { id: "dani", doing: busy });
  assert.match(prompt, /separate from staying or moving/);
  assert.equal(prompt.includes("less likely"), false);
});

test("news about someone who is absent is sampled and can be passed on", async () => {
  const samira: ResidentConfig = { id: "samira", name: ["萨米拉", "Samira"], persona: "grows food", anchors: [{ scene: "market", at: { x: 1, y: 1 } }], goal: { scene: "market", who: null, intent: "卖菜" }, can: [{ action: "stay" }] };
  const dani: ResidentConfig = { id: "dani", name: ["丹妮", "Dani"], persona: "runs errands", anchors: [{ scene: "market", at: { x: 2, y: 2 } }], goal: { scene: "market", who: null, intent: "送货" }, can: [{ action: "stay" }] };
  const june: ResidentConfig = { id: "june", name: ["琼", "June"], persona: "cooks", anchors: [{ scene: "dock", at: { x: 3, y: 3 } }], goal: { scene: "dock", who: null, intent: "备餐" }, can: [{ action: "stay" }] };
  const told = { minute: 500, with: "june", text: ["听说码头缺菜。", "The dock is short of vegetables."] as [string, string], scene: "dock", about: ["june"], importance: 5, kind: "talk" as const };
  const rolls = [0.1, 0.1, 0.1];
  let roll = 0;
  const prompts: string[] = [];
  const town = createNpcTown({
    residents: [samira, dani, june],
    minute: 540,
    resume: { residents: [{ id: "samira", scene: "market", goal: samira.goal, memory: [told] }, { id: "dani", scene: "market", goal: dani.goal, memory: [] }] },
    converse: (speaker, listener) => presenceRounds(async (input, questions) => {
      prompts.push(`${input}\n${questions.map((question) => question.type === "choice" ? `${question.instructions} ${question.choices.map((choice) => choice.description).join(" ")}` : "").join(" ")}`);
      const name = questions[0]?.name;
      const offered = questions[0]?.type === "choice" ? questions[0].choices.map((choice) => choice.value) : [];
      if (name === "act") {
        const value = offered.includes("relay") ? "relay" : "nothing";
        return [{ type: "choice", name: "act", choice: value, probabilities: [{ value, probability: 1 }] }];
      }
      if (name === "item") return [{ type: "choice", name: "item", choice: "e0", probabilities: [{ value: "e0", probability: 0.9 }, { value: "nothing", probability: 0.1 }] }];
      if (name === "reply") return [{ type: "choice", name: "reply", choice: "listen", probabilities: [{ value: "listen", probability: 1 }] }];
      return [{ type: "choice", name: name ?? "act", choice: "nothing", probabilities: [{ value: "nothing", probability: 1 }] }];
    }, async () => ["听说码头缺菜。", "The dock is short of vegetables."], speaker, listener, () => rolls[roll++] ?? 0.99),
  });
  let visible = false;
  await town.commit(async (view) => {
    if (view.me.id === "samira") visible = (view.events ?? []).some((row) => row.text[0].includes("码头缺菜")) && !view.here.includes("june");
    return { type: "stay" };
  });
  assert.equal(visible, true);
  const listenerState = town.state().residents.find((resident) => resident.id === "dani");
  const heard = listenerState?.events.find((event) => event.who === "samira");
  const page = listenerState?.pages.find((item) => item.who === "samira");
  assert.match(heard?.text[0] ?? "", /码头缺菜/);
  assert.equal(heard?.heard, true);
  assert.equal(heard?.who, "samira");
  assert.equal(page?.about.includes("june"), true);
  assert.equal(page?.met, "once");
  assert.match(prompts.find((prompt) => prompt.includes("Something that happened")) ?? "", /dock is short of vegetables/);
  assert.match(prompts.find((prompt) => prompt.includes("grows food")) ?? "", /grows food/);
});

test("a meeting can agree to work together or ask the other person to come", async () => {
  const offering: NpcView = { minute: 540, me: { id: "avery", scene: "market", persona: "new in town", background: "", voice: "", aim: "找到一份工作", goal: { scene: "market", who: "june", intent: "找到一份工作" }, can: [{ action: "stay" }, { action: "plan" }, { action: "propose" }] }, anchors: [], plan: null, seen: { people: ["june"], notices: [] }, known: [], here: ["june"], talked: [], replannedToday: false, heard: [] };
  const during = npcDeedQuestion(offering);
  const alone = npcDeedQuestion({ ...offering, here: [] });
  if (during?.type === "choice") assert.deepEqual(during.choices.map((choice) => choice.value), ["nothing", "propose"]);
  assert.equal(alone, null);
  const publicHour = npcDeedQuestion({ ...offering, me: { ...offering.me, can: [{ action: "stay" }, { action: "speak" }, { action: "attend" }] } });
  if (publicHour?.type === "choice") assert.deepEqual(publicHour.choices.map((choice) => choice.value), ["nothing", "speak", "attend"]);
  const said = npcChatActQuestion(offering, "june", []);
  const quiet = npcChatActQuestion({ ...offering, me: { ...offering.me, can: [{ action: "stay" }] } }, "june", []);
  if (said.type === "choice") assert.deepEqual(said.choices.map((choice) => choice.value), ["nothing", "promise"]);
  if (quiet.type === "choice") assert.deepEqual(quiet.choices.map((choice) => choice.value), ["nothing", "promise"]);
  const avery: ResidentConfig = { id: "avery", name: ["艾弗里", "Avery"], persona: "new in town", anchors: [{ scene: "market", at: { x: 1, y: 1 } }], goal: { scene: "market", who: "june", intent: "找到一份工作" }, can: [{ action: "stay" }, { action: "propose" }, { action: "invite" }, { action: "work" }] };
  const june: ResidentConfig = { id: "june", name: ["琼", "June"], persona: "cooks", anchors: [{ scene: "market", at: { x: 2, y: 2 } }], goal: { scene: "market", who: null, intent: "备餐" }, can: [{ action: "stay" }, { action: "sign" }, { action: "accept" }] };
  const seated = { residents: [{ id: "avery", scene: "market", goal: avery.goal, memory: [] }, { id: "june", scene: "market", goal: june.goal, memory: [] }] };
  const talked = createNpcTown({
    residents: [avery, june],
    minute: 540,
    resume: { residents: seated.residents },
    converse: async () => [{ event: "propose", accepted: true, text: ["一起把这份工做完。", "Let us finish this job together."], answer: ["好。", "Yes."], about: ["june"], who: "avery" }],
  });
  await talked.commit(async () => ({ type: "stay" }));
  assert.equal(talked.state().society.deals.length, 0);
  assert.equal(talked.state().society.commissions.length, 0);
  assert.match(talked.state().residents.find((resident) => resident.id === "june")?.events.find((event) => event.who === "avery")?.text[0] ?? "", /一起把这份工做完/);
  let remembered = false;
  const laterTalk = createNpcTown({ residents: [avery, june], minute: 600, resume: { residents: talked.state().residents, society: talked.state().society } });
  await laterTalk.commit(async (view) => {
    if (view.me.id === "june") remembered = (view.events ?? []).some((event) => event.text[0].includes("一起把这份工做完"));
    return { type: "stay" };
  });
  assert.equal(remembered, true);
  const town = createNpcTown({ residents: [avery, june], minute: 540, resume: { residents: seated.residents } });
  await town.commit(async (view) => view.me.id === "avery" ? { type: "propose" } : { type: "sign" });
  assert.deepEqual(town.state().society.proposals[0]?.signed, ["avery"]);
  assert.equal(town.state().society.deals.length, 0);
  assert.equal(town.state().society.commissions.length, 0);
  assert.equal(town.state().residents.find((resident) => resident.id === "june")?.todos.length ?? 0, 0);
  const open = town.state().society;
  open.bags.june = { cash: 6, cashLocked: 0, items: {} };
  const signed = createNpcTown({ residents: [avery, june], minute: 600, resume: { residents: town.state().residents, society: open } });
  await signed.commit(async (view) => view.me.id === "june" ? { type: "sign" } : { type: "stay" });
  assert.deepEqual(signed.state().society.deals[0]?.parties, ["avery", "june"]);
  assert.equal(signed.state().society.commissions[0]?.from, "june");
  assert.equal(signed.state().society.commissions[0]?.to, "avery");
  const hired = createNpcTown({ residents: [avery, june], minute: 660, resume: { residents: signed.state().residents, society: signed.state().society } });
  const worked = await hired.commit(async (view) => view.me.id === "avery" ? { type: "work" } : { type: "stay" });
  assert.equal(worked.rejected.find((item) => item.id === "avery")?.reason, "NPC_RESOURCE");
  const asking = createNpcTown({ residents: [avery, june], minute: 540, resume: { residents: seated.residents } });
  await asking.commit(async (view) => view.me.id === "avery" ? { type: "invite", when: { day: 1, from: 720 } } : { type: "accept" });
  assert.equal(asking.state().residents.find((resident) => resident.id === "june")?.todos.length ?? 0, 0);
  assert.equal(asking.state().society.pendingMeets[0]?.to, "june");
  const coming = createNpcTown({ residents: [avery, june], minute: 600, resume: { residents: asking.state().residents, society: asking.state().society } });
  await coming.commit(async (view) => view.me.id === "june" ? { type: "accept" } : { type: "stay" });
  assert.deepEqual(coming.state().residents.find((resident) => resident.id === "june")?.todos, [{ day: 1, from: 720, scene: "market", intent: "找到一份工作", who: "avery" }]);
});

test("a confidence is offered only to Gabriel and his copy stays sealed", async () => {
  const batch = ["这批菜明天就过了。", "This batch turns tomorrow."] as [string, string];
  const samira: NpcView = { minute: 1020, me: { id: "samira", scene: "chapel", persona: "grows food", background: "", voice: "", aim: "售出将过期的收成", goal: { scene: "chapel", who: "june", intent: "售出将过期的收成" }, can: [{ action: "stay" }] }, anchors: [], plan: null, seen: { people: ["gabriel"], notices: [] }, known: [], events: [{ who: "june", text: batch }], here: ["gabriel"], talked: [], replannedToday: false, heard: [] };
  const toPriest = npcChatActQuestion(samira, "gabriel", [{ id: "e0", text: batch[1] }]);
  const toJune = npcChatActQuestion(samira, "june", [{ id: "e0", text: batch[1] }]);
  if (toPriest.type === "choice") assert.equal(toPriest.choices.some((choice) => choice.value === "confide"), true);
  if (toJune.type === "choice") assert.equal(toJune.choices.some((choice) => choice.value === "confide"), false);
  const grower: ResidentConfig = { id: "samira", name: ["萨米拉", "Samira"], persona: "grows food", anchors: [{ scene: "chapel", at: { x: 2, y: 2 } }], goal: { scene: "chapel", who: null, intent: "售出将过期的收成" }, can: [{ action: "stay" }] };
  const gabriel: ResidentConfig = { id: "gabriel", name: ["加百列", "Gabriel"], persona: "keeps a confidence", anchors: [{ scene: "chapel", at: { x: 1, y: 1 } }], goal: { scene: "chapel", who: null, intent: "听人把话说完" }, can: [{ action: "stay" }] };
  const town = createNpcTown({
    residents: [grower, gabriel],
    minute: 1020,
    resume: { residents: [{ id: "samira", scene: "chapel", goal: grower.goal, memory: [] }, { id: "gabriel", scene: "chapel", goal: gabriel.goal, memory: [] }] },
    converse: async () => [{ event: "confide", accepted: true, text: batch, answer: ["我听见了，不会往外说。", "I heard it and will not pass it on."], about: ["june"], reply: "listen", who: "samira" }],
  });
  await town.commit(async () => ({ type: "stay" }));
  const priest = town.state().residents.find((resident) => resident.id === "gabriel");
  const heard = priest?.events.find((event) => event.who === "samira");
  assert.equal(heard?.sealed, true);
  assert.match(heard?.text[0] ?? "", /这批菜/);
  assert.equal(town.state().residents.find((resident) => resident.id === "samira")?.events.some((event) => event.sealed), false);
  assert.equal(town.state().residents.find((resident) => resident.id === "samira")?.events.find((event) => event.text[0] === batch[0])?.said, true);
  assert.equal(heard?.said, undefined);
  const sealed: NpcView = { ...samira, me: { ...samira.me, id: "gabriel", persona: "keeps a confidence", aim: "听人把话说完" }, events: [{ who: "samira", text: batch, sealed: true }] };
  const later = npcChatActQuestion(sealed, "nell", []);
  if (later.type === "choice") assert.equal(later.choices.some((choice) => choice.value === "relay" || choice.value === "confide"), false);
  const nell: NpcView = { ...samira, me: { ...samira.me, id: "nell", aim: "组织交流" }, events: [] };
  const prompts: string[] = [];
  await presenceRounds(async (input, questions) => {
    prompts.push(input);
    prompts.push(questions.flatMap((question) => question.type === "choice" ? question.choices.map((choice) => `${choice.value} ${choice.description}`) : []).join(" "));
    return [{ type: "choice", name: questions[0]?.name ?? "act", choice: "nothing", probabilities: [{ value: "nothing", probability: 1 }] }];
  }, async () => batch, sealed, nell, () => 0);
  assert.equal(prompts.some((prompt) => prompt.includes("这批菜明天就过了") || prompt.includes("This batch turns tomorrow.")), false);
});

test("a lie and a rumor are remembered as talk, and neither one settles", async () => {
  const batch = ["这批菜明天就过了。", "This batch turns tomorrow."] as [string, string];
  const falseBatch = ["这批菜还能放很久。", "This batch keeps."] as [string, string];
  const gossip = ["琼把好菜藏起来了。", "June is hiding the good batch."] as [string, string];
  const speaker: NpcView = { minute: 540, me: { id: "samira", scene: "market", persona: "grows food", background: "", voice: "", aim: "卖菜", goal: { scene: "market", who: "june", intent: "卖菜" }, can: [{ action: "stay" }] }, anchors: [], plan: null, seen: { people: ["dani"], notices: [] }, known: [], events: [{ who: "june", text: batch }], here: ["dani"], talked: [], replannedToday: false, heard: [] };
  const toDani = npcChatActQuestion(speaker, "dani", [{ id: "e0", text: batch[1], about: ["june"] }]);
  const aboutDani = npcChatActQuestion(speaker, "dani", [{ id: "e0", text: batch[1], about: ["dani"] }]);
  if (toDani.type === "choice") assert.equal(toDani.choices.some((choice) => choice.value === "lie") && toDani.choices.some((choice) => choice.value === "rumor"), true);
  if (aboutDani.type === "choice") assert.equal(aboutDani.choices.some((choice) => choice.value === "rumor"), false);
  const samira: ResidentConfig = { id: "samira", name: ["萨米拉", "Samira"], persona: "grows food", anchors: [{ scene: "market", at: { x: 1, y: 1 } }], goal: { scene: "market", who: "june", intent: "卖菜" }, can: [{ action: "stay" }] };
  const dani: ResidentConfig = { id: "dani", name: ["丹妮", "Dani"], persona: "carries goods", anchors: [{ scene: "market", at: { x: 2, y: 2 } }], goal: { scene: "market", who: null, intent: "送货" }, can: [{ action: "stay" }] };
  const town = createNpcTown({
    residents: [samira, dani],
    minute: 540,
    resume: { residents: [{ id: "samira", scene: "market", goal: samira.goal, memory: [], events: [{ who: "june", text: batch }] }, { id: "dani", scene: "market", goal: dani.goal, memory: [] }] },
    converse: async () => [
      { event: "lie", accepted: true, text: falseBatch, answer: ["我记下了。", "I will keep that."], about: ["june"], reply: "believe", who: "samira" },
      { event: "rumor", accepted: true, text: gossip, answer: ["这我得再问问。", "I would ask again."], about: ["june"], reply: "doubt", who: "samira" },
    ],
  });
  await town.commit(async () => ({ type: "stay" }));
  const grower = town.state().residents.find((resident) => resident.id === "samira");
  const carrier = town.state().residents.find((resident) => resident.id === "dani");
  assert.equal(grower?.events.find((event) => event.text[0] === batch[0])?.bent, undefined);
  assert.equal(grower?.events.find((event) => event.text[0] === falseBatch[0])?.bent, "lie");
  assert.equal(grower?.events.find((event) => event.text[0] === gossip[0])?.bent, "rumor");
  assert.equal(carrier?.events.find((event) => event.text[0] === falseBatch[0])?.heard, true);
  assert.equal(carrier?.events.find((event) => event.text[0] === falseBatch[0])?.bent, undefined);
  assert.equal(carrier?.events.find((event) => event.text[0] === gossip[0])?.heard, true);
  assert.equal(town.state().society.deals.length, 0);
  assert.equal(town.state().society.quotes.length, 0);
  let sawLie = false;
  const next = createNpcTown({ residents: [samira, dani], minute: 600, resume: { residents: town.state().residents, society: town.state().society } });
  await next.commit(async (view) => {
    if (view.me.id === "samira") sawLie = (view.events ?? []).some((event) => event.bent === "lie" && event.text[0] === falseBatch[0]);
    return { type: "stay" };
  });
  assert.equal(sawLie, true);
  const june: ResidentConfig = { id: "june", name: ["琼", "June"], persona: "cooks", anchors: [{ scene: "dock", at: { x: 3, y: 3 } }], goal: { scene: "dock", who: null, intent: "备餐" }, can: [{ action: "stay" }] };
  let sawBent = false;
  const night = createNpcTown({
    residents: [samira, dani, june],
    minute: 1200,
    resume: { residents: town.state().residents, society: town.state().society },
    decide: () => ({ type: "stay" }),
    review: async (facts) => {
      if (facts.events.some((event) => event.bent === "lie")) sawBent = true;
      const page = facts.pages.find((item) => item.who === "dani");
      if (!page) return { pages: [], temperament: null };
      return { pages: [{ who: "dani", text: ["她当着丹妮说了假话，我不会全信。", "She was false in front of Dani, and I will not take all of it."] }], temperament: null };
    },
  });
  await night.seek(1260);
  assert.equal(sawBent, true);
  assert.match(night.state().residents.find((resident) => resident.id === "samira")?.pages.find((page) => page.who === "dani")?.view?.[0] ?? "", /假话/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /from good and evil, or from trust/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /named resident's own projection/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /two heard accounts/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /A heard sentence is not necessarily true/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /It is not what the other person did/);
  assert.equal(npcRewritePageMessages({}).map((message) => message.content).join("\n").includes("One account stays something they were told"), false);
  assert.match(npcChangeQuestion("page").instructions, /One heard sentence alone is not what the other person did/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /cooler impression/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /neither is required/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /take a straight act as suspicious/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /Name that person/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /names someone else doing/);
  assert.equal(npcRewritePageMessages({}).map((message) => message.content).join("\n").includes("only person this sentence may be about"), false);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /same words marked said are still false/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /does not settle it/);
  assert.match(npcRewritePageMessages({}).map((message) => message.content).join("\n"), /Do not write I or you/);
  const pageShot = npcRewritePageMessages({ id: "ruth", persona: "Warehouse keeper filling empty storage.", aim: "Take storage commissions", page: { who: "june" }, events: [] });
  const pageAsk = pageShot[pageShot.length - 1]?.content ?? "";
  assert.equal(pageShot.length, 2);
  const personal = JSON.parse(pageAsk.slice(pageAsk.indexOf("{"), pageAsk.indexOf("}") + 1)) as { name?: string; persona?: string; aim?: string; view?: unknown; events?: unknown };
  assert.equal(personal.name, "ruth");
  assert.equal(personal.persona, "Warehouse keeper filling empty storage.");
  assert.equal(personal.aim, "Take storage commissions");
  assert.equal("events" in personal, false);
  assert.match(pageAsk, /The following is ruth's personal information/);
  assert.match(pageAsk, /Today's events between ruth and june/);
  assert.match(pageAsk, /Write ruth's new view of june from the old view, those events, and the ledger/);
  assert.match(pageAsk, /Who has a tool is the person named by has/);
  assert.match(pageAsk, /A heard or said sale is not a sale/);
  assert.match(pageAsk, /has not been accepted/);
  assert.match(pageAsk, /a cooler impression does not state that sale/);
  assert.match(pageAsk, /The person a line names is the one who did it/);
  assert.match(pageAsk, /Do not give june a deed the line names someone else doing/);
  assert.match(pageShot[0]?.content ?? "", /The last borrow or return is where it is/);
  assert.match(pageShot[0]?.content ?? "", /A heard or said sale is not the sale/);
  assert.match(pageShot[0]?.content ?? "", /Do not give a person a deed the events do not name that person doing/);
  assert.match(pageShot[0]?.content ?? "", /from the old view and today's events/);
  const worryJudge = npcChangeInput("worry", { id: "theo", persona: "Repairer building a reputation one tool at a time.", aim: "Finish tool repairs and build a reputation of his own.", temperament: "He is slow to hand a tool back.", worry: "Owen is waiting, and Theo still has not handed Owen the plane.", events: [{ text: "Owen borrowed plane from Theo. Theo still owns plane." }] });
  const worryInfo = JSON.parse(worryJudge.slice(worryJudge.indexOf("{"), worryJudge.indexOf("}") + 1)) as { name?: string; persona?: string; aim?: string; events?: unknown };
  assert.equal(worryInfo.name, "theo");
  assert.equal(worryInfo.persona, "Repairer building a reputation one tool at a time.");
  assert.equal(worryInfo.aim, "Finish tool repairs and build a reputation of his own.");
  assert.equal("events" in worryInfo, false);
  assert.match(worryJudge, /Today's events:\n- Owen borrowed plane from Theo\. Theo still owns plane\./);
  const withLedger = npcChangeInput("worry", { id: "theo", persona: "Repairer building a reputation one tool at a time.", aim: "Finish tool repairs and build a reputation of his own.", temperament: "He is slow to hand a tool back.", worry: "Owen is waiting, and Theo still has not handed Owen the plane.", events: [{ text: "Owen borrowed plane from Theo. Theo still owns plane." }], ledger: { cash: 0, locked: 0, items: [{ id: "goods", amount: 1 }], loans: [{ tool: "plane", owner: "theo", holder: "owen", held: false }] } });
  assert.match(withLedger, /Ledger now/);
  assert.match(withLedger, /"held":false/);
  assert.match(withLedger, /"has":"theo"/);
  assert.match(withLedger, /held true means the holder has the tool/);
  assert.match(withLedger, /held false means the tool is with the owner/);
  assert.match(withLedger, /the holder's workshop still lacks it/);
  assert.match(withLedger, /does not say they have it in hand/);
  assert.match(withLedger, /Do not stop at an earlier return/);
  assert.match(withLedger, /When has is the owner, keep the holder's lack/);
  assert.match(npcChangeQuestion("page").instructions, /held true means the holder has the tool/);
  assert.match(npcChangeQuestion("worry").instructions, /the holder's workshop still lacks it/);
  const pageLedger = npcChangeInput("page", { id: "owen", persona: "Carpenter.", aim: "Gather the materials.", temperament: "He stays with the work.", worry: "Theo still has Owen's plane, and Owen's workshop stays short of the plane.", page: { who: "theo", view: null }, events: [{ text: "Owen borrowed plane from Theo. Theo still owns plane." }], ledger: { cash: 0, locked: 0, items: [], loans: [{ tool: "plane", owner: "theo", holder: "owen", held: true }] } });
  assert.match(pageLedger, /"has":"owen"/);
  assert.equal(pageLedger.includes("Theo still has Owen's plane"), false);
  assert.equal(npcRewritePageMessages({ id: "owen", worry: "Theo still has Owen's plane", page: { who: "theo", view: null }, events: [] }).some((message) => message.content.includes("Theo still has Owen's plane")), false);
  assert.match(withLedger, /amount 0 means that good is gone/);
  assert.match(withLedger, /Do not write that theo still holds it/);
  assert.match(withLedger, /Do not keep both spoiled and still held/);
  assert.match(withLedger, /not another person/);
  assert.match(withLedger, /has not accepted that same good/);
  assert.match(withLedger, /Do not explain the amount as a heard or said sale/);
  assert.match(npcRewriteWorryMessages({ id: "samira", worry: "The batch will turn.", ledger: { cash: 0, locked: 0, items: [{ id: "crop-tomato", amount: 0, until: 1260 }], loans: [] } }).at(-1)?.content ?? "", /Do not write that they still hold it/);
  assert.match(withLedger, /When this and an event disagree, follow this/);
  assert.match(npcChangeQuestion("worry").instructions, /the ledger is the fact/);
  assert.match(npcChangeQuestion("worry").instructions, /does not replace the ledger/);
  assert.match(npcChangeQuestion("page").instructions, /accepted, or spoiled/);
  assert.match(npcChangeQuestion("page").instructions, /or spoils the good/);
  assert.match(npcRewriteWorryMessages({ id: "theo", worry: "Owen is waiting.", ledger: { cash: 0, locked: 2, items: [], loans: [] } }).at(-1)?.content ?? "", /"locked":2/);
  assert.match(npcRewriteWorryMessages({}).map((message) => message.content).join("\n"), /does not settle it/);
  assert.match(npcChangeQuestion("worry").instructions, /A borrow and a later return are still a move/);
  assert.equal(npcChangeQuestion("worry").instructions.includes("the good has not moved"), false);
  assert.match(npcChangeQuestion("self").instructions, /does not reverse that lean/);
  assert.equal(npcChangeQuestion("self").instructions.includes("the ledger is the fact"), false);
  const selfLine = npcRewriteSelfMessages({}).map((message) => message.content).join("\n");
  assert.match(selfLine, /Do not copy an event into the sentence/);
  assert.match(selfLine, /from the old temperament and today's events/);
  assert.match(selfLine, /Keep that lean/);
  assert.match(selfLine, /Do not turn a part into its opposite/);
  assert.equal(selfLine.includes("may shift it"), false);
  assert.equal(selfLine.includes("rely on people less"), false);
  assert.equal(npcRewriteSelfMessages({ persona: "opens a shop", aim: "Deliver the crop", temperament: "He talks it up.", events: [] }).some((message) => message.content.includes("Deliver the crop")), false);
  const worryLine = npcRewriteWorryMessages({ persona: "Warehouse keeper", aim: "Take storage commissions", worry: "June has not taken Samira's tomato batch.", events: [] });
  const worryAsk = worryLine[worryLine.length - 1]?.content ?? "";
  assert.equal(worryLine.length, 2);
  assert.match(worryLine.map((message) => message.content).join("\n"), /\{"text":null\}/);
  assert.equal(worryAsk.includes("Warehouse keeper") || worryAsk.includes("storage commissions"), false);
  assert.match(worryAsk, /June has not taken Samira's tomato batch/);
  assert.match(worryAsk, /A count of what this resident holds is not the worry/);
  assert.match(worryAsk, /Do not write which batch is which/);
  assert.match(worryAsk, /Every unfinished part of the old worry stays/);
  assert.match(worryAsk, /A new unfinished stake may be added/);
  assert.match(worryAsk, /Do not drop an unfinished part to keep just one/);
  assert.match(npcChangeQuestion("worry").instructions, /a new unfinished stake is open/);
  assert.match(worryLine.map((message) => message.content).join("\n"), /Other people's errands do not replace an unfinished part/);
  assert.match(worryLine.map((message) => message.content).join("\n"), /from the old worry and today's events/);
  const complaint = npcChatLineMessages({ act: "complain" }).map((message) => message.content).join("\n");
  assert.match(complaint, /A job is not a name/);
  assert.match(complaint, /Do not add a result the stake does not state/);
  assert.match(complaint, /A promise in the stake is not a failure/);
  assert.match(complaint, /does not mean the promise failed/);
  assert.match(complaint, /Do not negate/);
  assert.equal(npcChatLineMessages({ act: "complain", aim: "Finish reliable deliveries", stake: "Promises to deliver on time." }).some((message) => message.content.includes("Finish reliable deliveries")), false);
  const rumorLine = npcChatLineMessages({ act: "rumor", aim: "Finish the meal orders", stake: "What he brings is another crop." }).map((message) => message.content).join("\n");
  assert.match(rumorLine, /Do not use the word rumor/);
  assert.match(rumorLine, /Do not add a motive/);
  assert.equal(rumorLine.includes("Finish the meal orders"), false);
  assert.match(selfLine, /Do not write I or you/);
});

test("a move is decided from where everyone started, and a rumor stays one claim", async () => {
  const harbor = [{ scene: "harbor", at: { x: 1, y: 1 } }];
  const dock = [{ scene: "dock", at: { x: 4, y: 4 } }];
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "builds", anchors: [...harbor, ...dock], goal: { scene: "harbor", who: "ruth", intent: "送材料" }, can: [{ action: "stay" }, { action: "go" }] };
  const ruth: ResidentConfig = { id: "ruth", name: "Ruth", persona: "stores", anchors: dock, goal: { scene: "dock", who: "owen", intent: "收材料" }, can: [{ action: "stay" }] };
  const moving = createNpcTown({ residents: [owen, ruth], minute: 540 });
  const seen: string[][] = [];
  await moving.commit(async (view) => {
    seen.push(view.here);
    return view.me.id === "owen" ? { type: "go", scene: "dock" } : { type: "stay" };
  });
  assert.deepEqual(seen, [[], []]);
  assert.equal(moving.state().residents.find((resident) => resident.id === "owen")?.scene, "dock");
  assert.equal(moving.state().residents.find((resident) => resident.id === "ruth")?.scene, "dock");
  const gossip = ["琼把好菜藏起来了。", "June is hiding the good batch."] as [string, string];
  const samira: ResidentConfig = { id: "samira", name: ["萨米拉", "Samira"], persona: "grows food", anchors: [{ scene: "market", at: { x: 1, y: 1 } }], goal: { scene: "market", who: null, intent: "卖菜" }, can: [{ action: "stay" }] };
  const dani: ResidentConfig = { id: "dani", name: ["丹妮", "Dani"], persona: "carries goods", anchors: [{ scene: "market", at: { x: 2, y: 2 } }], goal: { scene: "market", who: null, intent: "送货" }, can: [{ action: "stay" }] };
  const told = createNpcTown({
    residents: [samira, dani],
    minute: 540,
    converse: async () => [
      { event: "rumor", accepted: true, text: gossip, answer: ["我再问问。", "I would ask."], about: ["june"], reply: "doubt", who: "samira" },
      { event: "rumor", accepted: true, text: gossip, answer: ["还是这句。", "Still that."], about: ["june"], reply: "doubt", who: "samira" },
    ],
  });
  await told.commit(async () => ({ type: "stay" }));
  const carrier = told.state().residents.find((resident) => resident.id === "dani");
  assert.equal(carrier?.events.filter((event) => event.text[0] === gossip[0] && event.heard).length, 1);
  assert.equal(carrier?.events.find((event) => event.text[0] === gossip[0])?.who, "samira");
  const june: ResidentConfig = { id: "june", name: ["琼", "June"], persona: "cooks", anchors: dock, goal: { scene: "dock", who: null, intent: "备餐" }, can: [{ action: "stay" }] };
  const passed = createNpcTown({
    residents: [dani, june],
    minute: 600,
    resume: { residents: [{ id: "dani", scene: "market", goal: dani.goal, memory: [], events: carrier?.events ?? [] }, { id: "june", scene: "market", goal: june.goal, memory: [] }] },
    converse: async () => [
      { event: "rumor", accepted: true, text: gossip, answer: ["我听见了。", "I heard it."], about: ["june"], reply: "pass", who: "dani" },
      { event: "rumor", accepted: true, text: gossip, answer: ["又是这句。", "That again."], about: ["june"], reply: "pass", who: "dani" },
    ],
  });
  await passed.commit(async () => ({ type: "stay" }));
  const cook = passed.state().residents.find((resident) => resident.id === "june");
  assert.equal(cook?.events.filter((event) => event.text[0] === gossip[0] && event.heard).length, 1);
  assert.equal(cook?.events.find((event) => event.text[0] === gossip[0])?.who, "dani");
  assert.equal(passed.state().residents.find((resident) => resident.id === "dani")?.events.filter((event) => event.text[0] === gossip[0] && (event.heard || event.bent)).length, 1);
});

test("a conversation keeps that pair here, and someone else can still leave", async () => {
  const market = { scene: "market", at: { x: 1, y: 1 } };
  const samira: ResidentConfig = { id: "samira", name: "Samira", persona: "grows", anchors: [market, { scene: "dock", at: { x: 4, y: 4 } }], goal: { scene: "market", who: null, intent: "卖菜" }, can: [{ action: "stay" }, { action: "go" }] };
  const dani: ResidentConfig = { id: "dani", name: "Dani", persona: "carries", anchors: [market, { scene: "dock", at: { x: 4, y: 4 } }], goal: { scene: "market", who: null, intent: "送货" }, can: [{ action: "stay" }, { action: "go" }] };
  const luis: ResidentConfig = { id: "luis", name: "Luis", persona: "gardens", anchors: [market, { scene: "grocery", at: { x: 8, y: 8 } }], goal: { scene: "market", who: null, intent: "看菜" }, can: [{ action: "stay" }, { action: "go" }] };
  const line = ["今天的菜还在。", "The vegetables are still here."] as [string, string];
  const talking = createNpcTown({
    residents: [samira, dani, luis],
    minute: 540,
    converse: async () => [{ event: "talk", accepted: true, text: line, answer: ["我看见了。", "I see them."], who: "samira" }],
  });
  const held = await talking.commit(async (view) => view.me.id === "dani" || view.me.id === "luis" ? { type: "go", scene: view.me.id === "dani" ? "dock" : "grocery" } : { type: "stay" });
  assert.equal(held.rejected.find((item) => item.id === "dani")?.reason, "NPC_HELD");
  assert.equal(talking.state().residents.find((resident) => resident.id === "dani")?.scene, "market");
  assert.equal(talking.state().residents.find((resident) => resident.id === "samira")?.scene, "market");
  assert.match(talking.state().residents.find((resident) => resident.id === "dani")?.events[0]?.text[0] ?? "", /菜还在/);
  assert.equal(talking.state().residents.find((resident) => resident.id === "luis")?.scene, "grocery");
  assert.equal(talking.state().residents.find((resident) => resident.id === "luis")?.events.length, 0);
  const quiet = createNpcTown({ residents: [samira, dani], minute: 540, converse: async () => [] });
  const left = await quiet.commit(async (view) => view.me.id === "dani" ? { type: "go", scene: "dock" } : { type: "stay" });
  assert.equal(left.rejected.length, 0);
  assert.equal(quiet.state().residents.find((resident) => resident.id === "dani")?.scene, "dock");
  assert.equal(quiet.state().residents.find((resident) => resident.id === "dani")?.events.length, 0);
});

test("a probable reply is drawn, and an echoed reply is not a second fact", async () => {
  const fish = ["这条鱼还在这里，继续放只会浪费。", "This fish is still here, and keeping it longer wastes it."] as [string, string];
  const summary = ["鱼还在，再放下去会浪费。", "The fish is still here, and keeping it wastes it."] as [string, string];
  const replyLine = ["我听到了。", "I heard that."] as [string, string];
  const mara: NpcView = { minute: 540, me: { id: "mara", scene: "station", persona: "cooks", background: "", voice: "", aim: "供餐", temperament: null, goal: { scene: "station", who: null, intent: "供餐" }, can: [{ action: "stay" }] }, anchors: [], plan: null, seen: { people: ["avery"], notices: [] }, known: [], events: [{ who: "luis", text: fish, bent: "lie" }], here: ["avery"], talked: [], replannedToday: false, heard: [] };
  const avery: NpcView = { ...mara, me: { ...mara.me, id: "avery", aim: "找事做" }, events: [], here: ["mara"], seen: { people: ["mara"], notices: [] } };
  const written: unknown[] = [];
  const replies: string[] = [];
  const rounds = await presenceRounds(async (input, questions) => {
    if (questions[0]?.type === "choice" && questions[0].name === "reply") replies.push(input);
    const name = questions[0]?.type === "choice" ? questions[0].name : "act";
    const choice = name === "reply" ? "listen" : name === "item" ? "e0" : "relay";
    return [{ type: "choice", name, choice, probabilities: [{ value: choice, probability: 0.8 }, { value: "pass", probability: 0.2 }] }];
  }, async (facts) => {
    written.push(facts);
    return summary;
  }, mara, avery, () => 0);
  const first = rounds[0];
  assert.equal(first && "reply" in first ? first.reply : undefined, "listen");
  assert.deepEqual(first && "text" in first ? first.text : undefined, summary);
  assert.equal(written.length, 1);
  assert.match(replies[0] ?? "", /"id":"avery"/);
  assert.equal((replies[0] ?? "").includes('"bent"'), false);
  const relayPrompt = npcChatLineMessages({ act: "relay" }).map((message) => message.content).join("\n");
  const liePrompt = npcChatLineMessages({ act: "lie" }).map((message) => message.content).join("\n");
  assert.match(relayPrompt, /same matter as the stake/);
  assert.equal(relayPrompt.includes("opposite of the stake"), false);
  assert.match(liePrompt, /Read memory/);
  assert.match(liePrompt, /do not use the word falsely/);
  assert.match(liePrompt, /Do not correct the claim/);
  assert.equal(liePrompt.includes("State what is the case"), false);
  assert.equal(liePrompt.includes("does not reverse"), false);
  assert.equal(npcChatLineMessages({ act: "lie", persona: "Garden supplier opening a second outlet.", aim: "open another way to sell it", memory: [{ text: "Mara keeps the fish fresh." }] }).some((message) => message.content.includes("second outlet") || message.content.includes("another way")), false);
  const lieReply = npcChatReplyQuestion("lie");
  const rumorReply = npcChatReplyQuestion("rumor");
  const hidden = [lieReply, rumorReply].map((question) => question.type === "choice" ? `${question.instructions} ${question.choices.map((choice) => choice.description).join(" ")}` : "").join("\n");
  assert.equal(/\blie\b|\brumor\b|\bfalse\b|offer does not happen|Gabriel/.test(hidden), false);
  assert.equal(liePrompt.includes("same matter as the stake"), false);
  assert.equal(liePrompt.includes("opposite of the stake"), false);
  const lieAsks: string[] = [];
  let lieFacts: { act?: string; memory?: unknown; stake?: unknown } = {};
  let lieTurn = 0;
  await presenceRounds(async (_input, questions) => {
    const name = questions[0]?.name ?? "act";
    lieAsks.push(name);
    if (name === "act") {
      lieTurn += 1;
      const choice = lieTurn === 1 ? "lie" : "nothing";
      return [{ type: "choice", name, choice, probabilities: [{ value: choice, probability: 1 }] }];
    }
    return [{ type: "choice", name, choice: "believe", probabilities: [{ value: "believe", probability: 1 }] }];
  }, async (facts) => {
    lieFacts = facts as { act?: string; memory?: unknown; stake?: unknown };
    return summary;
  }, mara, avery);
  assert.deepEqual(lieAsks, ["act", "reply", "act"]);
  assert.equal(lieFacts.act, "lie");
  assert.ok(Array.isArray(lieFacts.memory));
  assert.equal(lieFacts.stake, undefined);
  assert.equal("persona" in lieFacts, false);
  assert.equal("aim" in lieFacts, false);
  const station = { scene: "station", at: { x: 1, y: 1 } };
  const keeper: ResidentConfig = { id: "mara", name: "Mara", persona: "cooks", anchors: [station], goal: { scene: "station", who: null, intent: "供餐" }, can: [{ action: "stay" }], doing: ["玛拉在张罗供餐。", "Mara is lining up a meal."] };
  const newcomer: ResidentConfig = { id: "avery", name: "Avery", persona: "new", anchors: [station, { scene: "dock", at: { x: 4, y: 4 } }], goal: { scene: "station", who: null, intent: "找事" }, can: [{ action: "stay" }, { action: "go" }] };
  const town = createNpcTown({
    residents: [keeper, newcomer],
    minute: 540,
    converse: async () => [{ event: "relay", accepted: true, text: fish, answer: replyLine, about: ["luis"], reply: "listen", who: "mara" }],
  });
  const stayed = await town.commit(async (view) => view.me.id === "avery" ? { type: "go", scene: "station" } : { type: "stay" });
  assert.equal(stayed.accepted.find((item) => item.id === "avery")?.action.type, "stay");
  assert.equal(stayed.moves.length, 0);
  assert.equal(stayed.rejected.length, 0);
  const heard = town.state().residents.find((resident) => resident.id === "avery")?.events.filter((event) => event.text[0] === fish[0]);
  assert.equal(heard?.length, 1);
  assert.equal(heard?.[0]?.heard, true);
  assert.equal(town.state().residents.some((resident) => resident.events.some((event) => event.text[0] === replyLine[0])), false);
  assert.equal(town.state().residents.find((resident) => resident.id === "mara")?.doing?.[0], "玛拉在张罗供餐。");
  const retold = createNpcTown({
    residents: [keeper, newcomer],
    minute: 540,
    resume: { residents: [{ id: "mara", scene: "station", goal: keeper.goal, events: [{ who: "luis", text: fish, heard: true, about: ["luis"] }] }, { id: "avery", scene: "station", goal: newcomer.goal, events: [] }] },
    converse: async () => [{ event: "relay", accepted: true, text: summary, answer: summary, about: ["luis"], reply: "listen", who: "mara" }],
  });
  await retold.commit(async () => ({ type: "stay" }));
  assert.equal(retold.state().residents.find((resident) => resident.id === "avery")?.events.find((event) => event.text[0] === summary[0])?.who, "mara");
  const listener = retold.state().residents.find((resident) => resident.id === "avery");
  assert.equal(listener?.pages.some((page) => page.who === "luis"), false);
  assert.equal(listener?.pages.some((page) => page.who === "avery"), false);
  assert.equal(listener?.pages.some((page) => page.who === "mara"), true);
});

test("a move and a ledger action both happen, and the day already has its places", async () => {
  const owen: ResidentConfig = { id: "owen", name: "Owen", persona: "builds", aim: "扩建工坊", anchors: [{ scene: "harbor", at: { x: 1, y: 1 } }, { scene: "path", at: { x: 2, y: 2 } }, { scene: "coast", at: { x: 3, y: 3 } }], goal: { scene: "coast", who: null, intent: "扩建工坊" }, can: [{ action: "stay" }, { action: "go" }, { action: "work" }, { action: "speak" }] };
  const town = createNpcTown({ residents: [owen], minute: 540 });
  const tick = await town.commit(async (view) => {
    assert.deepEqual(view.plan?.hours.map((hour) => hour.scene), ["harbor", "path", "coast"]);
    return [{ type: "speak" }, { type: "go", scene: "path" }];
  });
  assert.equal(tick.accepted.some((item) => item.action.type === "speak"), true);
  assert.equal(tick.accepted.some((item) => item.action.type === "go"), true);
  assert.equal(town.state().residents[0]?.scene, "path");
  const blocked = await createNpcTown({ residents: [owen], minute: 600 }).commit(async () => [{ type: "work" }, { type: "go", scene: "coast" }]);
  assert.equal(blocked.rejected.some((item) => item.action.type === "work" && item.reason === "NPC_RESOURCE"), true);
  assert.equal(blocked.moves[0]?.scene, "coast");
});

test("spoiled goods stay an event about the day and reach the other person's review", async () => {
  const ledger = emptyLedger();
  ledger.bags.samira = { cash: 0, cashLocked: 0, items: { "crop-tomato": { amount: 4, locked: 0, until: 1260 } } };
  const held = ["这批番茄还在我这里。", "This batch of tomatoes is still with me."] as [string, string];
  const town = createNpcTown({
    residents: [residents[1]],
    minute: 1260,
    resume: {
      residents: [{ id: "samira", scene: "market", goal: residents[1].goal, pages: [{ who: "june", met: "familiar", view: ["这批还留给琼。", "The batch is still held for June."], about: ["june"] }], events: [{ who: "june", text: held }] }],
      society: ledger,
    },
    decide: () => ({ type: "stay" }),
    review: async (facts) => {
      assert.equal(facts.id, "samira");
      assert.equal(facts.pages.some((page) => page.who === "samira"), false);
      const june = eventsForPage(facts, "june");
      assert.equal(june.some((event) => event.text[0] === held[0]), true);
      assert.equal(june.some((event) => /过了/.test(event.text[0])), true);
      return { pages: [{ who: "june", text: ["番茄过了，给不了琼了。", "The tomatoes spoiled, so June cannot have them."] }], temperament: null };
    },
  });
  await town.commit(async () => ({ type: "stay" }));
  const samira = town.state().residents.find((resident) => resident.id === "samira");
  assert.equal(samira?.pages.some((page) => page.who === "samira"), false);
  assert.match(samira?.pages.find((page) => page.who === "june")?.view?.[0] ?? "", /过了/);
  assert.equal(town.state().society.bags.samira?.items["crop-tomato"]?.amount, 0);
});

test("a view of one person does not receive a sentence about someone else", () => {
  const said = { who: "avery", text: ["路易斯送来的不是鱼。", "Luis brought the off-season crop."] as [string, string], said: true, about: ["luis"] };
  const heard = { who: "ruth", text: ["这批番茄答应留给琼。", "Samira promised June the tomato batch."] as [string, string], heard: true, about: ["june"] };
  const own = { who: "avery", text: ["艾弗里还没有和琼做成第一次合作。", "Avery still has no first cooperation with June."] as [string, string] };
  const spoil = { who: "mara", text: ["这批鱼过了。", "Mara's fish has spoiled."] as [string, string] };
  const facts = { id: "mara", persona: "", aim: "", temperament: null, pages: [], events: [said, heard, own, spoil] };
  assert.equal(eventsForPage(facts, "avery").some((event) => event.about?.includes("luis")), false);
  assert.equal(eventsForPage(facts, "avery").some((event) => event.text[1].includes("Avery still has no first cooperation")), true);
  assert.equal(eventsForPage(facts, "luis").some((event) => event.about?.includes("luis")), true);
  assert.equal(eventsForPage(facts, "ruth").some((event) => event.about?.includes("june")), false);
  assert.equal(eventsForPage(facts, "june").some((event) => event.about?.includes("june")), true);
  assert.equal(eventsForPage(facts, "june").some((event) => /spoiled/.test(event.text[1])), true);
});
