import type { Words } from "./town";

/** One stack in a bag. `until` is the minute this stack stops being sellable. Cash is not a stack. */
export type Stack = { amount: number; locked: number; until?: number; borrowed?: boolean };
/** The same shape as the player bag: one purse, and items by the same ids. */
export type Bag = { cash: number; cashLocked: number; items: Record<string, Stack> };
/** The player bag lives on the chapter save. A call passes it in and writes it back. */
export type Purse = { cash: number; items: Record<string, number> };
export type Quote = { id: string; seller: string; item: string; qty: number; price: number; until: number; reserved: boolean };
export type Commission = { id: string; from: string; to: string; item: string; qty: number; scene: string; until: number; pay: number };
export type Proposal = { id: string; parties: string[]; signed: string[]; until: number; scene?: string; signable?: number };
export type PendingMeet = { id: string; from: string; to: string; scene: string; day: number; slot: 360 | 720 | 1020; intent: string; until: number; ready: number };
export type ExitRequest = { id: string; deal: string; from: string; to: string; until: number; ready: number };
export type Deal = { id: string; parties: string[]; allowSolo: boolean };
export type Slot = { id: string; holder: string; until: number };
export type Loan = { id: string; owner: string; holder: string; tool: string; until: number; held?: boolean };
export type Job = { id: string; who: string; item: string; ready: number; done: boolean };
export type ReserveRequest = { id: string; slot: string; who: string; until: number };
export type PendingDelivery = { id: string; quote: string; buyer: string; until: number };
export type Speech = { id: string; from: string; scene: string; minute: number; text: Words; heard: string[] };
export type Attendance = { event: string; who: string; minute: number };
export type Invite = { id: string; event: string; who: string; open: boolean };
export type PendingGift = { id: string; from: string; to: string; item?: string; cash?: number; qty: number; until: number };
export type PlayerAct =
  | { type: "move"; scene: string; minute: number }
  | { type: "accept-quote"; quote: string; minute: number }
  | { type: "gift"; to: string; item?: string; cash?: number; qty: number; minute: number }
  | { type: "deliver"; commission: string; minute: number }
  | { type: "message"; to: string; text: string; minute: number };
export type PlayerReturns = { cash: number; items: Record<string, number> };
export type SocietyLedger = {
  bags: Record<string, Bag>;
  /** Items and cash a later save write must put back into the player bag. */
  playerReturns: PlayerReturns;
  quotes: Quote[];
  commissions: Commission[];
  proposals: Proposal[];
  deals: Deal[];
  slots: Slot[];
  loans: Loan[];
  invites: Invite[];
  pendingGifts: PendingGift[];
  playerLog: PlayerAct[];
  jobs: Job[];
  requests: ReserveRequest[];
  pendingMeets: PendingMeet[];
  exitRequests: ExitRequest[];
  pendingDeliveries: PendingDelivery[];
  speeches: Speech[];
  attendance: Attendance[];
};
export type Heard = { minute: number; type: PlayerAct["type"]; to?: string; scene?: string; text?: string };
export type DecisionLimits = { may: string[]; mayNot: { action: string; reason: string }[]; playerMay: string[]; playerMayNot: string[] };

/** Read by the decision model with the ledger verdict. This is the boundary, not a suggestion. */
export const SOCIETY_RULES = "Where they stand and one ledger action are decided separately this hour. A move does not cancel work, a quote, a purchase, a gift, borrowing, speaking, a proposal, or an invitation. When a reply is already waiting, that reply is the only action: a gift, a reservation, an invitation, a request to leave, or a proposal that names you. It is not a promise to be somewhere later. A message has one audience and does not accept a quote, reserve a place, sign, exit a deal, or create items or cash. Working spends one item from your own bag, or a commission already in force, and you must already be there. It also needs a tool you still hold: one you own and have not lent, or one a loan has put in your hands. You cannot work in a venue slot someone else already holds. The hour of labor is this action. The product arrives on a later hour and cannot be collected early. The worker later delivers those goods at the commission place: the goods go to the employer and the reserved pay goes to the worker. Publishing a quote locks that stack and is not a sale. A stack with an until minute cannot be quoted, gifted, or bought once that minute has passed. A trade settles in this hour when you are the buyer, the reserved quote is still open, you already have the cash, and you stand where the seller stands. Otherwise the price is reserved and it stays a pending delivery until a later hour finds you in the same place, or the quote ends and both reserves are released. One pending delivery holds that quote. Another buyer does not lock a second price on it. A gift locks the giver's stack until the recipient accepts or refuses. Refusing or missing that time releases the reserve and does not transfer it. Borrowing a tool does not make you the owner, and a borrowed stack cannot be sold, gifted, or lent on. Returning it follows the original loan. An unconfirmed reservation is only a request: it does not occupy the slot, and it is not attendance or labor. Signing locks only your own part of an existing proposal. A commission is published only when the employer can reserve its pay. It lasts from the hour everyone named has signed. Missing that time, or leaving the cooperation, releases the reserved pay and does not transfer it. Nobody administers the town, including the priest. limits.mayNot cannot be done, including by wording them as talk, a plan, or a message. The player, between rounds, may only move, accept an existing reserved quote, gift cash or an item they already hold, deliver an existing commission that names them as the worker, or leave one message. The player cannot create items or cash by speaking, settle without those existing terms, or start an extra planning round. The heard array lists what the player did on earlier rounds. An event marked heard was told to this resident and was not witnessed. A player message is not a yes.";
export type PlayerRequest =
  | { type: "move"; scene: string }
  | { type: "accept-quote"; quote: string }
  | { type: "gift"; to: string; item?: string; cash?: number; qty?: number }
  | { type: "deliver"; commission: string; scene: string }
  | { type: "message"; to: string; text: string };
export type NpcAttempt = {
  id: string;
  scene: string;
  minute: number;
  action:
    | { type: "wait" }
    | { type: "move"; scene: string }
    | { type: "message"; to: string; settles: boolean }
    | { type: "plan" }
    | { type: "speak" }
    | { type: "work"; for: string | null; present: boolean }
    | { type: "trade"; quote: string | null }
    | { type: "gift"; item: string; qty: number; to?: string }
    | { type: "borrow"; tool: string }
    | { type: "return"; tool: string }
    | { type: "quote"; item: string; qty: number }
    | { type: "accept" }
    | { type: "refuse" }
    | { type: "reserve"; slot: string }
    | { type: "propose"; with?: string }
    | { type: "sign"; proposal: string | null }
    | { type: "exit"; deal: string | null }
    | { type: "invite"; with: string; day: number; from: 360 | 720 | 1020; intent: string }
    | { type: "attend"; event: string; present: boolean }
    | { type: "deliver"; commission: string | null }
    | { type: "administer" };
};

const materialOrder = ["wood", "crop-tomato", "crop-radish", "crop-basil", "fish", "goods"];
/** Chapter objects stay out of a society gift. Wood and crops can move when the player names them. */
export const chapterItems = new Set(["key", "toolbag", "toolkit", "photo", "route"]);
const copy = <T>(value: T): T => structuredClone(value);
const whole = (value: number) => Number.isSafeInteger(value) && value > 0;
const named = (value: string) => typeof value === "string" && value.trim().length > 0 && value.length <= 40;

export function emptyLedger(): SocietyLedger {
  return { bags: {}, playerReturns: { cash: 0, items: {} }, quotes: [], commissions: [], proposals: [], deals: [], slots: [], loans: [], invites: [], pendingGifts: [], playerLog: [], jobs: [], requests: [], pendingMeets: [], exitRequests: [], pendingDeliveries: [], speeches: [], attendance: [] };
}

/** A fixed price for a published quote. An opening stand-in, not a negotiated rate. */
export const quotePrice = 2;

/** Where that resident may ask to stand. Confirmation is a later round, so asking does not take the slot. */
export const harborVenue: Record<string, string> = {
  owen: "workshop",
  mara: "market",
  june: "stall",
  ruth: "dock",
  nell: "courtyard",
};

/** An open gathering they can attend. Being on the list is not the same as arriving. */
export const harborGathering: Record<string, string> = {
  gabriel: "chapel",
  avery: "courtyard",
  nell: "courtyard",
};

/** Avery has no workshop of her own. Her labor is only under someone else's commission. */
export const harborWorkFor: Record<string, string> = {
  avery: "june",
};

const stack = (amount: number, until?: number): Stack => ({ amount, locked: 0, ...(until !== undefined ? { until } : {}) });
const residentBag = (cash: number, items: Bag["items"]): Bag => ({ cash, cashLocked: 0, items });

/**
 * Opening bags for residents. Cash and item ids match the player bag.
 * The player's own cash and items stay on the chapter save.
 * Tomato, radish, and fish stacks end at 1260, the close of the first evening.
 */
export function harborOpening(): SocietyLedger {
  const slot = (id: string): Slot => ({ id, holder: "", until: 0 });
  return {
    bags: {
      owen: residentBag(0, { wood: stack(3) }),
      samira: residentBag(0, { "crop-tomato": stack(4, 1260) }),
      luis: residentBag(0, { "crop-radish": stack(2, 1260) }),
      june: residentBag(6, { "crop-tomato": stack(2) }),
      mara: residentBag(8, { fish: stack(1, 1260) }),
      dani: residentBag(10, {}),
      ruth: residentBag(0, { goods: stack(2) }),
      theo: residentBag(0, { goods: stack(1) }),
      gabriel: residentBag(0, { "crop-tomato": stack(1) }),
      idris: residentBag(0, { goods: stack(1) }),
    },
    playerReturns: { cash: 0, items: {} },
    quotes: [],
    commissions: [],
    proposals: [],
    deals: [],
    slots: ["workshop", "stall", "dock", "chapel", "courtyard", "market"].map(slot),
    loans: [
      { id: "plane", owner: "theo", holder: "owen", tool: "plane", until: 100000, held: false },
      { id: "clamp", owner: "owen", holder: "theo", tool: "clamp", until: 100000, held: false },
    ],
    invites: [
      { id: "chapel-care", event: "chapel", who: "gabriel", open: true },
      { id: "courtyard-meet", event: "courtyard", who: "nell", open: true },
    ],
    pendingGifts: [],
    playerLog: [],
    jobs: [],
    requests: [],
    pendingMeets: [],
    exitRequests: [],
    pendingDeliveries: [],
    speeches: [],
    attendance: [],
  };
}

/** What this resident may know from earlier rounds. Exact stocks stay off this list. */
export function heardBy(ledger: SocietyLedger | undefined, id: string, roundMinute: number): Heard[] {
  if (!ledger) return [];
  return ledger.playerLog.filter((act) => act.minute < roundMinute).flatMap((act): Heard[] => {
    if (act.type === "message") return act.to === id || act.to === "public" ? [{ minute: act.minute, type: act.type, to: act.to, text: act.text }] : [];
    if (act.type === "gift") return act.to === id ? [{ minute: act.minute, type: act.type, to: act.to }] : [];
    if (act.type === "move") return [{ minute: act.minute, type: act.type, scene: act.scene }];
    return [{ minute: act.minute, type: act.type }];
  });
}

function bag(ledger: SocietyLedger, holder: string): Bag {
  return ledger.bags[holder] ??= { cash: 0, cashLocked: 0, items: {} };
}

function pile(ledger: SocietyLedger, holder: string, item: string): Stack {
  const held = bag(ledger, holder);
  return held.items[item] ??= { amount: 0, locked: 0 };
}

function fresh(row: Stack, minute: number) {
  return row.until === undefined || row.until > minute;
}

function unlocked(ledger: SocietyLedger, holder: string, item: string, minute: number) {
  const row = ledger.bags[holder]?.items[item];
  if (!row || row.borrowed || !fresh(row, minute)) return 0;
  return Math.max(0, row.amount - row.locked);
}

/** A quote already held for someone else is not for sale again. The buyer who holds it can still complete it. */
export function openQuote(ledger: SocietyLedger, buyer: string, minute: number) {
  return ledger.quotes.find((item) => item.seller !== buyer && item.reserved && item.until >= minute && !(ledger.pendingDeliveries ?? []).some((row) => row.quote === item.id && row.buyer !== buyer));
}

function cashFree(ledger: SocietyLedger, holder: string) {
  const held = ledger.bags[holder];
  return held ? Math.max(0, held.cash - held.cashLocked) : 0;
}

function borrowedOnly(ledger: SocietyLedger, holder: string, item: string, minute: number) {
  const row = ledger.bags[holder]?.items[item];
  return !!row && !!row.borrowed && fresh(row, minute) && row.amount - row.locked > 0;
}

export function ownMaterial(ledger: SocietyLedger, holder: string, minute = 0): string | null {
  const held = ledger.bags[holder];
  if (!held) return null;
  const ids = [...materialOrder, ...Object.keys(held.items)];
  for (const item of ids) {
    const row = held.items[item];
    if (row && !row.borrowed && fresh(row, minute) && row.amount - row.locked > 0) return item;
  }
  return null;
}

/** The next id is one past the highest number already used. A deleted row must not hand its number to a later row. */
function nextSerial(rows: { id: string }[], prefix: string) {
  let highest = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const item of rows) {
    const match = pattern.exec(item.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${highest + 1}`;
}

function lists(ledger: SocietyLedger) {
  ledger.bags ??= {};
  ledger.playerReturns ??= { cash: 0, items: {} };
  ledger.jobs ??= [];
  ledger.requests ??= [];
  ledger.pendingMeets ??= [];
  ledger.exitRequests ??= [];
  ledger.pendingDeliveries ??= [];
  ledger.speeches ??= [];
  ledger.attendance ??= [];
  ledger.pendingGifts ??= [];
  ledger.commissions ??= [];
}

function creditPlayer(ledger: SocietyLedger, cash = 0, item?: string, qty = 0) {
  lists(ledger);
  if (cash > 0) ledger.playerReturns.cash += cash;
  if (item && qty > 0 && !chapterItems.has(item)) ledger.playerReturns.items[item] = (ledger.playerReturns.items[item] ?? 0) + qty;
}

/** Pull cash and items owed to the player bag. The ledger queue is cleared. */
export function takePlayerReturns(ledger: SocietyLedger): PlayerReturns {
  lists(ledger);
  const owed = { cash: ledger.playerReturns.cash, items: { ...ledger.playerReturns.items } };
  ledger.playerReturns = { cash: 0, items: {} };
  return owed;
}

/** Zero stacks whose minute has passed, and close quotes and gifts that locked them. */
export function spoilBags(ledger: SocietyLedger, minute: number): { holder: string; item: string; amount: number }[] {
  lists(ledger);
  const spoiled: { holder: string; item: string; amount: number }[] = [];
  for (const [holder, held] of Object.entries(ledger.bags)) {
    if (holder === "player") continue;
    for (const [item, row] of Object.entries(held.items)) {
      if (row.until === undefined || row.until > minute || row.amount <= 0) continue;
      spoiled.push({ holder, item, amount: row.amount });
      row.amount = 0;
      row.locked = 0;
      for (const quote of ledger.quotes) if (quote.seller === holder && quote.item === item && quote.reserved) {
        quote.reserved = false;
        quote.until = minute;
      }
    }
  }
  ledger.pendingGifts = ledger.pendingGifts.filter((gift) => {
    const row = gift.item ? ledger.bags[gift.from]?.items[gift.item] : undefined;
    return !gift.item || !row || row.until === undefined || row.until > minute || row.amount > 0;
  });
  return spoiled;
}

function ensureGoods(ledger: SocietyLedger, holder: string) {
  return pile(ledger, holder, "goods");
}

/** A finished job pays its product once the hour it named has arrived. */
export function ripenJobs(ledger: SocietyLedger, minute: number) {
  lists(ledger);
  for (const job of ledger.jobs) {
    if (job.done || job.ready > minute) continue;
    job.done = true;
    ensureGoods(ledger, job.who).amount += 1;
  }
}

/** One answer owed to someone else. It is not a promise to be somewhere later. */
export type DueReply = { kind: "gift" | "reserve" | "invite" | "exit" | "proposal"; id: string; from: string; answer: "yes-no" | "sign" };

function signableProposal(ledger: SocietyLedger, id: string, minute: number) {
  return ledger.proposals.find((item) => item.parties.includes(id) && !item.signed.includes(id) && item.until >= minute && (item.signable ?? 0) <= minute);
}

/** The one reply this hour must answer, if any. A gift comes before a reservation, an invitation, a request to leave, then a proposal. */
export function dueReply(ledger: SocietyLedger, id: string, minute: number): DueReply | null {
  lists(ledger);
  const gift = ledger.pendingGifts.find((item) => item.to === id && item.until >= minute);
  if (gift) return { kind: "gift", id: gift.id, from: gift.from, answer: "yes-no" };
  const request = venueRequest(ledger, id, minute);
  if (request) return { kind: "reserve", id: request.id, from: request.who, answer: "yes-no" };
  const meet = ledger.pendingMeets.find((item) => item.to === id && item.ready <= minute && item.until >= minute);
  if (meet) return { kind: "invite", id: meet.id, from: meet.from, answer: "yes-no" };
  const leaving = ledger.exitRequests.find((item) => item.to === id && item.ready <= minute && item.until >= minute);
  if (leaving) return { kind: "exit", id: leaving.id, from: leaving.from, answer: "yes-no" };
  const proposal = signableProposal(ledger, id, minute);
  if (proposal) return { kind: "proposal", id: proposal.id, from: proposal.parties.find((party) => party !== id) ?? "", answer: "sign" };
  return null;
}

/** One NPC main action. A message that would also settle is refused. A reservation stays a request until the person who keeps that place accepts it. */
function venueRequest(ledger: SocietyLedger, id: string, minute: number) {
  const slotId = harborVenue[id];
  if (!slotId) return;
  return ledger.requests.find((item) => item.slot === slotId && item.until >= minute);
}

function toolReady(ledger: SocietyLedger, id: string, minute: number) {
  return ledger.loans.some((loan) => loan.until >= minute && ((loan.owner === id && !loan.held) || (loan.holder === id && !!loan.held)));
}

function slotBlocked(ledger: SocietyLedger, scene: string, id: string, minute: number) {
  const slot = ledger.slots.find((item) => item.id === scene);
  return !!slot && slot.holder !== "" && slot.holder !== id && slot.until >= minute;
}

export function npcPermit(ledger: SocietyLedger, attempt: NpcAttempt): string | null {
  lists(ledger);
  const action = attempt.action;
  if (action.type === "administer") return "NPC_AUTHORITY";
  if (action.type === "wait" || action.type === "move" || action.type === "plan" || action.type === "speak") return null;
  if (action.type === "message") return action.settles ? "NPC_MESSAGE" : null;
  if (action.type === "work") {
    if (!action.present) return "NPC_ABSENT";
    if (action.for && action.for !== attempt.id) {
      const hired = ledger.commissions.some((item) => item.to === attempt.id && item.from === action.for && item.scene === attempt.scene && item.until >= attempt.minute);
      if (!hired) return "NPC_CONSENT";
    } else if (!ownMaterial(ledger, attempt.id, attempt.minute)) return "NPC_RESOURCE";
    if (!toolReady(ledger, attempt.id, attempt.minute)) return "NPC_RESOURCE";
    if (slotBlocked(ledger, attempt.scene, attempt.id, attempt.minute)) return "NPC_SLOT";
    return null;
  }
  if (action.type === "deliver") {
    const job = ledger.commissions.find((item) => item.id === action.commission);
    if (!job || job.to !== attempt.id || job.scene !== attempt.scene || job.until < attempt.minute) return "NPC_CONSENT";
    if (unlocked(ledger, attempt.id, job.item, attempt.minute) < job.qty) return "NPC_RESOURCE";
    const payer = ledger.bags[job.from];
    if (!payer || payer.cash < job.pay || payer.cashLocked < job.pay) return "NPC_RESOURCE";
    return null;
  }
  if (action.type === "trade") {
    const quote = ledger.quotes.find((item) => item.id === action.quote);
    if (!quote || !quote.reserved || quote.until < attempt.minute || quote.seller === attempt.id) return "NPC_TERMS";
    const sellerStack = ledger.bags[quote.seller]?.items[quote.item];
    if (sellerStack && !fresh(sellerStack, attempt.minute)) return "NPC_TERMS";
    if (ledger.pendingDeliveries.some((item) => item.quote === quote.id && item.buyer !== attempt.id)) return "NPC_TERMS";
    const held = ledger.pendingDeliveries.some((item) => item.quote === quote.id && item.buyer === attempt.id);
    return cashFree(ledger, attempt.id) + (held ? quote.price : 0) >= quote.price ? null : "NPC_RESOURCE";
  }
  if (action.type === "gift" || action.type === "quote") {
    if (borrowedOnly(ledger, attempt.id, action.item, attempt.minute)) return "NPC_BORROWED";
    return whole(action.qty) && unlocked(ledger, attempt.id, action.item, attempt.minute) >= action.qty ? null : "NPC_RESOURCE";
  }
  if (action.type === "borrow") return ledger.loans.some((item) => item.holder === attempt.id && item.tool === action.tool && item.until >= attempt.minute && !item.held) ? null : "NPC_CONSENT";
  if (action.type === "return") return ledger.loans.some((item) => item.holder === attempt.id && item.tool === action.tool && item.until >= attempt.minute && item.held) ? null : "NPC_CONSENT";
  if (action.type === "accept" || action.type === "refuse") {
    if (ledger.pendingGifts.some((item) => item.to === attempt.id && item.until >= attempt.minute)) return null;
    if (venueRequest(ledger, attempt.id, attempt.minute)) return null;
    if (ledger.pendingMeets.some((item) => item.to === attempt.id && item.ready <= attempt.minute && item.until >= attempt.minute)) return null;
    if (ledger.exitRequests.some((item) => item.to === attempt.id && item.ready <= attempt.minute && item.until >= attempt.minute)) return null;
    if (action.type === "refuse" && signableProposal(ledger, attempt.id, attempt.minute)) return null;
    return "NPC_CONSENT";
  }
  if (action.type === "reserve") return ledger.slots.some((item) => item.id === action.slot && item.until >= attempt.minute && item.holder !== attempt.id) ? "NPC_SLOT" : null;
  if (action.type === "propose") return action.with && action.with !== attempt.id ? null : "NPC_PERSON";
  if (action.type === "sign") {
    const proposal = ledger.proposals.find((item) => item.id === action.proposal);
    if (!proposal || (proposal.signable ?? 0) > attempt.minute || proposal.until < attempt.minute || !proposal.parties.includes(attempt.id) || proposal.signed.includes(attempt.id)) return "NPC_CONSENT";
    return null;
  }
  if (action.type === "exit") {
    const deal = ledger.deals.find((item) => item.id === action.deal);
    return deal && deal.parties.includes(attempt.id) ? null : "NPC_CONSENT";
  }
  if (action.type === "invite") return action.with !== attempt.id ? null : "NPC_PERSON";
  const invited = ledger.invites.some((item) => item.event === action.event && (item.open || item.who === attempt.id));
  if (!action.present) return "NPC_ABSENT";
  return invited ? null : "NPC_CONSENT";
}

/** Buy a reserved quote. The buyer is a resident, or the player when `purse` is passed. */
function transferQuote(next: SocietyLedger, buyer: string, quoteId: string, minute: number, purse?: Purse): string | null {
  const quote = next.quotes.find((item) => item.id === quoteId);
  const seller = quote ? next.bags[quote.seller]?.items[quote.item] : undefined;
  const afford = buyer === "player" ? (purse?.cash ?? 0) : cashFree(next, buyer);
  if (!quote || !quote.reserved || quote.until < minute || quote.seller === buyer || next.pendingDeliveries.some((item) => item.quote === quoteId && item.buyer !== buyer) || !seller || !fresh(seller, minute) || seller.locked < quote.qty || seller.amount < quote.qty || afford < quote.price) return "QUOTE";
  seller.amount -= quote.qty;
  seller.locked -= quote.qty;
  bag(next, quote.seller).cash += quote.price;
  if (buyer === "player" && purse) {
    purse.cash -= quote.price;
    purse.items[quote.item] = (purse.items[quote.item] ?? 0) + quote.qty;
  } else {
    bag(next, buyer).cash -= quote.price;
    pile(next, buyer, quote.item).amount += quote.qty;
  }
  quote.reserved = false;
  quote.until = minute;
  return null;
}

/** Lock the giver's stack or cash. Nothing moves until the recipient accepts on a later round. */
function lockGift(next: SocietyLedger, from: string, to: string, minute: number, gift: { item?: string; cash?: number; qty: number }, purse?: Purse): string | null {
  if (!named(to) || to === from || !whole(gift.qty)) return "RESOURCE";
  if (gift.cash) {
    const afford = from === "player" ? (purse?.cash ?? 0) : cashFree(next, from);
    if (afford < gift.qty) return "RESOURCE";
    if (from === "player" && purse) purse.cash -= gift.qty;
    else bag(next, from).cashLocked += gift.qty;
  } else if (gift.item) {
    if (chapterItems.has(gift.item) || gift.item === "cash") return "RESOURCE";
    if (from === "player") {
      if ((purse?.items[gift.item] ?? 0) < gift.qty) return "RESOURCE";
      if (purse) {
        purse.items[gift.item] -= gift.qty;
        if (!purse.items[gift.item]) delete purse.items[gift.item];
      }
    } else {
      if (borrowedOnly(next, from, gift.item, minute) || unlocked(next, from, gift.item, minute) < gift.qty) return "RESOURCE";
      pile(next, from, gift.item).locked += gift.qty;
    }
  } else return "RESOURCE";
  next.pendingGifts.push({ id: `gift-${next.pendingGifts.length + 1}`, from, to, ...(gift.item ? { item: gift.item } : {}), ...(gift.cash ? { cash: gift.qty } : {}), qty: gift.qty, until: minute + 60 });
  return null;
}

function releaseGift(next: SocietyLedger, index: number, accept: boolean) {
  const gift = next.pendingGifts[index];
  if (!gift) return;
  if (gift.cash) {
    if (gift.from !== "player") {
      const giver = bag(next, gift.from);
      giver.cashLocked = Math.max(0, giver.cashLocked - gift.qty);
      if (accept) giver.cash -= gift.qty;
    }
    if (accept && gift.to !== "player") bag(next, gift.to).cash += gift.qty;
    if (accept && gift.to === "player") creditPlayer(next, gift.qty);
    if (!accept && gift.from === "player") creditPlayer(next, gift.qty);
  } else if (gift.item) {
    if (gift.from !== "player") {
      const giver = pile(next, gift.from, gift.item);
      giver.locked = Math.max(0, giver.locked - gift.qty);
      if (accept) giver.amount -= gift.qty;
    }
    if (accept && gift.to !== "player") pile(next, gift.to, gift.item).amount += gift.qty;
    if (accept && gift.to === "player") creditPlayer(next, 0, gift.item, gift.qty);
    if (!accept && gift.from === "player") creditPlayer(next, 0, gift.item, gift.qty);
  }
  next.pendingGifts.splice(index, 1);
}

function resolveGift(next: SocietyLedger, recipient: string, accept: boolean, minute: number): string | null {
  const index = next.pendingGifts.findIndex((item) => item.to === recipient && item.until >= minute);
  if (index < 0) return "CONSENT";
  releaseGift(next, index, accept);
  return null;
}

function unlockQuote(ledger: SocietyLedger, quote: Quote) {
  if (!quote.reserved) return;
  const row = ledger.bags[quote.seller]?.items[quote.item];
  if (row) row.locked = Math.max(0, row.locked - quote.qty);
  quote.reserved = false;
}

function unlockBuyer(ledger: SocietyLedger, buyer: string, price: number) {
  const held = ledger.bags[buyer];
  if (held) held.cashLocked = Math.max(0, held.cashLocked - price);
}

function releasePay(ledger: SocietyLedger, job: Commission) {
  const payer = ledger.bags[job.from];
  if (payer) payer.cashLocked = Math.max(0, payer.cashLocked - job.pay);
}

function dropCommissions(ledger: SocietyLedger, drop: (job: Commission) => boolean) {
  ledger.commissions = ledger.commissions.filter((job) => {
    if (!drop(job)) return true;
    releasePay(ledger, job);
    return false;
  });
}

/** Gifts, quotes, and commissions past their minute release their reserves. A pending purchase settles when the buyer and seller now share a place. */
export function settleOpen(ledger: SocietyLedger, minute: number, places: Record<string, string> = {}) {
  lists(ledger);
  for (let index = ledger.pendingGifts.length - 1; index >= 0; index -= 1) {
    if (ledger.pendingGifts[index].until < minute) releaseGift(ledger, index, false);
  }
  for (const quote of ledger.quotes) if (quote.reserved && quote.until < minute) unlockQuote(ledger, quote);
  dropCommissions(ledger, (job) => job.until < minute);
  const pending = ledger.pendingDeliveries;
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const row = pending[index];
    const quote = ledger.quotes.find((item) => item.id === row.quote);
    if (!quote || !quote.reserved) {
      if (quote) unlockBuyer(ledger, row.buyer, quote.price);
      pending.splice(index, 1);
      continue;
    }
    const seller = places[quote.seller];
    if (!seller || seller !== places[row.buyer]) continue;
    unlockBuyer(ledger, row.buyer, quote.price);
    if (transferQuote(ledger, row.buyer, quote.id, minute)) {
      bag(ledger, row.buyer).cashLocked += quote.price;
      continue;
    }
    pending.splice(index, 1);
  }
}

function deliverJob(next: SocietyLedger, actor: string, commission: string, scene: string, minute: number, purse?: Purse): string | null {
  const job = next.commissions.find((item) => item.id === commission);
  if (!job || job.to !== actor || job.scene !== scene || job.until < minute) return "COMMISSION";
  const payer = next.bags[job.from];
  if (!payer || payer.cashLocked < job.pay || payer.cash < job.pay) return "COMMISSION";
  if (actor === "player") {
    if ((purse?.items[job.item] ?? 0) < job.qty) return "COMMISSION";
    if (purse) {
      purse.items[job.item] -= job.qty;
      if (!purse.items[job.item]) delete purse.items[job.item];
      purse.cash += job.pay;
    }
  } else {
    if (unlocked(next, actor, job.item, minute) < job.qty) return "COMMISSION";
    pile(next, actor, job.item).amount -= job.qty;
    bag(next, actor).cash += job.pay;
  }
  pile(next, job.from, job.item).amount += job.qty;
  payer.cash -= job.pay;
  payer.cashLocked -= job.pay;
  next.commissions = next.commissions.filter((item) => item.id !== job.id);
  return null;
}

/** The player, between rounds: move, accept an existing quote, gift, deliver, or leave one message. */
export function admitPlayer(ledger: SocietyLedger, request: PlayerRequest, minute: number, purse: Purse = { cash: 0, items: {} }): { ledger: SocietyLedger; purse: Purse; reason: string | null; text: Words } {
  const next = copy(ledger);
  const held: Purse = { cash: purse.cash, items: { ...purse.items } };
  lists(next);
  const refuse = (reason: string): { ledger: SocietyLedger; purse: Purse; reason: string; text: Words } => ({ ledger, purse, reason, text: ["这一步还不能算。", "That does not go through."] });
  if (request.type === "message") {
    if (!named(request.to) || !request.text.trim() || request.text.trim().length > 120) return refuse("PLAYER_MESSAGE");
    next.playerLog.push({ type: "message", to: request.to, text: request.text.trim(), minute });
    return { ledger: next, purse: held, reason: null, text: ["话已经送到，对方最早下一轮才看得到。", "The message is queued. They can see it on the next round."] };
  }
  if (request.type === "move") {
    if (!named(request.scene)) return refuse("PLAYER_ACTION");
    next.playerLog.push({ type: "move", scene: request.scene, minute });
    return { ledger: next, purse: held, reason: null, text: ["你走到了那里。这一步不含交易。", "You arrive. The walk does not include a trade."] };
  }
  if (request.type === "accept-quote") {
    if (transferQuote(next, "player", request.quote, minute, held)) return refuse("PLAYER_QUOTE");
    next.playerLog.push({ type: "accept-quote", quote: request.quote, minute });
    return { ledger: next, purse: held, reason: null, text: ["这笔报价按原来的条款成交了。", "The quote settles on its existing terms."] };
  }
  if (request.type === "gift") {
    const qty = request.cash ?? request.qty ?? 0;
    if (lockGift(next, "player", request.to, minute, { item: request.item, cash: request.cash, qty }, held)) return refuse("PLAYER_RESOURCE");
    next.playerLog.push({ type: "gift", to: request.to, ...(request.item ? { item: request.item } : {}), ...(request.cash ? { cash: request.cash } : {}), qty, minute });
    return { ledger: next, purse: held, reason: null, text: ["东西先留着，等对方下一轮接受。", "The gift is held until they accept next round."] };
  }
  if (request.type !== "deliver" || deliverJob(next, "player", request.commission, request.scene, minute, held)) return refuse("PLAYER_COMMISSION");
  next.playerLog.push({ type: "deliver", commission: request.commission, minute });
  return { ledger: next, purse: held, reason: null, text: ["交付按原来的委托结清了。", "The delivery settles the existing commission."] };
}

/** Apply one permitted resident action to the shared ledger. The caller already checked npcPermit. */
export function applySociety(ledger: SocietyLedger, attempt: NpcAttempt, places: Record<string, string> = {}): { ledger: SocietyLedger; reason: string | null } {
  const reason = npcPermit(ledger, attempt);
  if (reason) return { ledger, reason };
  const next = copy(ledger);
  ripenJobs(next, attempt.minute);
  const action = attempt.action;
  if (action.type === "work") {
    const spent = ownMaterial(next, attempt.id, attempt.minute);
    if (spent) pile(next, attempt.id, spent).amount -= 1;
    next.jobs.push({ id: `job-${next.jobs.length + 1}`, who: attempt.id, item: "goods", ready: attempt.minute + 60, done: false });
  } else if (action.type === "quote") {
    pile(next, attempt.id, action.item).locked += action.qty;
    next.quotes.push({ id: `${attempt.id}-q-${next.quotes.length + 1}`, seller: attempt.id, item: action.item, qty: action.qty, price: quotePrice, until: attempt.minute + 180, reserved: true });
  } else if (action.type === "trade") {
    const quote = next.quotes.find((item) => item.id === action.quote)!;
    const waiting = next.pendingDeliveries.find((item) => item.quote === quote.id && item.buyer === attempt.id);
    if (places[quote.seller] === attempt.scene) {
      if (waiting) {
        unlockBuyer(next, attempt.id, quote.price);
        next.pendingDeliveries = next.pendingDeliveries.filter((item) => item !== waiting);
      }
      if (transferQuote(next, attempt.id, quote.id, attempt.minute)) return { ledger, reason: "NPC_TERMS" };
    } else if (!waiting) {
      if (next.pendingDeliveries.some((item) => item.quote === quote.id)) return { ledger, reason: "NPC_TERMS" };
      bag(next, attempt.id).cashLocked += quote.price;
      next.pendingDeliveries.push({ id: `delivery-${next.pendingDeliveries.length + 1}`, quote: quote.id, buyer: attempt.id, until: quote.until });
    }
  } else if (action.type === "gift" && action.to) {
    if (lockGift(next, attempt.id, action.to, attempt.minute, { item: action.item, qty: action.qty })) return { ledger, reason: "NPC_RESOURCE" };
  } else if (action.type === "borrow" || action.type === "return") {
    const loan = next.loans.find((item) => item.holder === attempt.id && item.tool === action.tool && item.until >= attempt.minute);
    if (loan) loan.held = action.type === "borrow";
  } else if (action.type === "reserve") {
    next.requests.push({ id: nextSerial(next.requests, "request"), slot: action.slot, who: attempt.id, until: attempt.minute + 180 });
  } else if (action.type === "speak") {
    next.speeches.push({ id: `speech-${next.speeches.length + 1}`, from: attempt.id, scene: attempt.scene, minute: attempt.minute, text: ["公开说了一件镇上的事。", "Said something the town can hear."], heard: [attempt.id] });
  } else if (action.type === "propose" && action.with) {
    next.proposals.push({ id: `proposal-${next.proposals.length + 1}`, parties: [attempt.id, action.with], signed: [attempt.id], until: attempt.minute + 180, scene: attempt.scene, signable: attempt.minute + 60 });
  } else if (action.type === "sign") {
    const proposal = next.proposals.find((item) => item.id === action.proposal);
    if (!proposal) return { ledger, reason: "NPC_CONSENT" };
    proposal.signed.push(attempt.id);
    if (proposal.parties.every((id) => proposal.signed.includes(id))) {
      next.deals.push({ id: `deal-${next.deals.length + 1}`, parties: [...proposal.parties], allowSolo: false });
      const worker = proposal.parties.find((id) => harborWorkFor[id] && proposal.parties.includes(harborWorkFor[id])) ?? "";
      const employer = worker ? harborWorkFor[worker] : "";
      if (worker && employer && cashFree(next, employer) >= quotePrice) {
        bag(next, employer).cashLocked += quotePrice;
        next.commissions.push({ id: `commission-${next.commissions.length + 1}`, from: employer, to: worker, item: "goods", qty: 1, scene: proposal.scene || attempt.scene, until: attempt.minute + 180, pay: quotePrice });
      }
    }
  } else if (action.type === "exit") {
    const deal = next.deals.find((item) => item.id === action.deal);
    if (!deal) return { ledger, reason: "NPC_CONSENT" };
    const other = deal.parties.find((id) => id !== attempt.id);
    if (deal.allowSolo) {
      deal.parties = deal.parties.filter((id) => id !== attempt.id);
      if (deal.parties.length < 2) next.deals = next.deals.filter((item) => item.id !== deal.id);
      dropCommissions(next, (item) => item.from === attempt.id || item.to === attempt.id);
    } else if (other && !next.exitRequests.some((item) => item.deal === deal.id && item.from === attempt.id && item.until >= attempt.minute)) {
      next.exitRequests.push({ id: `exit-${next.exitRequests.length + 1}`, deal: deal.id, from: attempt.id, to: other, until: attempt.minute + 180, ready: attempt.minute + 60 });
    }
  } else if (action.type === "invite") {
    next.pendingMeets.push({ id: `meet-${next.pendingMeets.length + 1}`, from: attempt.id, to: action.with, scene: attempt.scene, day: action.day, slot: action.from, intent: action.intent, until: attempt.minute + 180, ready: attempt.minute + 60 });
  } else if (action.type === "deliver") {
    if (!action.commission || deliverJob(next, attempt.id, action.commission, attempt.scene, attempt.minute)) return { ledger, reason: "NPC_CONSENT" };
  } else if (action.type === "attend") {
    next.attendance.push({ event: action.event, who: attempt.id, minute: attempt.minute });
  } else if (action.type === "accept" || action.type === "refuse") {
    const gift = next.pendingGifts.some((item) => item.to === attempt.id && item.until >= attempt.minute);
    if (gift) {
      if (resolveGift(next, attempt.id, action.type === "accept", attempt.minute)) return { ledger, reason: "NPC_CONSENT" };
    } else {
      const request = venueRequest(next, attempt.id, attempt.minute);
      if (request) {
        if (action.type === "accept") {
          const slot = next.slots.find((item) => item.id === request.slot);
          if (!slot || (slot.holder !== "" && slot.until >= attempt.minute && slot.holder !== request.who)) return { ledger, reason: "NPC_SLOT" };
          slot.holder = request.who;
          slot.until = request.until;
        }
        next.requests = next.requests.filter((item) => item !== request);
      } else {
        const meet = next.pendingMeets.find((item) => item.to === attempt.id && item.ready <= attempt.minute && item.until >= attempt.minute);
        const leaving = next.exitRequests.find((item) => item.to === attempt.id && item.ready <= attempt.minute && item.until >= attempt.minute);
        if (meet) next.pendingMeets = next.pendingMeets.filter((item) => item.id !== meet.id);
        else if (leaving && action.type === "accept") {
          const deal = next.deals.find((item) => item.id === leaving.deal);
          if (deal) {
            dropCommissions(next, (item) => deal.parties.includes(item.from) && deal.parties.includes(item.to));
            next.deals = next.deals.filter((item) => item.id !== deal.id);
          }
          next.exitRequests = next.exitRequests.filter((item) => item.id !== leaving.id);
        }         else if (leaving) next.exitRequests = next.exitRequests.filter((item) => item.id !== leaving.id);
        else {
          const proposal = action.type === "refuse" ? signableProposal(next, attempt.id, attempt.minute) : undefined;
          if (proposal) next.proposals = next.proposals.filter((item) => item.id !== proposal.id);
          else return { ledger, reason: "NPC_CONSENT" };
        }
      }
    }
  }
  return { ledger: next, reason: null };
}
