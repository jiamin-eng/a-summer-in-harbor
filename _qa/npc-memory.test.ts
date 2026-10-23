import { test } from "node:test";
import assert from "node:assert/strict";
import { openNpcMemory } from "../server/npc-memory";
import { playerMemoryFacts, recordPlayerTalk } from "../server/npc-chat";
import { harborCast, harborScheduleDecide } from "../src/npc/harbor-cast";
import { createNpcTown, type Memory, type ResidentConfig } from "../src/npc/town";
import "../src/world/residents";

test("sqlite-vec returns the nearer memory for that resident only", async () => {
  const db = openNpcMemory(":memory:", 2);
  const owen = db.bind("player");
  const bird: Memory = { minute: 1080, with: null, text: ["头顶有鸟叫。", "Birds overhead."], scene: "coast", about: ["coast", "birds"], importance: 3, kind: "event", embedding: [1, 0] };
  const fish: Memory = { minute: 1140, with: null, text: ["钓到一条鱼。", "Caught a fish."], scene: "dock", about: ["dock", "fish"], importance: 3, kind: "event", embedding: [0, 1] };
  await owen.save("owen", [bird, fish]);
  const hits = await owen.search("owen", [0.2, 0.9]);
  assert.equal(hits[0].text, "钓到一条鱼。");
  const [again] = await owen.hydrate("owen", [{ minute: 1080, text: "头顶有鸟叫。" }]);
  assert.ok(again && again[0] > 0.9 && Math.abs(again[1]) < 0.01);
  assert.equal((await db.bind("someone-else").search("owen", [0.2, 0.9])).length, 0);
  await owen.save("owen", [fish]);
  assert.equal((await owen.search("owen", [1, 0])).length, 1);
  assert.equal((await owen.hydrate("owen", [{ minute: 1080, text: "头顶有鸟叫。" }]))[0], undefined);
});

test("a sight is not stored, and the save has no vector", async () => {
  const resident: ResidentConfig = { id: "owen", name: "Owen", persona: "listens", anchors: [{ scene: "coast", at: { x: 1, y: 1 } }], goal: { scene: "coast", who: null, intent: "听鸟" }, can: [{ action: "stay" }, { action: "listen", scenes: ["coast"] }] };
  const town = createNpcTown({ residents: [resident], minute: 1080 });
  await town.commit(async () => ({ type: "listen", lines: ["头顶有鸟叫。", "Birds."] }));
  assert.equal(town.state().residents[0].pages.length, 0);
  assert.equal(JSON.stringify(town.state()).includes("embedding"), false);
});

test("a player conversation rewrites that resident's page and is what the next reply can use", async () => {
  const base = createNpcTown({ residents: harborCast(), minute: 540, decide: harborScheduleDecide }).state();
  const next = await recordPlayerTalk(base, "owen", 545, "你听见鸟叫了吗", ["听见两种。", "I heard two."]);
  assert.ok(next);
  const page = next.residents.find((resident) => resident.id === "owen")?.pages.find((item) => item.who === "player");
  assert.equal(page?.met, "once");
  assert.equal(page?.view, null);
  assert.match(next.residents.find((resident) => resident.id === "owen")?.events.find((event) => event.who === "player")?.text[0] ?? "", /鸟叫/);
  assert.match(next.residents.find((resident) => resident.id === "owen")?.events.find((event) => event.who === "player")?.text[0] ?? "", /听见两种/);
  assert.equal(JSON.stringify(next).includes("embedding"), false);
  const keep = async (_question: string, docs: { id: string; text: string }[]) => docs.map((doc) => doc.id);
  const facts = await playerMemoryFacts(next, "owen", "刚才的鸟叫", keep);
  assert.match(JSON.stringify(facts?.events), /听见两种/);
  assert.match(facts?.persona ?? "", /cannot walk away from an order whose materials were already received/);
  const ruth = await playerMemoryFacts(next, "ruth", "刚才的鸟叫", keep);
  assert.equal(JSON.stringify(ruth).includes("听见两种"), false);
  assert.equal(await recordPlayerTalk(next, "elena", 545, "你好", ["你好。", "Hello."]), next);
});

test("a free question keeps only the note the decision pass selects, and still has the persona", async () => {
  const base = createNpcTown({ residents: harborCast(), minute: 540, decide: harborScheduleDecide }).state();
  const owen = base.residents.find((resident) => resident.id === "owen")!;
  owen.pages.push({ who: "theo", met: "once", view: ["工具还缺两把。", "Two tools are still missing."], about: ["theo"] });
  base.society.bags.owen = { cash: 0, cashLocked: 0, items: { wood: { amount: 3, locked: 0 } } };
  base.society.loans.push({ id: "plane", owner: "theo", holder: "owen", tool: "plane", until: 100000, held: false });
  const facts = await playerMemoryFacts(base, "owen", "工具还缺吗", async (_question, docs) => docs.filter((doc) => doc.text.includes("工具")).map((doc) => doc.id));
  assert.match(facts?.worry?.[0] ?? "", /Owen/);
  assert.equal(facts?.pages.length, 1);
  assert.match(facts?.pages[0]?.view[0] ?? "", /工具/);
  assert.equal(JSON.stringify(facts?.pages).includes("海岸"), false);
  assert.match(facts?.persona ?? "", /cannot walk away from an order whose materials were already received/);
  assert.equal(facts?.ledger.items.find((item) => item.id === "wood")?.amount, 3);
  assert.equal(facts?.ledger.loans.find((loan) => loan.tool === "plane")?.has, "theo");
  assert.equal(facts?.ledger.loans.find((loan) => loan.tool === "plane")?.held, false);
  assert.ok(facts?.aim);
});

test("a new town reads the resident config, and a saved resident keeps its own memory", () => {
  const cast = harborCast();
  const town = createNpcTown({ residents: cast, minute: 540, decide: harborScheduleDecide });
  const state = town.state();
  const june = state.residents.find((resident) => resident.id === "june");
  const dani = state.residents.find((resident) => resident.id === "dani");
  const samira = state.residents.find((resident) => resident.id === "samira");
  assert.equal(june?.temperament?.[0], "When I hear two accounts, I see the person more coldly.");
  assert.match(june?.worry?.[0] ?? "", /Samira's tomato account/);
  assert.match(june?.worry?.[0] ?? "", /Dani's tomato account/);
  assert.match(samira?.worry?.[0] ?? "", /June/);
  assert.match(samira?.worry?.[0] ?? "", /tomato/);
  assert.equal(june?.doing?.[0], "琼在争一个能稳定出摊的位置。");
  assert.equal(june?.events.filter((event) => event.heard).length, 2);
  assert.equal(june?.events.find((event) => event.who === "dani")?.text[0], dani?.events[0]?.text[0]);
  assert.equal(dani?.events[0]?.bent, "rumor");
  assert.match(samira?.pages.find((page) => page.who === "june")?.view?.[0] ?? "", /tomato/);
  assert.match(samira?.pages.find((page) => page.who === "june")?.view?.[0] ?? "", /June/);
  assert.equal(samira?.events.length, 0);
  assert.equal(state.residents.find((resident) => resident.id === "avery")?.events.length, 0);
  assert.equal(state.residents.find((resident) => resident.id === "idris")?.pages.length, 0);
  assert.equal(state.residents.find((resident) => resident.id === "gabriel")?.events[0]?.sealed, true);
  const saved = createNpcTown({
    residents: cast,
    minute: 600,
    resume: { residents: [{ id: "june", scene: "workshop", goal: cast.find((resident) => resident.id === "june")!.goal }], society: state.society },
  });
  const kept = saved.state().residents.find((resident) => resident.id === "june");
  assert.equal(kept?.events.length, 0);
  assert.equal(kept?.temperament, undefined);
  assert.equal(kept?.worry, undefined);
  assert.equal(kept?.doing, undefined);
});
