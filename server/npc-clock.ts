import type { Save } from "../src/story/state";
import type { NpcTownState, NpcView, PresenceRound, Words, DayFacts, DayReflection } from "../src/npc/town";
import { runNpcHour } from "./npc-chat";

type Choose = (view: NpcView) => Promise<import("../src/npc/town").NpcIntent | import("../src/npc/town").NpcIntent[]>;
type Store = { transaction: (fn: (repo: { session: (owner: string, id: string) => Promise<{ data: string; cursor: number } | undefined>; write: (owner: string, head: Save, cursor: number, at: number) => Promise<unknown> }) => Promise<unknown>) => Promise<unknown> };

/** The next hour the loop should settle, or null when it already matches the clock. */
export function dueHour(settled: number | undefined, clock: number): number | null {
  if (!Number.isSafeInteger(clock) || clock < 0) return null;
  const boundary = clock - (clock % 60);
  if (settled === undefined) return boundary >= 540 ? 540 : null;
  const next = settled + 60;
  return next <= boundary ? next : null;
}

/** A player action must not roll the loop back to the snapshot it started from. */
export function keepNewerNpcLoop(next: Save, current: Save) {
  const live = current.npcLoopV1;
  const proposed = next.npcLoopV1;
  if (!live?.residents.length) return next;
  if (proposed?.residents.length && proposed.minute >= live.minute) return next;
  const kept = structuredClone(live);
  for (const resident of proposed?.residents ?? []) {
    const onto = kept.residents.find((item) => item.id === resident.id);
    if (!onto) continue;
    for (const event of resident.events) {
      if (!event.text?.[0]?.startsWith("玩家说")) continue;
      if (onto.events.some((item) => item.text[0] === event.text[0])) continue;
      onto.events.push(event);
    }
  }
  next.npcLoopV1 = kept;
  return next;
}

/** townMinutes is the only clock. The loop minute is the last hour of that clock already settled. */
export function createNpcClock(store: Store, choose: Choose, nearOf: (save: Save) => string | undefined, converse?: (speaker: NpcView, listener: NpcView) => Promise<PresenceRound[]>, narrate?: (view: NpcView, scene: string) => Promise<Words>, review?: (facts: DayFacts) => Promise<DayReflection>, assertReadable: (save: Save) => void = () => undefined, run: typeof runNpcHour = runNpcHour) {
  const running = new Set<string>();
  const announced = new Map<string, number>();
  const keyOf = (owner: string, id: string) => `${owner}\n${id}`;
  async function read(owner: string, id: string) {
    return store.transaction(async (repo) => {
      const row = await repo.session(owner, id);
      if (!row) return null;
      return JSON.parse(row.data) as Save;
    }) as Promise<Save | null>;
  }
  async function write(owner: string, id: string, baseMinute: number | undefined, state: NpcTownState) {
    return store.transaction(async (repo) => {
      const row = await repo.session(owner, id);
      if (!row) return false;
      const save = JSON.parse(row.data) as Save;
      const live = save.npcLoopV1;
      if ((live?.minute ?? undefined) !== baseMinute) return false;
      save.npcLoopV1 = state;
      for (const resident of live?.residents ?? []) {
        const onto = state.residents.find((item) => item.id === resident.id);
        if (!onto) continue;
        for (const event of resident.events) {
          if (!event.text?.[0]?.startsWith("玩家说")) continue;
          if (onto.events.some((item) => item.text[0] === event.text[0])) continue;
          onto.events.push(event);
        }
      }
      assertReadable(save);
      await repo.write(owner, save, row.cursor, Date.now());
      return true;
    }) as Promise<boolean>;
  }
  async function follow(owner: string, id: string) {
    try {
      for (let step = 0; step < 18; step += 1) {
        const save = await read(owner, id);
        if (!save) return;
        const clock = save.townMinutes ?? 540;
        const hour = dueHour(save.npcLoopV1?.minute, clock);
        if (hour === null) return;
        process.stderr.write(`npc hour ${hour} follows game clock ${clock}\n`);
        let state: NpcTownState;
        try {
          const settled = await run(save.npcLoopV1, hour, choose, nearOf(save), converse, narrate, review);
          state = settled.state;
          if (settled.skipped.length) process.stderr.write(`npc hour ${hour} skipped ${settled.skipped.map((item) => `${item.id}:${item.error}`).join(",")}\n`);
        } catch (error) {
          process.stderr.write(`npc hour ${hour} failed ${error instanceof Error ? error.message : error}\n`);
          return;
        }
        let wrote = false;
        try { wrote = await write(owner, id, save.npcLoopV1?.minute, state); }
        catch (error) {
          process.stderr.write(`npc hour ${hour} failed ${error instanceof Error ? error.message : error}\n`);
          return;
        }
        if (!wrote) {
          process.stderr.write(`npc hour ${hour} left for the next tick\n`);
          return;
        }
        process.stderr.write(`npc hour ${state.minute} settled\n`);
      }
    } catch (error) {
      process.stderr.write(`npc clock failed ${error instanceof Error ? error.message : error}\n`);
    }
  }
  return {
    poke(owner: string, id: string) {
      const key = keyOf(owner, id);
      if (running.has(key)) return Promise.resolve();
      running.add(key);
      return follow(owner, id).finally(() => running.delete(key));
    },
    unsent(id: string, minute: number) {
      return announced.get(id) !== minute;
    },
    mark(id: string, minute: number) {
      announced.set(id, minute);
    },
  };
}
