import { npcChatActQuestion, npcChatReplyQuestion, npcDecisionInput, npcKnownItemQuestion } from "./model";
import { sampleWeighted, type DecisionAnswer, type DecisionQuestion } from "./ports";
import type { ChatAct, NpcView, PresenceRound, Words } from "./town";

function drawn(answer: DecisionAnswer | undefined, random: () => number) {
  if (!answer || answer.type !== "choice" || !answer.choice.trim()) throw Error("NPC_DECIDE");
  return answer.probabilities?.length ? sampleWeighted(answer.probabilities, random) : answer.choice;
}

const agreed = new Set(["accept", "listen", "pass", "agree", "believe"]);

function knownItems(speaker: NpcView) {
  const worry = speaker.me.worry ? [{ id: "worry", text: speaker.me.worry, about: [] as string[], kind: "event" as const }] : [];
  const views = (speaker.pages ?? []).flatMap((page, index) => page.view ? [{ id: `p${index}`, text: page.view, about: [page.who], kind: "talk" as const }] : []);
  const events = (speaker.events ?? []).flatMap((event, index) => {
    if (event.sealed) return [];
    const kind = event.bent === "lie" ? "lie" as const : event.bent === "rumor" ? "rumor" as const : event.heard ? "heard" as const : "event" as const;
    return [{ id: `e${index}`, text: event.text, about: [event.who, ...(event.about ?? [])], kind }];
  });
  return [...worry, ...views, ...events].slice(0, 6);
}

/** Each side passes at most one fact. The act and the reply are drawn from the returned probabilities. `write` summarizes that fact, including a relay. */
export async function presenceRounds(ask: (input: string, questions: DecisionQuestion[]) => Promise<DecisionAnswer[]>, write: (facts: unknown) => Promise<Words>, speaker: NpcView, listener: NpcView, random: () => number = Math.random): Promise<PresenceRound[]> {
  const said = await remark(ask, write, speaker, listener, random);
  const heard = await remark(ask, write, listener, speaker, random);
  return [...(said ? [said] : []), ...(heard ? [heard] : [])];
}

async function remark(ask: (input: string, questions: DecisionQuestion[]) => Promise<DecisionAnswer[]>, write: (facts: unknown) => Promise<Words>, speaker: NpcView, listener: NpcView, random: () => number): Promise<PresenceRound | undefined> {
  try {
    const items = knownItems(speaker);
    const visible = { ...speaker, events: (speaker.events ?? []).filter((event) => !event.sealed) };
    const input = npcDecisionInput(visible, { id: listener.me.id, doing: listener.doing });
    const act = drawn(await ask(input, [npcChatActQuestion(visible, listener.me.id, items.map((item) => ({ id: item.id, text: item.text[1], about: item.about })))]).then((answers) => answers.find((item) => item.name === "act")), random);
    if (act === "nothing" || !isAct(act)) return;
    const needsItem = act === "relay" || act === "complain" || act === "rumor";
    const stake = needsItem || (act === "confide" && items.length) ? await pickItem(ask, input, items, random) : undefined;
    if (needsItem && !stake) return;
    const text = await write(act === "lie"
      ? { act, memory: items.map((item) => ({ text: item.text, about: item.about })) }
      : { act, persona: speaker.me.persona, aim: speaker.me.aim, worry: speaker.me.worry ?? null, stake: stake?.text ?? null });
    const listenerVisible = { ...listener, events: (listener.events ?? []).filter((event) => !event.sealed) };
    const replyInput = npcDecisionInput(listenerVisible, { id: speaker.me.id, doing: speaker.doing });
    const reply = drawn(await ask(`${replyInput}\nContent: ${text[1]}`, [npcChatReplyQuestion(act)]).then((answers) => answers.find((item) => item.name === "reply")), random);
    return { event: act, accepted: agreed.has(reply), text, answer: text, about: stake?.about ?? [listener.me.id], reply, who: speaker.me.id };
  } catch { return; }
}

async function pickItem(ask: (input: string, questions: DecisionQuestion[]) => Promise<DecisionAnswer[]>, input: string, items: { id: string; text: Words; about: string[]; kind: "event" | "talk" | "lie" | "rumor" | "heard" }[], random: () => number) {
  const picked = drawn(await ask(input, [npcKnownItemQuestion(items, [])]).then((answers) => answers.find((item) => item.name === "item")), random);
  return items.find((item) => item.id === picked);
}

function isAct(value: string): value is ChatAct {
  return value === "relay" || value === "complain" || value === "lie" || value === "rumor" || value === "promise" || value === "confide";
}
