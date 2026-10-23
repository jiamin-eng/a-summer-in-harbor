import { harborGathering, harborVenue, harborWorkFor, npcPermit, openQuote, ownMaterial, type DecisionLimits, type NpcAttempt, type SocietyLedger } from "./society";

/** The cases the model is told about. Names here are what the prompt lists. */
export function decisionCases(): { name: string; action: NpcAttempt["action"] }[] {
  return [
    { name: "wait", action: { type: "wait" } },
    { name: "move", action: { type: "move", scene: "here" } },
    { name: "plan", action: { type: "plan" } },
    { name: "speak", action: { type: "speak" } },
    { name: "message", action: { type: "message", to: "listener", settles: false } },
    { name: "message-settle", action: { type: "message", to: "listener", settles: true } },
    { name: "work", action: { type: "work", for: null, present: true } },
    { name: "work-for-someone", action: { type: "work", for: "someone", present: true } },
    { name: "work-away", action: { type: "work", for: null, present: false } },
    { name: "trade", action: { type: "trade", quote: null } },
    { name: "gift", action: { type: "gift", item: "wood", qty: 1 } },
    { name: "borrow", action: { type: "borrow", tool: "tool" } },
    { name: "return", action: { type: "return", tool: "tool" } },
    { name: "quote", action: { type: "quote", item: "goods", qty: 1 } },
    { name: "accept", action: { type: "accept" } },
    { name: "refuse", action: { type: "refuse" } },
    { name: "reserve", action: { type: "reserve", slot: "dock" } },
    { name: "propose", action: { type: "propose", with: "partner" } },
    { name: "sign", action: { type: "sign", proposal: null } },
    { name: "exit", action: { type: "exit", deal: null } },
    { name: "invite", action: { type: "invite", with: "partner", day: 1, from: 720, intent: "meet" } },
    { name: "attend", action: { type: "attend", event: "gathering", present: true } },
    { name: "deliver", action: { type: "deliver", commission: null } },
    { name: "administer", action: { type: "administer" } },
  ];
}

const playerMay = ["move", "accept-quote", "gift", "deliver", "message"];
const playerMayNot = ["create-resource", "settle-without-terms", "extra-planning-round"];

function pack(rows: { action: string; reason: string | null }[]): DecisionLimits {
  return {
    may: rows.filter((row) => !row.reason).map((row) => row.action),
    mayNot: rows.filter((row) => row.reason).map((row) => ({ action: row.action, reason: row.reason! })),
    playerMay,
    playerMayNot,
  };
}

const caseAlias: Record<string, string> = { stay: "wait", go: "move", talk: "message" };

/** The cases this resident can actually attempt, plus the two actions nobody may smuggle in. */
export function residentCases(ledger: SocietyLedger, id: string, scene: string, minute: number, names: string[]): { name: string; action: NpcAttempt["action"] }[] {
  const wanted = new Set(names.map((name) => caseAlias[name] ?? name));
  wanted.add("message-settle");
  wanted.add("administer");
  if (wanted.has("work") && !harborWorkFor[id]) wanted.add("work-for-someone");
  const material = ownMaterial(ledger, id, minute) ?? "wood";
  const quote = openQuote(ledger, id, minute);
  const borrow = ledger.loans.find((item) => item.holder === id && !item.held && item.until >= minute);
  const returning = ledger.loans.find((item) => item.holder === id && item.held && item.until >= minute);
  const client = harborWorkFor[id];
  const proposal = ledger.proposals.find((item) => item.parties.includes(id) && !item.signed.includes(id) && item.until >= minute && (item.signable ?? 0) <= minute);
  const deal = ledger.deals.find((item) => item.parties.includes(id));
  const job = ledger.commissions.find((item) => item.to === id && item.scene === scene && item.until >= minute);
  const rows: { name: string; action: NpcAttempt["action"] }[] = [];
  const add = (name: string, action: NpcAttempt["action"]) => { if (wanted.has(name)) rows.push({ name, action }); };
  add("wait", { type: "wait" });
  add("move", { type: "move", scene: "here" });
  add("plan", { type: "plan" });
  add("speak", { type: "speak" });
  add("message", { type: "message", to: "listener", settles: false });
  add("message-settle", { type: "message", to: "listener", settles: true });
  add("work", { type: "work", for: client ?? null, present: true });
  if (!client) add("work-for-someone", { type: "work", for: "someone", present: true });
  add("quote", { type: "quote", item: material, qty: 1 });
  add("trade", { type: "trade", quote: quote?.id ?? null });
  add("gift", { type: "gift", item: material, qty: 1 });
  add("borrow", { type: "borrow", tool: borrow?.tool ?? "tool" });
  add("return", { type: "return", tool: returning?.tool ?? "tool" });
  add("reserve", { type: "reserve", slot: harborVenue[id] ?? "dock" });
  add("propose", { type: "propose", with: "partner" });
  add("sign", { type: "sign", proposal: proposal?.id ?? null });
  add("exit", { type: "exit", deal: deal?.id ?? null });
  add("invite", { type: "invite", with: "partner", day: 1, from: 720, intent: "meet" });
  add("attend", { type: "attend", event: harborGathering[id] ?? "gathering", present: (harborGathering[id] ?? "gathering") === scene });
  add("deliver", { type: "deliver", commission: job?.id ?? null });
  add("accept", { type: "accept" });
  add("refuse", { type: "refuse" });
  add("administer", { type: "administer" });
  return rows;
}

export function codedBrief(ledger: SocietyLedger, id: string, scene: string, minute: number, cases = decisionCases()): DecisionLimits {
  return pack(cases.map((item) => ({ action: item.name, reason: npcPermit(ledger, { id, scene, minute, action: item.action }) })));
}

/** The same ledger rules the player settles with. Residents do not ask Prolog. */
export function decisionBrief(ledger: SocietyLedger, id: string, scene: string, minute: number, names?: string[]): Promise<DecisionLimits> {
  const cases = names ? residentCases(ledger, id, scene, minute, names) : decisionCases();
  return Promise.resolve(codedBrief(ledger, id, scene, minute, cases));
}
