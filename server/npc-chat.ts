import { npcActionQuestion, npcChangeInput, npcChangeQuestion, npcChatLineMessages, npcDecisionInput, npcDeedQuestion, npcDoingMessages, npcMoveQuestion, npcRewritePageMessages, npcRewriteSelfMessages, npcRewriteWorryMessages, npcSceneQuestion, npcWhenQuestion, todoWhen } from "../src/npc/model";
import { presenceRounds } from "../src/npc/presence";
import { choiceDrawn, decisionAnswers, decisionRequest, type DecisionQuestion } from "../src/npc/ports";
import { harborCast, harborLoopIds, harborScheduleDecide } from "../src/npc/harbor-cast";
import { admitPlayer, chapterItems, harborOpening, takePlayerReturns, type PlayerRequest, type Purse } from "../src/npc/society";
import { createNpcTown, dayReferenceOf, eventsForPage, type DayFacts, type DayReflection, type NpcIntent, type NpcTick, type NpcTownState, type NpcView, type PresenceRound, type Words } from "../src/npc/town";
import type { Action, Save } from "../src/story/state";
import { traceNpcExchange, traceNpcHourClose, traceNpcHourIdle, traceNpcHourOpen, type NpcSkip } from "./npc-log";

const decideUrl = process.env.HARBOR_NPC_DECIDE_URL || "https://chat.aiwaves.tech/aigram/api/chatgpt/decision";
const chatUrl = process.env.HARBOR_NPC_CHAT_URL || "https://chat.aiwaves.tech/aigram/api/game-chat";

async function postJson(url: string, body: unknown) {
  const started = Date.now();
  const kind = url === chatUrl ? "chat" as const : "decide" as const;
  let noted = false;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(60_000) });
    const raw = await response.text();
    let parsed: unknown = raw;
    try { parsed = JSON.parse(raw); } catch { /* keep the text */ }
    traceNpcExchange(kind, body, { response: parsed, error: response.ok ? undefined : `NPC_REMOTE ${response.status}`, ms: Date.now() - started });
    noted = true;
    if (!response.ok) throw Error("NPC_REMOTE");
    return parsed;
  } catch (error) {
    if (!noted) traceNpcExchange(kind, body, { error: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
    throw error;
  }
}

async function ask(input: string, questions: DecisionQuestion[]) {
  return decisionAnswers(await postJson(decideUrl, decisionRequest(input, questions)));
}

const solo = new Set(["work", "quote", "trade", "gift", "borrow", "return", "reserve", "speak", "attend", "accept", "refuse", "deliver"]);

/** Keep a spoken line as the model wrote it. */
export function fitSpoken(lines: unknown): Words {
  if (!Array.isArray(lines) || lines.length !== 2 || lines.some((line) => typeof line !== "string" || !line.trim())) throw Error("NPC_REMOTE");
  return [lines[0].trim(), lines[1].trim()];
}

/** Where they stand, and separately one ledger action. A reply that is already waiting replaces both. */
export function createNpcDecision() {
  return async (view: NpcView): Promise<NpcIntent | NpcIntent[]> => {
    const input = npcDecisionInput(view);
    if (view.reply) {
      const action = choiceDrawn(await ask(input, [npcActionQuestion(view)]), "action");
      if (action === "accept" || action === "refuse" || action === "sign") return { type: action };
      throw Error("NPC_DECIDE");
    }
    const place = choiceDrawn(await ask(input, [npcMoveQuestion(view)]), "move");
    const move: NpcIntent = place === "go" ? { type: "go", scene: choiceDrawn(await ask(input, [npcSceneQuestion(view, "go")]), "scene") } : { type: "stay" };
    const deeds = npcDeedQuestion(view);
    if (!deeds) return move;
    const deed = choiceDrawn(await ask(input, [deeds]), "deed");
    if (deed === "nothing") return move;
    if (deed === "invite") {
      const when = todoWhen(view.minute, choiceDrawn(await ask(input, [npcWhenQuestion(view.minute)]), "when"));
      if (!when) throw Error("NPC_DECIDE");
      return [move, { type: "invite", when }];
    }
    if (deed === "propose" || deed === "exit" || solo.has(deed)) return [move, { type: deed } as NpcIntent];
    throw Error("NPC_DECIDE");
  };
}

/** A short line of what they are doing at this place, for the player to hear. */
export function createNpcNarrate() {
  return async (view: NpcView, scene: string): Promise<Words> => {
    const body = await postJson(chatUrl, { messages: npcDoingMessages(scene, { persona: view.me.persona, aim: view.me.aim, worry: view.me.worry ?? null, dayReference: dayReferenceOf(view.anchors, view.me.aim), pages: (view.pages ?? []).filter((page) => page.view).slice(0, 3), events: (view.events ?? []).slice(0, 3) }) });
    const text = (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw Error("NPC_REMOTE");
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")) as { doing?: unknown };
    return fitSpoken(parsed.doing);
  };
}

/** While two residents share a place, each may say one thing. The decision picks the kind. The chat model writes the line. */
export function createNpcConverse() {
  return (speaker: NpcView, listener: NpcView): Promise<PresenceRound[]> => presenceRounds(ask, writeLine, speaker, listener);
}

async function writeLine(facts: unknown): Promise<Words> {
  return parseLine(chatText(await postJson(chatUrl, { messages: npcChatLineMessages(facts) })), false).text;
}

function parseLine(raw: unknown, withTrust: boolean): { text: Words; trust?: number } {
  const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")) as { text?: unknown; trust?: unknown } : null;
  const text = fitSpoken(parsed?.text);
  const trust = parsed?.trust;
  if (withTrust && (!Number.isInteger(trust) || (trust as number) < -2 || (trust as number) > 2)) throw Error("NPC_REMOTE");
  return { text: [text[0].trim(), text[1].trim()], trust: withTrust ? trust as number : undefined };
}

const chatText = (body: unknown) => (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;

/** At the end of the day, a decision says whether today's events change a view or the temperament. The chat model writes only a yes. */
export function createNpcReview() {
  return async (facts: DayFacts): Promise<DayReflection> => {
    const pages: DayReflection["pages"] = [];
    for (const who of [...new Set(facts.events.flatMap((item) => [item.who, ...(item.about ?? [])]))]) {
      const page = facts.pages.find((item) => item.who === who);
      if (!page) continue;
      const events = eventsForPage(facts, who);
      if (!events.some((item) => item.who === who || item.about?.includes(who))) continue;
      const packet = { id: facts.id, persona: facts.persona, aim: facts.aim, temperament: facts.temperament ?? null, worry: facts.worry ?? null, page, events, ledger: facts.ledger };
      try {
        const answers = await ask(npcChangeInput("page", packet), [npcChangeQuestion("page")]);
        const row = answers.find((item) => item.name === "change");
        if (!row || row.type !== "predicate" || row.probability < 0.5) continue;
        const written = parseLine(chatText(await postJson(chatUrl, { messages: npcRewritePageMessages(packet) })), false);
        pages.push({ who, text: written.text });
      } catch { /* this person stays as they were */ }
    }
    let temperament: Words | null = null;
    const self = { id: facts.id, persona: facts.persona, aim: facts.aim, temperament: facts.temperament, worry: facts.worry ?? null, events: facts.events };
    try {
      const answers = await ask(npcChangeInput("self", self), [npcChangeQuestion("self")]);
      const row = answers.find((item) => item.name === "change");
      if (row && row.type === "predicate" && row.probability >= 0.5) temperament = parseLine(chatText(await postJson(chatUrl, { messages: npcRewriteSelfMessages(self) })), false).text;
    } catch { temperament = null; }
    let worry: Words | null | undefined;
    const attention = { id: facts.id, persona: facts.persona, aim: facts.aim, temperament: facts.temperament, worry: facts.worry ?? null, events: facts.events, ledger: facts.ledger };
    try {
      const answers = await ask(npcChangeInput("worry", attention), [npcChangeQuestion("worry")]);
      const row = answers.find((item) => item.name === "change");
      if (row && row.type === "predicate" && row.probability >= 0.5) {
        const raw = chatText(await postJson(chatUrl, { messages: npcRewriteWorryMessages(attention) }));
        const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")) as { text?: unknown } : null;
        worry = parsed?.text === null ? null : parseLine(raw, false).text;
      }
    } catch { worry = undefined; }
    return { pages, temperament, ...(worry !== undefined ? { worry } : {}) };
  };
}

/** The decision pass reads every short note and keeps the ones this question needs. A failed call leaves the whole short set. */
export async function selectPapers(question: string, docs: { id: string; text: string }[]) {
  if (!docs.length) return [];
  try {
    const answers = await ask(question, docs.map((doc) => ({ type: "predicate" as const, name: doc.id, instructions: `The player asked: ${question}\nNote: ${doc.text}\nDoes the reply need this note?` })));
    return docs.filter((doc) => {
      const row = answers.find((item) => item.name === doc.id);
      return row?.type === "predicate" && row.probability >= 0.5;
    }).map((doc) => doc.id);
  } catch {
    return docs.map((doc) => doc.id);
  }
}

/** Persona, aim, worry, temperament, and whoever is already here always stay. Only pages, events, and errands the decision pass kept are added. */
export async function playerMemoryFacts(previous: NpcTownState | undefined, id: string, question: string, choose: (question: string, docs: { id: string; text: string }[]) => Promise<string[]> = selectPapers) {
  if (!harborLoopIds.includes(id) || !harborCast().some((resident) => resident.id === id)) return;
  const town = createNpcTown({ residents: harborCast(), minute: previous?.minute ?? 540, resume: previous, decide: harborScheduleDecide });
  const docs = town.listDocuments(id);
  let selected: string[] | undefined;
  if (question.trim() && docs.length) {
    try { selected = await choose(question.trim(), docs); }
    catch { selected = undefined; }
  }
  return town.consult(id, selected);
}

const clip = (text: string) => text.trim().slice(0, 120);

/** A question that matters rewrites this resident's page on the player immediately. */
export async function recordPlayerTalk(previous: NpcTownState | undefined, id: string, minute: number, question: string, reply: Words) {
  if (!previous || !harborLoopIds.includes(id) || !harborCast().some((resident) => resident.id === id)) return previous;
  const text: Words = [`玩家说「${clip(question)}」。我答「${clip(reply[0])}」。`, `The player said “${clip(question)}”. I answered “${clip(reply[1])}”.`];
  const town = createNpcTown({ residents: harborCast(), minute: previous.minute, resume: previous, decide: harborScheduleDecide });
  return town.rememberPlayer(id, text, minute);
}

export function npcDialogueContext() {
  return (s: { npcLoopV1?: NpcTownState }, person: string, question: string) => playerMemoryFacts(s.npcLoopV1, person, question, selectPapers);
}

/** One settled hour. `tick` is null when this boundary was already settled. A thrown choice is listed in `skipped` and still skips only that resident. */
export async function runNpcHour(previous: NpcTownState | undefined, minute: number, choose: (view: NpcView) => Promise<NpcIntent | NpcIntent[]>, near?: string, converse?: (speaker: NpcView, listener: NpcView) => Promise<PresenceRound[]>, narrate?: (view: NpcView, scene: string) => Promise<Words>, review?: (facts: DayFacts) => Promise<DayReflection>): Promise<{ state: NpcTownState; tick: NpcTick | null; skipped: NpcSkip[] }> {
  const boundary = minute - (minute % 60);
  if (previous && previous.minute >= boundary) {
    traceNpcHourIdle(boundary);
    return { state: previous, tick: null, skipped: [] };
  }
  traceNpcHourOpen(boundary);
  const skipped: NpcSkip[] = [];
  const guarded = async (view: NpcView) => {
    try { return await choose(view); }
    catch (error) {
      skipped.push({ id: view.me.id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  const society = previous?.society ?? harborOpening();
  const town = createNpcTown({ residents: harborCast(), minute: boundary, resume: previous ? { ...previous, society } : { residents: [], society }, converse, narrate, review, decide: harborScheduleDecide });
  const tick = await town.commit(guarded, near);
  const state = town.state();
  traceNpcHourClose(state, tick, skipped);
  return { state, tick, skipped };
}

export async function settleNpcLoop(previous: NpcTownState | undefined, minute: number, choose: (view: NpcView) => Promise<NpcIntent | NpcIntent[]>, near?: string, converse?: (speaker: NpcView, listener: NpcView) => Promise<PresenceRound[]>, narrate?: (view: NpcView, scene: string) => Promise<Words>, review?: (facts: DayFacts) => Promise<DayReflection>) {
  return (await runNpcHour(previous, minute, choose, near, converse, narrate, review)).state;
}

const textOf = (value: unknown) => typeof value === "string" ? value : "";
const countOf = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0 ? value as number : 0;

function playerRequest(action: Action): PlayerRequest {
  const payload = action.payload as Record<string, unknown> | undefined;
  if (action.action === "society-message") return { type: "message", to: textOf(payload?.to), text: textOf(payload?.text) };
  if (action.action === "society-accept") return { type: "accept-quote", quote: textOf(payload?.quote) };
  if (action.action === "society-gift") {
    const to = textOf(payload?.to);
    const cash = countOf(payload?.cash);
    if (cash) return { type: "gift", to, cash, qty: cash };
    const item = textOf(payload?.item);
    if (!item || chapterItems.has(item)) throw Error("PLAYER_RESOURCE");
    return { type: "gift", to, item, qty: countOf(payload?.qty) };
  }
  if (action.action === "society-deliver") return { type: "deliver", commission: textOf(payload?.commission), scene: action.scene };
  throw Error("PLAYER_ACTION");
}

/** A player society act settles on the chapter purse and the resident bags. It does not start an NPC round or touch chapter flags. */
export function commitPlayerSociety(save: Save, action: Action, minute: number) {
  const head = structuredClone(save);
  const purse: Purse = { cash: head.cash, items: { ...head.items } };
  if (head.npcLoopV1?.society) foldReturns(purse, takePlayerReturns(head.npcLoopV1.society));
  const result = admitPlayer(head.npcLoopV1?.society ?? harborOpening(), playerRequest(action), minute, purse);
  if (result.reason) throw Error(result.reason);
  const loop = head.npcLoopV1 ?? { minute, residents: [], talked: [], society: harborOpening() };
  loop.society = result.ledger;
  head.npcLoopV1 = loop;
  head.cash = Math.min(999, result.purse.cash);
  head.items = result.purse.items;
  head.position = { ...action.position };
  head.version++;
  head.cursor++;
  head.history = [...head.history, { id: action.action_id, kind: "action" as const, text: result.text }].slice(-500);
  return { head, text: result.text };
}

/** Put NPC resolutions back into the chapter purse. Flags and quest items stay. */
export function collectPlayerReturns(save: Save) {
  const ledger = save.npcLoopV1?.society;
  if (!ledger) return;
  const purse: Purse = { cash: save.cash, items: save.items };
  foldReturns(purse, takePlayerReturns(ledger));
  save.cash = Math.min(999, purse.cash);
}

function foldReturns(purse: Purse, back: { cash: number; items: Record<string, number> }) {
  purse.cash += back.cash;
  for (const [id, qty] of Object.entries(back.items)) {
    if (!qty || chapterItems.has(id)) continue;
    purse.items[id] = (purse.items[id] ?? 0) + qty;
  }
}

/** The walk is visible next round. It does not trade, sign, or spend. */
export function notePlayerMove(previous: NpcTownState | undefined, scene: string, minute: number): NpcTownState {
  const result = admitPlayer(previous?.society ?? harborOpening(), { type: "move", scene }, minute);
  const base = previous ?? { minute, residents: [], talked: [], society: harborOpening() };
  return { ...base, society: result.ledger };
}
