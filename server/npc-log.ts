import { appendFileSync } from "node:fs";
import type { Bag } from "../src/npc/society";
import type { NpcIntent, NpcTick, NpcTownState, Words } from "../src/npc/town";

export type NpcSkip = { id: string; error: string };

const file = () => {
  const path = process.env.HARBOR_NPC_LOG;
  return path && path !== "0" ? path : null;
};

function write(text: string) {
  const path = file();
  if (!path) return;
  appendFileSync(path, text);
}

function parsed(text: string) {
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

function whoOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const me = row.me;
  if (me && typeof me === "object" && typeof (me as { id?: unknown }).id === "string") return (me as { id: string }).id;
  if (typeof row.speaker === "string") return row.speaker;
  if (typeof row.listener === "string" && row.role === "answer") return row.listener;
  if (typeof row.persona === "string") return row.persona.slice(0, 60);
  return null;
}

/** A short label for one model call, taken from the request itself. */
export function labelNpcRequest(body: unknown): { who: string | null; purpose: string } {
  if (!body || typeof body !== "object") return { who: null, purpose: "call" };
  const row = body as Record<string, unknown>;
  if (typeof row.input === "string") {
    const facts = parsed(row.input.split("\nSaid:")[0]);
    const questions = Array.isArray(row.questions) ? row.questions : [];
    const first = questions[0] as { name?: unknown; type?: unknown } | undefined;
    const name = typeof first?.name === "string" ? first.name : "decide";
    const purpose = name === "change" ? (facts && typeof facts === "object" && "page" in facts ? "review-page" : "review-self")
      : questions.length > 1 && questions.every((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "predicate") ? "papers"
      : name;
    return { who: whoOf(facts), purpose };
  }
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const system = messages.find((item) => item && typeof item === "object" && (item as { role?: unknown }).role === "system") as { content?: unknown } | undefined;
  const user = messages.find((item) => item && typeof item === "object" && (item as { role?: unknown }).role === "user") as { content?: unknown } | undefined;
  const content = typeof system?.content === "string" ? system.content : "";
  const facts = typeof user?.content === "string" ? parsed(user.content) : null;
  const purpose = content.startsWith("Write what this resident") ? "doing"
    : content.startsWith("Write one spoken") ? "line"
    : content.startsWith("Rewrite one view") ? "rewrite-page"
    : content.startsWith("Rewrite how this person") ? "rewrite-self"
    : "chat";
  return { who: whoOf(facts), purpose };
}

/** The log shows the English slot of a bilingual line. The model still receives both. */
function englishOnly(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "string")) return value[1].trim() || value[0];
  if (Array.isArray(value)) return value.map(englishOnly);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, englishOnly(item)]));
  return value;
}

/** Pretty-print a request, expanding JSON strings the model actually receives. */
export function presentNpcRequest(body: unknown): string {
  if (!body || typeof body !== "object") return JSON.stringify(body, null, 2);
  const row = body as Record<string, unknown>;
  if (typeof row.input === "string") {
    const [facts, ...said] = row.input.split("\nSaid:");
    return JSON.stringify({
      input: englishOnly(parsed(facts) ?? row.input),
      ...(said.length ? { said: said.join("\nSaid:").trim() } : {}),
      questions: row.questions,
    }, null, 2);
  }
  if (Array.isArray(row.messages)) {
    return JSON.stringify({
      messages: row.messages.map((message) => {
        if (!message || typeof message !== "object") return message;
        const item = message as { role?: unknown; content?: unknown };
        const content = typeof item.content === "string" ? englishOnly(parsed(item.content) ?? item.content) : englishOnly(item.content);
        return { role: item.role, content };
      }),
    }, null, 2);
  }
  return JSON.stringify(englishOnly(body), null, 2);
}

export function clockLabel(minute: number) {
  const day = Math.floor(minute / 1440) + 1;
  const clock = ((minute % 1440) + 1440) % 1440;
  const hh = String(Math.floor(clock / 60)).padStart(2, "0");
  const mm = String(clock % 60).padStart(2, "0");
  const period = clock < 360 || clock >= 1260 ? "夜间" : clock < 720 ? "上午" : clock < 1020 ? "午后" : "傍晚";
  return `第${day}天 ${period} ${hh}:${mm}（minute ${minute}）`;
}

function actionText(action: NpcIntent) {
  if (action.type === "go" || action.type === "plan") return `${action.type} ${action.scene}`;
  if (action.type === "talk") return `talk ${action.who}`;
  if (action.type === "invite") return `invite day ${action.when.day} from ${action.when.from}`;
  return action.type;
}

const line = (text: Words | null | undefined) => text?.[1]?.trim() || text?.[0]?.trim() || "（空）";

function bagText(bag: Bag | undefined) {
  if (!bag) return "（没有包）";
  const items = Object.entries(bag.items).map(([id, stack]) => `${id} ${stack.amount}${stack.locked ? ` 锁${stack.locked}` : ""}${stack.until !== undefined ? ` 至${stack.until}` : ""}`);
  return `现金 ${bag.cash}，锁定 ${bag.cashLocked}${items.length ? `，${items.join("，")}` : ""}`;
}

/** Append one model call. Does nothing unless HARBOR_NPC_LOG is a file path. */
export function traceNpcExchange(kind: "decide" | "chat", body: unknown, result: { response?: unknown; error?: string; ms: number }) {
  if (!file()) return;
  const label = labelNpcRequest(body);
  const head = `\n--- ${kind}  ${label.purpose}  ${label.who ?? "（未标出是谁）"}  ${result.ms}ms${result.error ? `  失败 ${result.error}` : ""} ---\n`;
  const response = result.response === undefined ? "（没有响应体）" : JSON.stringify(result.response, null, 2);
  write(`${head}请求\n${presentNpcRequest(body)}\n\n响应\n${response}\n`);
}

export function traceNpcHourOpen(minute: number) {
  write(`\n======== ${clockLabel(minute)} ========\n`);
}

export function traceNpcHourIdle(minute: number) {
  write(`\n======== ${clockLabel(minute)} ========\n这一小时已经结算过，没有新的调用。\n`);
}

/** Memory, the hour's actions, and the ledger after the calls above. */
export function traceNpcHourClose(state: NpcTownState, tick: NpcTick | null, skipped: NpcSkip[]) {
  if (!file() || !tick) return;
  const names = new Map(state.residents.map((resident) => [resident.id, resident.name]));
  const nameOf = (id: string) => {
    const name = names.get(id);
    return Array.isArray(name) ? `${name[0]} ${id}` : `${name ?? id} ${id}`;
  };
  const accepted = tick.accepted.map((item) => `- ${nameOf(item.id)}  ${actionText(item.action)}`).join("\n") || "- （没有）";
  const rejected = tick.rejected.map((item) => `- ${nameOf(item.id)}  ${actionText(item.action)}  ${item.reason}`).join("\n") || "- （没有）";
  const missed = skipped.map((item) => `- ${nameOf(item.id)}  ${item.error}`).join("\n") || "- （没有）";
  const moves = tick.moves.map((item) => `- ${nameOf(item.id)}  → ${item.scene}`).join("\n") || "- （没有）";
  const people = state.residents.map((resident) => {
    const pages = resident.pages.map((page) => `  - ${page.who}（${page.met}）${page.view ? line(page.view) : "no view yet"}`).join("\n") || "  - （没有）";
    const events = resident.events.map((event) => {
      const marks = [event.sealed ? "sealed" : "", event.heard ? "heard" : "", event.bent ?? "", event.about?.length ? `about ${event.about.join(",")}` : ""].filter(Boolean).join(" ");
      return `  - ${event.who}${marks ? ` [${marks}]` : ""}  ${line(event.text)}`;
    }).join("\n") || "  - （没有）";
    const todos = resident.todos.map((todo) => `  - 第${todo.day + 1}天 ${todo.from} ${todo.scene} 找 ${todo.who}：${todo.intent}`).join("\n") || "  - （没有）";
    return [
      `\n## ${nameOf(resident.id)}  在 ${resident.scene}`,
      `正在做：${resident.doing ? line(resident.doing) : "（没有，玩家会看到固定的活动说明）"}`,
      `长期：${resident.goal.intent}`,
      `烦恼：${resident.worry ? line(resident.worry) : "（没有）"}`,
      `性情：${resident.temperament ? line(resident.temperament) : "（没有）"}`,
      `随身：${bagText(state.society.bags[resident.id])}`,
      "对人的看法：",
      pages,
      "今天的事：",
      events,
      "待办：",
      todos,
    ].join("\n");
  }).join("\n");
  const ledger = (["quotes", "commissions", "proposals", "deals", "pendingGifts", "pendingMeets", "exitRequests", "pendingDeliveries", "jobs", "requests", "speeches", "attendance", "slots", "loans", "invites"] as const)
    .flatMap((key) => {
      const rows = state.society[key];
      return rows?.length ? [`\n${key}\n${JSON.stringify(rows, null, 2)}`] : [];
    }).join("\n");
  write([
    "\n----- 这一小时的结果 -----",
    "接受",
    accepted,
    "拒绝",
    rejected,
    "调用失败，这一轮跳过",
    missed,
    "移动",
    moves,
    "\n----- 结算后的记忆 -----",
    people,
    "\n----- 账本里有内容的部分 -----",
    ledger || "（只有各人的随身物品）",
    "\n",
  ].join("\n"));
}
