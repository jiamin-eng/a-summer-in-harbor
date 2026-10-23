import test from "node:test";
import assert from "node:assert/strict";
import { initial, type Save } from "../src/story/state";
import type { NpcTownState } from "../src/npc/town";
import { createNpcClock, dueHour, keepNewerNpcLoop } from "../server/npc-clock";

const loop = (minute: number, event = ""): NpcTownState => ({
  minute,
  residents: [{ id: "theo", name: ["西奥", "Theo"], scene: "cafe", goal: { scene: "cafe", who: "owen", intent: "Finish a tool repair." }, pages: [], events: event ? [{ who: "theo", text: [event, event] }] : [], plan: null, todos: [] }],
  talked: [],
  society: { bags: {}, quotes: [], loans: [], slots: [], proposals: [], deals: [], commissions: [], jobs: [], requests: [], pendingGifts: [], pendingMeets: [], exitRequests: [], pendingDeliveries: [], speeches: [], attendance: [], invites: [], playerLog: [], playerReturns: { cash: 0, items: {} } } as NpcTownState["society"],
});

test("the loop follows the clock one hour at a time and does not run ahead", () => {
  assert.equal(dueHour(540, 599), null);
  assert.equal(dueHour(540, 613), 600);
  assert.equal(dueHour(undefined, 545), 540);
  assert.equal(dueHour(600, 660), 660);
});

test("a player action keeps an hour the clock already settled, including a newer reply", () => {
  const current = initial("zh", "town");
  current.npcLoopV1 = loop(600);
  const next = initial("zh", "town");
  next.npcLoopV1 = loop(540, "玩家说「这是谁的刨子」。我答「刨子是我的」。");
  keepNewerNpcLoop(next, current);
  assert.equal(next.npcLoopV1?.minute, 600);
  assert.match(next.npcLoopV1?.residents[0]?.events.at(-1)?.text[0] ?? "", /玩家说/);
});

test("a game-clock tick during the hour still keeps that hour", async () => {
  const save = initial("zh", "town");
  save.townMinutes = 613;
  save.version = 4;
  save.npcLoopV1 = loop(540, "玩家说「这是谁的刨子」。我答「刨子是我的」。");
  let data = JSON.stringify(save);
  const store = {
    transaction: async (fn: (repo: { session: () => Promise<{ data: string; cursor: number }>; write: (owner: string, head: Save, cursor: number) => Promise<void> }) => Promise<unknown>) => fn({
      session: async () => ({ data, cursor: 3 }),
      write: async (_owner: string, head: Save) => { data = JSON.stringify(head); },
    }),
  };
  const clock = createNpcClock(store, async () => ({ type: "stay" }), () => "cafe", undefined, undefined, undefined, () => undefined, async (_previous, minute) => {
    const current = JSON.parse(data) as Save;
    current.townMinutes = 640;
    current.version = 9;
    current.npcLoopV1 = loop(540, "玩家说「这是后来问的」。我答「还在我手里」。");
    data = JSON.stringify(current);
    return { state: loop(minute), tick: { minute, accepted: [], rejected: [], moves: [] }, skipped: [] };
  });
  await clock.poke("owner", save.id);
  const written = JSON.parse(data) as Save;
  assert.equal(written.npcLoopV1?.minute, 600);
  assert.equal(written.version, 9);
  assert.equal(written.townMinutes, 640);
  assert.equal(written.npcLoopV1?.residents[0]?.events.length, 1);
});

test("a clock tick settles only the next due hour", async () => {
  const save = initial("zh", "town");
  save.townMinutes = 613;
  save.npcLoopV1 = loop(540);
  let data = JSON.stringify(save);
  const hours: number[] = [];
  const store = {
    transaction: async (fn: (repo: { session: () => Promise<{ data: string; cursor: number }>; write: (owner: string, head: Save, cursor: number) => Promise<void> }) => Promise<unknown>) => fn({
      session: async () => ({ data, cursor: 3 }),
      write: async (_owner: string, head: Save) => { data = JSON.stringify(head); },
    }),
  };
  const clock = createNpcClock(store, async () => ({ type: "stay" }), () => "cafe", undefined, undefined, undefined, () => undefined, async (previous, minute) => {
    hours.push(minute);
    return { state: loop(minute), tick: { minute, accepted: [], rejected: [], moves: [] }, skipped: [] };
  });
  await clock.poke("owner", save.id);
  assert.deepEqual(hours, [600]);
  assert.equal(JSON.parse(data).npcLoopV1.minute, 600);
});
