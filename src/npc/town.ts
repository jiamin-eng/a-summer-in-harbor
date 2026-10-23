import { applySociety, dueReply, emptyLedger, harborGathering, harborVenue, harborWorkFor, heardBy, npcPermit, openQuote, ownMaterial, ripenJobs, settleOpen, spoilBags, type DecisionLimits, type DueReply, type Heard, type NpcAttempt, type SocietyLedger } from "./society";
import { decisionBrief } from "./permit-brief";
import { townScenes } from "./places";

export type Point = { x: number; y: number };
export type Anchor = { scene: string; at: Point };
export type Words = [string, string];
export type Goal = { scene: string; who: string | null; intent: string };
export type MemoryKind = "event" | "talk" | "plan" | "reflection";
export type Memory = { minute: number; with: string | null; text: Words; scene: string; about: string[]; importance: number; kind: MemoryKind; embedding?: number[]; accessed?: number };
/** One view of one person. The model writes it only after a decision says today's events change it. */
export type PersonPage = { who: string; met: "once" | "familiar"; view: Words | null; about: string[] };
/** One thing that happened with someone. The night decision reads the lines it has not read yet. They are not the view. A reviewed line stays for retrieval. A sealed line was told in confidence and is not passed on. `heard` was told to this person. `bent` is a version they told while knowing it was not the fact. `said` is a sentence this resident spoke to `who`, not what `who` did. The same claim stays one event. */
export type DayNote = { who: string; text: Words; sealed?: boolean; heard?: boolean; bent?: "lie" | "rumor"; said?: boolean; about?: string[]; reviewed?: boolean };
/** What this resident holds when the night decision runs. It is the ledger, not an event. */
export type HeldNow = { cash: number; locked: number; items: { id: string; amount: number; locked?: number; until?: number }[]; loans: { tool: string; owner: string; holder: string; held: boolean }[]; venues: { id: string; holder: string; until: number }[] };
export type DayFacts = { id?: string; persona: string; aim: string; temperament: Words | null; worry?: Words | null; pages: { who: string; met: "once" | "familiar"; view: Words | null }[]; events: DayNote[]; ledger?: HeldNow };

/** Events for one person's page. A sentence about someone else stays on that person's page, even when it was said or heard while talking to this one. A note filed on yourself, such as goods that spoiled, still reaches a page that has its own stake. */
export function eventsForPage(facts: DayFacts, who: string): DayNote[] {
  const aboutSomeoneElse = (item: DayNote) => (item.about ?? []).some((id) => id !== who && id !== facts.id);
  return facts.events.filter((item) => {
    if (aboutSomeoneElse(item) && !item.about?.includes(who)) return false;
    return item.who === who || !!item.about?.includes(who) || (facts.id !== undefined && item.who === facts.id);
  });
}
export type DayReflection = { pages: { who: string; text: Words }[]; temperament: Words | null; worry?: Words | null };
export type DayReview = (facts: DayFacts) => Promise<DayReflection>;
export type Todo = { day: number; from: 360 | 720 | 1020; scene: string; intent: string; who: string };
export type DayPlan = { day: number; outline: string; hours: { from: number; scene: string; intent: string }[] };
export type Notice = { scene: string; topic: string; text: Words };
export type NpcAction = "stay" | "go" | "talk" | "plan" | "listen" | "fish" | "work" | "quote" | "trade" | "gift" | "borrow" | "return" | "reserve" | "speak" | "propose" | "sign" | "exit" | "invite" | "attend" | "accept" | "refuse" | "deliver";
/** `scenes` limits where this action may happen. For go and plan it limits the destination. */
export type Ability = { action: NpcAction; scenes?: string[] };
export type ResidentConfig = { id: string; name: string | Words; persona: string; anchors: Anchor[]; goal: Goal; can: Ability[]; background?: string; voice?: string; aim?: string; doing?: Words; temperament?: Words | null; worry?: Words | null; sees?: string[]; knows?: Words[]; notices?: Notice[]; opening?: { pages?: PersonPage[]; events?: DayNote[] } };
export type MeetingEvent = "trade" | "gift" | "borrow" | "return" | "reserve" | "accept" | "refuse";
export type SharedEvent = "talk" | "quote" | MeetingEvent | "propose" | "invite";
export type ChatAct = "relay" | "complain" | "lie" | "rumor" | "promise" | "confide";
export type PresenceRound = ({ event: SharedEvent; accepted: boolean; when?: { day: number; from: 360 | 720 | 1020 }; text?: Words; answer?: Words; about?: string[] } | { event: ChatAct; accepted: boolean; text: Words; answer: Words; about: string[]; reply: string }) & { who?: string };
export type NpcIntent =
  | { type: "stay" }
  | { type: "go"; scene: string }
  | { type: "talk"; who: string; lines?: Words; minutes?: 30 | 60; event?: MeetingEvent }
  | { type: "plan"; scene: string }
  | { type: "listen"; lines?: Words }
  | { type: "fish"; lines?: Words }
  | { type: "work" }
  | { type: "quote" }
  | { type: "trade" }
  | { type: "gift" }
  | { type: "borrow" }
  | { type: "return" }
  | { type: "reserve" }
  | { type: "speak" }
  | { type: "propose" }
  | { type: "sign" }
  | { type: "exit" }
  | { type: "invite"; when: { day: number; from: 360 | 720 | 1020 } }
  | { type: "attend" }
  | { type: "accept" }
  | { type: "refuse" }
  | { type: "deliver" };
export type Place = { scene: string; host: string; kind: "base" | "shop" | "town"; title?: Words };
export type NpcView = {
  minute: number;
  me: { id: string; scene: string; persona: string; background: string; voice: string; aim: string; temperament?: Words | null; worry?: Words | null; goal: Goal; can: Ability[] };
  anchors: Anchor[];
  places?: Place[];
  plan: DayPlan | null;
  doing?: Words;
  seen: { people: string[]; notices: Words[] };
  known: Words[];
  pages?: PersonPage[];
  events?: DayNote[];
  todos?: Todo[];
  /** One answer owed this hour. Absent when this hour is a free action. Not a promise to be somewhere later. */
  reply?: DueReply | null;
  here: string[];
  talked: string[];
  replannedToday: boolean;
  heard: Heard[];
  limits?: DecisionLimits;
};
export type NpcMemoryPort = {
  hydrate(id: string, items: { minute: number; text: string }[]): Promise<(number[] | undefined)[]>;
  search(id: string, vector: number[]): Promise<{ minute: number; text: string; distance: number }[]>;
  save(id: string, memories: Memory[]): Promise<void>;
};
export type NpcTownOptions = {
  residents: ResidentConfig[];
  minute?: number;
  minutesPerTick?: number;
  memoryLimit?: number;
  decide?: (view: NpcView) => NpcIntent;
  converse?: (speaker: NpcView, listener: NpcView) => Promise<PresenceRound[]>;
  narrate?: (view: NpcView, scene: string) => Promise<Words>;
  /** At 21:00, decides from today's events whether a view or the temperament changes, and supplies the new line. */
  review?: DayReview;
  resume?: { residents: { id: string; scene: string; goal: Goal; pages?: (PersonPage & { today?: Words | null })[]; memory?: Memory[]; plan?: DayPlan | null; doing?: Words; todos?: Todo[]; events?: DayNote[]; temperament?: Words | null; worry?: Words | null }[]; talked?: string[]; society?: SocietyLedger };
};
export type NpcRejection = { id: string; action: NpcIntent; reason: string };
export type NpcMove = { id: string; scene: string; at: Point };
export type NpcTick = { minute: number; accepted: { id: string; action: NpcIntent }[]; rejected: NpcRejection[]; moves: NpcMove[] };
type Resident = ResidentConfig & { background: string; voice: string; aim: string; temperament: Words | null; worry: Words | null; sees: string[]; knows: Words[]; notices: Notice[]; scene: string; pages: PersonPage[]; events: DayNote[]; plan: DayPlan | null; replannedOn: number | null; doing?: Words; todos: Todo[]; pendingNight?: boolean };
export type NpcTownState = { minute: number; residents: { id: string; name: string | Words; scene: string; goal: Goal; pages: PersonPage[]; events: DayNote[]; temperament?: Words; worry?: Words; plan: DayPlan | null; doing?: Words; todos: Todo[] }[]; talked: string[]; society: SocietyLedger };
type Paper = { id: string; text: Words; who: string | null };

const pair = (a: string, b: string) => [a, b].sort().join("|");
const day = (minute: number) => Math.floor(minute / 1440);
const copy = <T>(value: T): T => structuredClone(value);
const clockOf = (minute: number) => `${String(Math.floor((minute % 1440) / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function createNpcTown(options: NpcTownOptions) {
  const ids = options.residents.map((resident) => resident.id);
  if (new Set(ids).size !== ids.length) throw Error("NPC_DUPLICATE");
  const residents = new Map<string, Resident>();
  for (const resident of options.residents) {
    if (!resident.anchors.length) throw Error("NPC_NO_ANCHOR");
    if (!resident.can.length) throw Error("NPC_NO_ABILITY");
    if (resident.can.some((ability) => ability.scenes?.some((scene) => !resident.anchors.some((anchor) => anchor.scene === scene)))) throw Error("NPC_ABILITY_SCENE");
    if (!resident.anchors.some((anchor) => anchor.scene === resident.goal.scene)) throw Error("NPC_GOAL_SCENE");
    const prior = options.resume?.residents.find((item) => item.id === resident.id);
    const goal = prior && resident.anchors.some((anchor) => anchor.scene === prior.goal.scene) ? prior.goal : resident.goal;
    const knownScene = (scene: string) => resident.anchors.some((anchor) => anchor.scene === scene) || townScenes().some((place) => place.scene === scene);
    const temperament = prior?.temperament && prior.temperament.length === 2 ? [...prior.temperament] as Words : !prior && resident.temperament?.length === 2 ? [...resident.temperament] as Words : null;
    const worry = prior?.worry && prior.worry.length === 2 ? [...prior.worry] as Words : !prior && resident.worry?.length === 2 ? [...resident.worry] as Words : null;
    const memory = prior ?? resident.opening;
    residents.set(resident.id, { ...copy(resident), background: resident.background ?? "", voice: resident.voice ?? "", aim: resident.aim ?? resident.goal.intent, temperament, worry, sees: resident.sees ?? ["people"], knows: resident.knows ?? [], notices: resident.notices ?? [], scene: prior?.scene && knownScene(prior.scene) ? prior.scene : resident.anchors[0].scene, goal: copy(goal), pages: keptPages(memory), events: keptEvents(memory), plan: prior?.plan ? { day: prior.plan.day, outline: prior.plan.outline, hours: prior.plan.hours } : null, replannedOn: null, doing: prior ? prior.doing : resident.doing ? [...resident.doing] as Words : undefined, todos: openTodos(prior?.todos, options.minute ?? 540) });
  }
  const talked = new Set<string>(options.resume?.talked ?? []);
  let society = copy(options.resume?.society ?? emptyLedger());
  let minute = options.minute ?? 540;
  const step = options.minutesPerTick ?? 60;
  const decide = options.decide ?? defaultDecide;
  let playerScene: string | undefined;

  function sceneOf(id: string, at?: Map<string, string>) {
    return at?.get(id) ?? residents.get(id)?.scene ?? "";
  }

  function seenOf(resident: Resident, at?: Map<string, string>) {
    const scene = sceneOf(resident.id, at);
    const people = resident.sees.includes("people") ? [...residents.values()].filter((other) => other.id !== resident.id && sceneOf(other.id, at) === scene).map((other) => other.id) : [];
    const notices = resident.notices.filter((notice) => notice.scene === scene && resident.sees.includes(notice.topic)).map((notice) => notice.text);
    return { people, notices };
  }

  function papersOf(resident: Resident): Paper[] {
    const standing = resident.temperament ? [{ id: "self:temperament", text: resident.temperament, who: null }] : [];
    const attention = resident.worry ? [{ id: "self:worry", text: resident.worry, who: null }] : [];
    return [
      ...attention,
      ...standing,
      ...resident.pages.flatMap((page) => page.view ? [{ id: `person:${page.who}`, text: page.view, who: page.who }] : []),
      ...resident.events.map((event, index) => ({ id: `event:${index}:${event.who}`, text: event.text, who: event.who })),
      ...openTodos(resident.todos, minute).map((todo, index) => ({ id: `todo:${index}:${todo.who}`, text: [todo.intent, todo.intent] as Words, who: todo.who })),
    ];
  }

  function view(resident: Resident, withPlayer = false, at?: Map<string, string>): NpcView {
    ensurePlan(resident);
    const seen = seenOf(resident, at);
    if (withPlayer && resident.sees.includes("people")) seen.people.push("player");
    return {
      minute,
      me: { id: resident.id, scene: sceneOf(resident.id, at), persona: resident.persona, background: resident.background, voice: resident.voice, aim: resident.aim, temperament: resident.temperament ? [...resident.temperament] as Words : null, worry: resident.worry ? [...resident.worry] as Words : null, goal: copy(resident.goal), can: copy(resident.can) },
      anchors: copy(resident.anchors),
      places: knownPlaces(resident.id),
      plan: copy(resident.plan),
      doing: resident.doing ? [...resident.doing] as Words : undefined,
      seen,
      known: copy(resident.knows),
      pages: copy(resident.pages),
      events: copy(resident.events),
      todos: openTodos(resident.todos, minute),
      reply: dueReply(society, resident.id, minute),
      here: [...seen.people].sort(),
      talked: [...talked].filter((key) => key.startsWith(day(minute) + "|") && key.slice(String(day(minute)).length + 1).split("|").includes(resident.id)).map((key) => key.slice(String(day(minute)).length + 1)),
      replannedToday: resident.replannedOn === day(minute),
      heard: heardBy(society, resident.id, minute),
    };
  }

  async function forModel(resident: Resident, withPlayer = false, at?: Map<string, string>) {
    const built = view(resident, withPlayer, at);
    return { ...built, limits: await decisionBrief(society, resident.id, built.me.scene, minute, resident.can.map((ability) => ability.action)) };
  }

  function notePerson(resident: Resident, who: string, text: Words, about: string[], sealed = false, mark?: { heard?: boolean; bent?: "lie" | "rumor"; said?: boolean }) {
    const subjects = about.filter((id) => id !== who && id !== resident.id && residents.has(id));
    if (who !== resident.id) {
      const page = resident.pages.find((item) => item.who === who);
      if (!page) resident.pages.push({ who, met: "once", view: null, about });
      else {
        page.met = "familiar";
        page.about = about;
      }
    }
    const claim = !!(mark?.heard || mark?.bent);
    const existing = claim ? resident.events.find((event) => event.text[0] === text[0] && (event.heard || event.bent)) : undefined;
    if (existing) {
      for (const id of subjects) {
        existing.about ??= [];
        if (!existing.about.includes(id)) existing.about.push(id);
      }
      return;
    }
    resident.events.push({ who, text, ...(sealed ? { sealed: true } : {}), ...(mark?.heard ? { heard: true } : {}), ...(mark?.bent ? { bent: mark.bent } : {}), ...(mark?.said ? { said: true } : {}), ...(subjects.length ? { about: subjects } : {}) });
    if (resident.events.length > eventKeep) resident.events.splice(0, resident.events.length - eventKeep);
  }

  /** Today's event is recorded. The standing view waits for the night decision. */
  function remember(resident: Resident, withId: string | null, text: Words, about: string[], sealed = false, mark?: { heard?: boolean; bent?: "lie" | "rumor"; said?: boolean }) {
    if (withId && (residents.has(withId) || withId === "player")) notePerson(resident, withId, text, about, sealed, mark);
  }

  function ensurePlan(resident: Resident) {
    const hours = () => dayReferenceOf(resident.anchors, resident.aim || resident.goal.intent).map((row) => ({ from: row.from, scene: row.scene, intent: row.intent }));
    if (resident.plan && resident.plan.day >= day(minute)) {
      if (!resident.plan.hours.length) resident.plan.hours = hours();
      return;
    }
    resident.plan = { day: day(minute), outline: resident.aim || resident.goal.intent, hours: hours() };
  }

  function sleep(resident: Resident) {
    if (resident.plan && resident.plan.day > day(minute)) return;
    const fresh = resident.events.some((event) => !event.reviewed);
    resident.pendingNight = !!options.review && fresh;
    if (!options.review) resident.events = [];
    resident.plan = { day: day(minute) + 1, outline: resident.aim || resident.goal.intent, hours: dayReferenceOf(resident.anchors, resident.aim || resident.goal.intent).map((row) => ({ from: row.from, scene: row.scene, intent: row.intent })) };
  }

  async function finishNight(resident: Resident) {
    if (!resident.pendingNight || !options.review) return;
    resident.pendingNight = false;
    const fresh = resident.events.filter((event) => !event.reviewed);
    if (!fresh.length) return;
    const touched = [...new Set(fresh.flatMap((item) => [item.who, ...(item.about ?? [])]))];
    const ledger = heldNow(resident.id);
    try {
      const result = await options.review({
        id: resident.id,
        persona: resident.persona,
        aim: resident.aim,
        temperament: resident.temperament,
        worry: resident.worry,
        pages: resident.pages.filter((page) => touched.includes(page.who)).map((page) => ({ who: page.who, met: page.met, view: page.view ? [...page.view] as Words : null })),
        events: fresh.map(noteCopy),
        ledger,
      });
      for (const row of result.pages) {
        if (!touched.includes(row.who) || !spoken(row.text)) continue;
        const page = resident.pages.find((item) => item.who === row.who);
        if (!page) continue;
        page.view = [row.text[0].trim(), row.text[1].trim()];
      }
      if (result.temperament && spoken(result.temperament)) resident.temperament = [result.temperament[0].trim(), result.temperament[1].trim()];
      if (result.worry === null) resident.worry = null;
      else if (result.worry && spoken(result.worry)) resident.worry = [result.worry[0].trim(), result.worry[1].trim()];
    } catch { return; }
    for (const event of fresh) event.reviewed = true;
  }

  function heldNow(id: string): HeldNow {
    const bag = society.bags[id];
    const items = Object.entries(bag?.items ?? {}).map(([item, stack]) => ({
      id: item,
      amount: stack.amount,
      ...(stack.locked ? { locked: stack.locked } : {}),
      ...(stack.until !== undefined ? { until: stack.until } : {}),
    }));
    const loans = society.loans.filter((loan) => loan.owner === id || loan.holder === id).map((loan) => ({ tool: loan.tool, owner: loan.owner, holder: loan.holder, held: !!loan.held }));
    const venues = (society.slots ?? []).filter((slot) => slot.holder === id && slot.until >= minute).map((slot) => ({ id: slot.id, holder: slot.holder, until: slot.until }));
    return { cash: bag?.cash ?? 0, locked: bag?.cashLocked ?? 0, items, loans, venues };
  }

  function accountOf(id: string) {
    const now = heldNow(id);
    return { ...now, loans: now.loans.map((loan) => ({ ...loan, has: loan.held ? loan.holder : loan.owner })) };
  }

  function dropExpired(resident: Resident) {
    const open = new Set(openTodos(resident.todos, minute));
    for (const todo of resident.todos) {
      if (open.has(todo)) continue;
      const met = resident.scene === todo.scene;
      const otherName = personName(residents.get(todo.who)?.name, todo.who);
      const done: Words = met
        ? [`和${otherName[0]}一起做过「${todo.intent}」。`, `Did “${todo.intent}” with ${otherName[1]}.`]
        : [`没有守住和${otherName[0]}关于「${todo.intent}」的约定。`, `Did not keep “${todo.intent}” with ${otherName[1]}.`];
      remember(resident, todo.who, done, [todo.who, "promise"]);
      const other = residents.get(todo.who);
      if (!other) continue;
      const heard: Words = met
        ? [`和${label(resident.name, 0)}一起做过「${todo.intent}」。`, `Did “${todo.intent}” with ${label(resident.name, 1)}.`]
        : [`${label(resident.name, 0)}没有守住「${todo.intent}」。`, `${label(resident.name, 1)} did not keep “${todo.intent}”.`];
      remember(other, resident.id, heard, [resident.id, "promise"]);
    }
    resident.todos = [...open];
  }

  function maybeSleep(resident: Resident) {
    if (minute % 1440 === 1260) sleep(resident);
  }

  function positions() {
    return new Map([...residents.values()].map((item) => [item.id, item.scene]));
  }

  function answersReply(reply: DueReply, action: NpcIntent) {
    if (reply.answer === "sign") return action.type === "sign" || action.type === "refuse";
    return action.type === "accept" || action.type === "refuse";
  }

  function resolve(plans: { resident: Resident; action: NpcIntent }[], at: Map<string, string>, held: ReadonlySet<string> = new Set()) {
    const accepted: NpcTick["accepted"] = [];
    const rejected: NpcRejection[] = [];
    const moves: NpcMove[] = [];
    const replies = new Map(plans.map(({ resident }) => [resident.id, dueReply(society, resident.id, minute)]));
    for (const { resident, action } of plans) {
      const reply = replies.get(resident.id) ?? null;
      if (reply && !answersReply(reply, action)) {
        rejected.push({ id: resident.id, action, reason: "NPC_REPLY" });
        continue;
      }
      if ((action.type === "go" || action.type === "plan") && action.scene === sceneOf(resident.id, at)) {
        const ability = resident.can.find((item) => item.action === action.type);
        if (ability && (!ability.scenes || ability.scenes.includes(action.scene)) && pointOf(action.scene)) {
          accepted.push({ id: resident.id, action: { type: "stay" } });
          continue;
        }
      }
      const reason = reject(resident, action, at, reply, held);
      if (reason) {
        rejected.push({ id: resident.id, action, reason });
        noteMiss(resident, action, reason, at);
      } else {
        apply(resident, action, moves, at);
        accepted.push({ id: resident.id, action });
      }
    }
    return { accepted, rejected, moves };
  }

  function act() {
    ripenJobs(society, minute);
    for (const resident of residents.values()) {
      dropExpired(resident);
      maybeSleep(resident);
      hearSpeech(resident);
    }
    const at = positions();
    const plans = [...residents.values()].map((resident) => ({ resident, action: decide(view(resident, false, at)) }));
    const { accepted, rejected, moves } = resolve(plans, at);
    return { accepted, rejected, moves };
  }

  async function commit(choose: (view: NpcView) => Promise<NpcIntent | NpcIntent[]>, near?: string): Promise<NpcTick> {
    playerScene = near;
    ripenJobs(society, minute);
    for (const spoiled of spoilBags(society, minute)) {
      const resident = residents.get(spoiled.holder);
      if (!resident) continue;
      const name = spoiled.item === "crop-tomato" ? ["番茄", "tomatoes"] : spoiled.item === "crop-radish" ? ["萝卜", "radishes"] : spoiled.item === "fish" ? ["鱼", "fish"] : [spoiled.item, spoiled.item];
      remember(resident, resident.id, [`这批${name[0]}过了，不能再卖。`, `This batch of ${name[1]} has spoiled and cannot be sold.`], [spoiled.item, "spoil"]);
    }
    settleOpen(society, minute, Object.fromEntries([...residents.values()].map((item) => [item.id, item.scene])));
    for (const resident of residents.values()) {
      dropExpired(resident);
      maybeSleep(resident);
      await finishNight(resident);
      hearSpeech(resident);
    }
    const at = positions();
    const plans: { resident: Resident; action: NpcIntent }[] = [];
    for (const resident of residents.values()) {
      try {
        const chosen = await choose(await forModel(resident, !!near && sceneOf(resident.id, at) === near, at));
        const actions = (Array.isArray(chosen) ? chosen : [chosen]).sort((left, right) => Number(left.type === "go" || left.type === "plan") - Number(right.type === "go" || right.type === "plan"));
        for (const action of actions) plans.push({ resident, action });
      } catch { /* this resident waits until the next hour */ }
    }
    const held = new Set<string>();
    for (const [resident, other] of openingChats(at)) {
      if (await meet(resident, other, at)) {
        held.add(resident.id);
        held.add(other.id);
      }
    }
    const { accepted, rejected, moves } = resolve(plans, at, held);
    for (const { resident, action } of plans) {
      if ((action.type === "go" || action.type === "plan") && accepted.some((item) => item.id === resident.id && item.action === action)) await describe(resident);
    }
    playerScene = undefined;
    return { minute, accepted, rejected, moves };
  }

  function tick(): NpcTick {
    const result = act();
    minute += step;
    return { minute, ...result };
  }

  function walk(target: number) {
    if (!Number.isSafeInteger(target) || target < minute) throw Error("NPC_TIME");
    while (minute < target) {
      const remainder = minute % step;
      const delta = remainder === 0 ? step : step - remainder;
      minute = Math.min(target, minute + delta);
      if (minute % step === 0) act();
    }
    return state();
  }

  async function seek(target: number) {
    if (!Number.isSafeInteger(target) || target < minute) throw Error("NPC_TIME");
    while (minute < target) {
      const remainder = minute % step;
      const delta = remainder === 0 ? step : step - remainder;
      minute = Math.min(target, minute + delta);
      if (minute % step === 0) {
        act();
        if (minute % 1440 === 1260) for (const resident of residents.values()) await finishNight(resident);
      }
    }
    return state();
  }

  function pointOf(scene: string) {
    for (const person of residents.values()) {
      const anchor = person.anchors.find((item) => item.scene === scene);
      if (anchor) return anchor.at;
    }
    return townScenes().find((place) => place.scene === scene)?.at ?? null;
  }

  function knownPlaces(id: string): Place[] {
    const places: Place[] = [];
    const seen = new Set<string>();
    const add = (scene: string, host: string, kind: Place["kind"], title?: Words) => {
      if (seen.has(scene)) return;
      seen.add(scene);
      places.push({ scene, host, kind, title });
    };
    for (const anchor of residents.get(id)?.anchors ?? []) add(anchor.scene, id, "base");
    for (const person of residents.values()) {
      const home = person.anchors[0];
      if (home && person.id !== id) add(home.scene, person.id, "shop");
    }
    for (const place of townScenes()) add(place.scene, "", "town", place.title);
    return places;
  }

  function keepMeet(resident: Resident, meet: { day: number; slot: 360 | 720 | 1020; scene: string; intent: string; from: string }) {
    resident.todos = openTodos(resident.todos, minute);
    const same = resident.todos.some((item) => item.day === meet.day && item.from === meet.slot && item.scene === meet.scene && item.who === meet.from);
    if (!same && resident.todos.length < 3) resident.todos.push({ day: meet.day, from: meet.slot, scene: meet.scene, intent: meet.intent, who: meet.from });
  }

  function personHere(resident: Resident, at?: Map<string, string>) {
    const people = seenOf(resident, at).people.filter((id) => residents.has(id));
    if (resident.goal.who && people.includes(resident.goal.who)) return resident.goal.who;
    return people[0];
  }

  function reject(resident: Resident, action: NpcIntent, at?: Map<string, string>, reply: DueReply | null = null, held: ReadonlySet<string> = new Set()): string | null {
    if (reply && !answersReply(reply, action)) return "NPC_REPLY";
    if ((action.type === "go" || action.type === "plan") && held.has(resident.id)) return "NPC_HELD";
    const scene = sceneOf(resident.id, at);
    if ((action.type === "propose" || action.type === "invite") && !personHere(resident, at)) return "NPC_PERSON";
    if (action.type === "invite" && !action.when) return "NPC_ACTION";
    const blocked = societyBlock(resident, action, at);
    if (blocked) return blocked;
    const ability = resident.can.find((item) => item.action === action.type);
    if (!ability) return "NPC_ABILITY";
    const destination = action.type === "go" || action.type === "plan" ? action.scene : scene;
    if (ability.scenes && !ability.scenes.includes(destination)) return action.type === "go" || action.type === "plan" ? "NPC_SCENE" : "NPC_ABILITY";
    if (action.type === "stay") return null;
    if (action.type === "listen" || action.type === "fish") return action.lines && !spoken(action.lines) ? "NPC_LINES" : null;
    if (action.type === "go") return pointOf(action.scene) ? null : "NPC_SCENE";
    if (action.type === "talk") {
      if (action.who === "player") {
        if (playerScene !== scene || !resident.sees.includes("people")) return "NPC_APART";
        if (talked.has(`${day(minute)}|${pair(resident.id, "player")}`)) return "NPC_ALREADY_TALKED";
        if (action.lines && !spoken(action.lines)) return "NPC_LINES";
        return null;
      }
      const other = residents.get(action.who);
      if (!other || other.id === resident.id) return "NPC_PERSON";
      if (sceneOf(other.id, at) !== scene) return "NPC_APART";
      if (talked.has(`${day(minute)}|${pair(resident.id, other.id)}`)) return "NPC_ALREADY_TALKED";
      if (action.lines && !spoken(action.lines)) return "NPC_LINES";
      return null;
    }
    if (action.type !== "plan") return null;
    return pointOf(action.scene) ? null : "NPC_SCENE";
  }

  function partyOf(resident: Resident, action: NpcIntent, at?: Map<string, string>): string | null {
    if (action.type === "talk") return action.who === "player" || residents.has(action.who) ? action.who : null;
    if (action.type === "propose" || action.type === "invite") return personHere(resident, at);
    if (action.type === "gift") return giftTo(resident, at);
    if (action.type === "work") return harborWorkFor[resident.id] ?? null;
    if (action.type === "deliver") return society.commissions.find((item) => item.to === resident.id)?.from ?? null;
    if (action.type === "sign") return society.proposals.find((item) => item.parties.includes(resident.id))?.parties.find((id) => id !== resident.id) ?? null;
    if (action.type === "exit") return society.deals.find((item) => item.parties.includes(resident.id))?.parties.find((id) => id !== resident.id) ?? null;
    if (action.type === "trade") return (openQuote(society, resident.id, minute) ?? society.quotes.find((item) => item.seller !== resident.id && item.reserved))?.seller ?? null;
    if (action.type === "borrow" || action.type === "return") return society.loans.find((item) => item.holder === resident.id)?.owner ?? null;
    if (action.type === "accept" || action.type === "refuse") {
      const gift = society.pendingGifts.find((item) => item.to === resident.id);
      const meet = (society.pendingMeets ?? []).find((item) => item.to === resident.id);
      const leaving = (society.exitRequests ?? []).find((item) => item.to === resident.id);
      return gift?.from ?? meet?.from ?? leaving?.from ?? null;
    }
    return null;
  }

  function stakeNames(resident: Resident, who: string) {
    const other: [string, string] = who === "player" ? ["玩家", "player"] : personName(residents.get(who)?.name ?? (who === resident.id ? resident.name : undefined), who);
    return { actor: personName(resident.name, resident.id), other };
  }

  function noteMiss(resident: Resident, action: NpcIntent, reason: string, at?: Map<string, string>) {
    if (!["NPC_APART", "NPC_ALREADY_TALKED", "NPC_CONSENT", "NPC_RESOURCE", "NPC_TERMS", "NPC_SLOT", "NPC_ABSENT", "NPC_BORROWED"].includes(reason)) return;
    const who = partyOf(resident, action, at);
    if (!who || who === resident.id) return;
    const thing = action.type === "talk" ? resident.goal.intent : action.type === "gift" || action.type === "quote" || action.type === "trade" || action.type === "work" ? ownMaterial(society, resident.id, minute) ?? action.type : action.type === "borrow" || action.type === "return" ? society.loans.find((item) => item.holder === resident.id)?.tool ?? action.type : action.type;
    const names = stakeNames(resident, who);
    remember(resident, who, namedMiss(names.actor, names.other, thing, reason), [who, action.type, "miss"]);
  }

  function giftTo(resident: Resident, at?: Map<string, string>) {
    const scene = sceneOf(resident.id, at);
    const partner = resident.goal.who && residents.get(resident.goal.who);
    if (partner && sceneOf(partner.id, at) === scene) return partner.id;
    if (playerScene === scene) return "player";
    if (partner) return partner.id;
    return seenOf(resident, at).people[0];
  }

  function attemptFor(resident: Resident, action: NpcIntent, at?: Map<string, string>): NpcAttempt | null {
    const id = resident.id;
    const scene = sceneOf(id, at);
    if (action.type === "stay") return { id, scene, minute, action: { type: "wait" } };
    if (action.type === "go") return { id, scene, minute, action: { type: "move", scene: action.scene } };
    if (action.type === "talk") return { id, scene, minute, action: { type: "message", to: action.who, settles: false } };
    if (action.type === "plan") return { id, scene, minute, action: { type: "plan" } };
    if (action.type === "listen" || action.type === "fish") return null;
    if (action.type === "work") return { id, scene, minute, action: { type: "work", for: harborWorkFor[id] ?? null, present: true } };
    if (action.type === "deliver") {
      const job = society.commissions.find((item) => item.to === id && item.scene === scene && item.until >= minute);
      return { id, scene, minute, action: { type: "deliver", commission: job?.id ?? null } };
    }
    if (action.type === "quote") return { id, scene, minute, action: { type: "quote", item: ownMaterial(society, id, minute) ?? "wood", qty: 1 } };
    if (action.type === "trade") {
      const quote = openQuote(society, id, minute);
      return { id, scene, minute, action: { type: "trade", quote: quote?.id ?? null } };
    }
    if (action.type === "gift") {
      const to = giftTo(resident, at);
      if (!to) return null;
      return { id, scene, minute, action: { type: "gift", item: ownMaterial(society, id, minute) ?? "wood", qty: 1, to } };
    }
    if (action.type === "borrow") {
      const loan = society.loans.find((item) => item.holder === id && !item.held && item.until >= minute);
      return { id, scene, minute, action: { type: "borrow", tool: loan?.tool ?? "tool" } };
    }
    if (action.type === "return") {
      const loan = society.loans.find((item) => item.holder === id && item.held && item.until >= minute);
      return { id, scene, minute, action: { type: "return", tool: loan?.tool ?? "tool" } };
    }
    if (action.type === "reserve") return { id, scene, minute, action: { type: "reserve", slot: harborVenue[id] ?? "dock" } };
    if (action.type === "speak") return { id, scene, minute, action: { type: "speak" } };
    if (action.type === "propose") {
      const withId = personHere(resident, at);
      return withId ? { id, scene, minute, action: { type: "propose", with: withId } } : null;
    }
    if (action.type === "sign") {
      const proposal = society.proposals.find((item) => item.parties.includes(id) && !item.signed.includes(id) && item.until >= minute && (item.signable ?? 0) <= minute);
      return { id, scene, minute, action: { type: "sign", proposal: proposal?.id ?? null } };
    }
    if (action.type === "exit") {
      const deal = society.deals.find((item) => item.parties.includes(id));
      return { id, scene, minute, action: { type: "exit", deal: deal?.id ?? null } };
    }
    if (action.type === "invite") {
      const withId = personHere(resident, at);
      return withId && action.when ? { id, scene, minute, action: { type: "invite", with: withId, day: action.when.day, from: action.when.from, intent: resident.goal.intent } } : null;
    }
    if (action.type === "attend") {
      const event = harborGathering[id] ?? resident.goal.scene;
      return { id, scene, minute, action: { type: "attend", event, present: scene === event } };
    }
    if (action.type === "accept") return { id, scene, minute, action: { type: "accept" } };
    return { id, scene, minute, action: { type: "refuse" } };
  }

  function fallbackDoing(resident: Resident): Words {
    const clock = ((minute % 1440) + 1440) % 1440;
    const hour = [...(resident.plan?.hours ?? [])].reverse().find((item) => item.from <= clock) ?? resident.plan?.hours[0];
    const intent = hour?.intent || resident.goal.intent;
    return [`正在${resident.scene}。今天的参考是「${intent}」。`, `At ${resident.scene}. Today's reference: “${intent}”.`];
  }

  async function describe(resident: Resident) {
    if (!options.narrate) {
      resident.doing = fallbackDoing(resident);
      return;
    }
    try { resident.doing = await options.narrate(await forModel(resident), resident.scene); }
    catch { resident.doing = fallbackDoing(resident); }
  }

  function speak(resident: Resident, other: Resident, round: PresenceRound) {
    if (!("text" in round) || !round.text) return false;
    const about = round.about ?? [round.event];
    const tags = [other.id, round.event, ...about];
    const bent = round.event === "lie" || round.event === "rumor" ? round.event : undefined;
    const passed = bent || round.event === "relay";
    remember(other, resident.id, round.text, [resident.id, round.event, ...about], round.event === "confide", passed ? { heard: true } : undefined);
    if (bent) remember(resident, other.id, round.text, tags, false, { bent });
    else if (round.event === "relay") remember(resident, other.id, round.text, tags, false, { heard: true });
    else if (!passed) remember(resident, other.id, round.text, tags, false, { said: true });
    return true;
  }

  function openingChats(at: Map<string, string>) {
    const used = new Set<string>();
    const pairs: [Resident, Resident][] = [];
    for (const resident of residents.values()) {
      if (used.has(resident.id)) continue;
      const partnerId = seenOf(resident, at).people.find((id) => !used.has(id));
      const other = partnerId ? residents.get(partnerId) : undefined;
      if (!other || sceneOf(other.id, at) !== sceneOf(resident.id, at)) continue;
      used.add(resident.id);
      used.add(other.id);
      pairs.push([resident, other]);
    }
    return pairs;
  }

  async function meet(resident: Resident, other: Resident, at: Map<string, string>) {
    if (!options.converse) return false;
    let rounds: PresenceRound[] = [];
    try { rounds = await options.converse(await forModel(resident, false, at), await forModel(other, false, at)); } catch { return false; }
    let spokenRound = false;
    for (const round of rounds) {
      const from = round.who ? residents.get(round.who) : resident;
      const to = from?.id === other.id ? resident : other;
      if (from && to && from.id !== to.id && applyPresence(from, to, round)) spokenRound = true;
    }
    return spokenRound;
  }

  function applyPresence(resident: Resident, other: Resident, round: PresenceRound) {
    const said = speak(resident, other, round);
    if (round.event === "relay" || round.event === "complain" || round.event === "lie" || round.event === "rumor" || round.event === "promise" || round.event === "confide" || round.event === "propose" || round.event === "invite" || round.event === "talk") return said;
    if (!round.accepted) {
      const text: Words = [`${label(other.name, 0)}没有接受这次${round.event}。`, `${label(other.name, 1)} did not accept the ${round.event}.`];
      remember(resident, other.id, text, [other.id, resident.scene, round.event]);
      remember(other, resident.id, text, [resident.id, other.scene, round.event]);
      return true;
    }
    finishMeeting(resident, other, round.event);
    return true;
  }

  function finishMeeting(resident: Resident, other: Resident, event: MeetingEvent | "quote", at?: Map<string, string>) {
    const item = ownMaterial(society, resident.id, minute) ?? "wood";
    const quote = openQuote(society, resident.id, minute);
    const borrow = society.loans.find((item) => item.holder === resident.id && !item.held && item.until >= minute);
    const returning = society.loans.find((item) => item.holder === resident.id && item.held && item.until >= minute);
    const scene = sceneOf(resident.id, at);
    const attempt: NpcAttempt = event === "quote" ? { id: resident.id, scene, minute, action: { type: "quote", item, qty: 1 } }
      : event === "trade" ? { id: resident.id, scene, minute, action: { type: "trade", quote: quote?.id ?? null } }
      : event === "gift" ? { id: resident.id, scene, minute, action: { type: "gift", item, qty: 1, to: other.id } }
      : event === "borrow" ? { id: resident.id, scene, minute, action: { type: "borrow", tool: borrow?.tool ?? "tool" } }
      : event === "return" ? { id: resident.id, scene, minute, action: { type: "return", tool: returning?.tool ?? "tool" } }
      : event === "reserve" ? { id: resident.id, scene, minute, action: { type: "reserve", slot: harborVenue[resident.id] ?? "dock" } }
      : event === "accept" ? { id: resident.id, scene, minute, action: { type: "accept" } }
      : { id: resident.id, scene, minute, action: { type: "refuse" } };
    const blocked = npcPermit(society, attempt);
    if (blocked) {
      remember(resident, other.id, namedMiss(personName(resident.name, resident.id), personName(other.name, other.id), event === "borrow" ? borrow?.tool ?? item : event === "return" ? returning?.tool ?? item : item, blocked), [other.id, event, "miss"]);
      return;
    }
    const places = Object.fromEntries([...(at ?? positions()).entries()]);
    const pending = society.pendingDeliveries.length;
    const result = applySociety(society, attempt, places);
    if (result.reason) {
      remember(resident, other.id, namedMiss(personName(resident.name, resident.id), personName(other.name, other.id), event === "borrow" ? borrow?.tool ?? item : event === "return" ? returning?.tool ?? item : item, result.reason), [other.id, event, "miss"]);
      return;
    }
    society = result.ledger;
    if (event === "gift") {
      const accept: NpcAttempt = { id: other.id, scene: sceneOf(other.id, at), minute, action: { type: "accept" } };
      if (npcPermit(society, accept)) {
        const text = societyText("gift", false, { actor: personName(resident.name, resident.id), other: personName(other.name, other.id), item, intent: resident.goal.intent });
        remember(resident, other.id, text, [other.id, resident.scene, "gift"]);
        return;
      }
      const done = applySociety(society, accept, places);
      if (done.reason) {
        remember(resident, other.id, namedMiss(personName(resident.name, resident.id), personName(other.name, other.id), item, done.reason), [other.id, "gift", "miss"]);
        return;
      }
      society = done.ledger;
      const text: Words = [`谈话里把${item}给了${label(other.name, 0)}，${label(other.name, 0)}收下了${item}。`, `${label(resident.name, 1)} gave ${item} to ${label(other.name, 1)}, and ${label(other.name, 1)} accepted ${item}.`];
      remember(resident, other.id, text, [other.id, resident.scene, "gift"]);
      remember(other, resident.id, text, [resident.id, other.scene, "gift"]);
      return;
    }
    const text = societyText(event, result.ledger.pendingDeliveries.length > pending, { actor: personName(resident.name, resident.id), other: personName(other.name, other.id), item: event === "borrow" ? borrow?.tool ?? item : event === "return" ? returning?.tool ?? item : event === "reserve" ? harborVenue[resident.id] ?? "dock" : item, intent: resident.goal.intent });
    remember(resident, other.id, text, [other.id, resident.scene, event]);
    remember(other, resident.id, text, [resident.id, other.scene, event]);
  }

  function societyBlock(resident: Resident, action: NpcIntent, at?: Map<string, string>): string | null {
    if (action.type === "listen" || action.type === "fish") return null;
    if (action.type === "gift" && !giftTo(resident, at)) return "NPC_PERSON";
    const attempt = attemptFor(resident, action, at);
    if (!attempt) return "NPC_ACTION";
    return npcPermit(society, attempt);
  }

  function hearSpeech(resident: Resident) {
    for (const speech of society.speeches) {
      if (speech.from === resident.id || speech.heard.includes(resident.id) || speech.minute >= minute || speech.scene !== resident.scene) continue;
      speech.heard.push(resident.id);
      remember(resident, speech.from, speech.text, [speech.from, speech.scene]);
    }
  }

  function stored(resident: Resident) {
    return { id: resident.id, name: resident.name, scene: resident.scene, goal: copy(resident.goal), pages: copy(resident.pages), events: copy(resident.events), temperament: resident.temperament ? [...resident.temperament] as Words : undefined, worry: resident.worry ? [...resident.worry] as Words : undefined, plan: copy(resident.plan), doing: resident.doing ? [...resident.doing] as Words : undefined, todos: openTodos(resident.todos, minute) };
  }

  function state(): NpcTownState {
    return { minute, residents: [...residents.values()].map(stored), talked: [...talked], society: copy(society) };
  }

  function transcript(id: string) {
    const resident = residents.get(id);
    if (!resident) throw Error("NPC_PERSON");
    const name = Array.isArray(resident.name) ? resident.name.join(" / ") : resident.name;
    const plan = resident.plan ? `计划：${resident.plan.outline}；${resident.plan.hours.map((hour) => `${clockOf(hour.from)} ${hour.scene}`).join("，")}` : "";
    const pages = resident.pages.map((page) => `对${page.who}（${page.met}）：${page.view?.[0] ?? ""}`);
    const temperament = resident.temperament ? `性情：${resident.temperament[0]}` : "";
    const worry = resident.worry ? `烦恼：${resident.worry[0]}` : "";
    const events = resident.events.map((event) => `今天和${event.who}：${event.text[0]}`);
    return [name, `身份：${resident.persona}`, resident.background && `背景：${resident.background}`, resident.voice && `说话：${resident.voice}`, resident.aim && `长期：${resident.aim}`, worry, temperament, plan, ...pages, ...events].filter((line): line is string => !!line).join("\n");
  }

  function apply(resident: Resident, action: NpcIntent, moves: NpcMove[], at?: Map<string, string>) {
    if (action.type === "go") {
      const at = pointOf(action.scene);
      if (!at) return;
      resident.scene = action.scene;
      moves.push({ id: resident.id, scene: action.scene, at: { ...at } });
    } else if (action.type === "talk" && action.who === "player") {
      talked.add(`${day(minute)}|${pair(resident.id, "player")}`);
      const spokenTo = action.lines ?? [`和玩家说起「${resident.goal.intent}」。`, `Spoke to the player about “${resident.goal.intent}”.`];
      remember(resident, "player", spokenTo, ["player", resident.scene]);
    } else if (action.type === "talk") {
      const other = residents.get(action.who)!;
      const key = pair(resident.id, other.id);
      talked.add(`${day(minute)}|${key}`);
      const span = action.minutes === 30 ? ["半小时", "half an hour"] : ["一个小时", "an hour"];
      const spokenTo = action.lines ?? [`和${label(other.name, 0)}谈了${span[0]}，「${resident.goal.intent}」。`, `Talked with ${label(other.name, 1)} for ${span[1]} about “${resident.goal.intent}”.`];
      const heard = action.lines ?? [`${label(resident.name, 0)}来谈了${span[0]}，「${resident.goal.intent}」。`, `${label(resident.name, 1)} talked for ${span[1]} about “${resident.goal.intent}”.`];
      remember(resident, other.id, spokenTo, [other.id, resident.scene, String(action.minutes ?? 60)]);
      remember(other, resident.id, heard, [resident.id, other.scene]);
      if (action.event) finishMeeting(resident, other, action.event, at);
    } else if (action.type === "plan") {
      const at = pointOf(action.scene);
      if (!at) return;
      resident.replannedOn = day(minute);
      ensurePlan(resident);
      resident.scene = action.scene;
      moves.push({ id: resident.id, scene: action.scene, at: { ...at } });
    } else if (action.type === "work" || action.type === "quote" || action.type === "trade" || action.type === "gift" || action.type === "borrow" || action.type === "return" || action.type === "reserve" || action.type === "speak" || action.type === "propose" || action.type === "sign" || action.type === "exit" || action.type === "invite" || action.type === "attend" || action.type === "accept" || action.type === "refuse" || action.type === "deliver") {
      const attempt = attemptFor(resident, action, at);
      if (!attempt) return;
      const owed = (action.type === "accept" || action.type === "refuse") ? society.pendingGifts.find((item) => item.to === resident.id && item.until >= minute) : undefined;
      const meet = action.type === "accept" ? (society.pendingMeets ?? []).find((item) => item.to === resident.id && item.ready <= minute) : undefined;
      const waiting = society.pendingDeliveries.length;
      const places = Object.fromEntries([...(at ?? positions()).entries()]);
      const act = attempt.action;
      const tradeQuote = act.type === "trade" ? society.quotes.find((item) => item.id === act.quote) : undefined;
      const job = act.type === "deliver" ? society.commissions.find((item) => item.id === act.commission) ?? society.commissions.find((item) => item.to === resident.id) : undefined;
      const loan = act.type === "borrow" || act.type === "return" ? society.loans.find((item) => item.holder === resident.id && item.until >= minute) : undefined;
      const proposal = act.type === "sign" ? society.proposals.find((item) => item.id === act.proposal) : undefined;
      const deal = act.type === "exit" ? society.deals.find((item) => item.id === act.deal) : undefined;
      const item = act.type === "gift" || act.type === "quote" ? act.item
        : act.type === "borrow" || act.type === "return" ? act.tool
        : act.type === "reserve" ? act.slot
        : act.type === "attend" ? act.event
        : act.type === "trade" ? tradeQuote?.item ?? "goods"
        : act.type === "deliver" ? job?.item ?? "goods"
        : owed?.item ?? meet?.intent ?? resident.goal.intent;
      const partnerId = act.type === "propose" || act.type === "invite" ? act.with ?? null
        : act.type === "gift" ? act.to ?? null
        : act.type === "deliver" ? job?.from ?? null
        : act.type === "trade" ? tradeQuote?.seller ?? null
        : act.type === "borrow" || act.type === "return" ? (loan?.owner === resident.id ? loan.holder : loan?.owner) ?? null
        : act.type === "sign" ? proposal?.parties.find((id) => id !== resident.id) ?? null
        : act.type === "exit" ? deal?.parties.find((id) => id !== resident.id) ?? null
        : act.type === "work" ? act.for
        : act.type === "accept" || act.type === "refuse" ? owed?.from ?? meet?.from ?? null
        : resident.id;
      const result = applySociety(society, attempt, places);
      if (result.reason) {
        const missed = partnerId && partnerId !== resident.id ? partnerId : partyOf(resident, action, at);
        if (missed && missed !== resident.id) {
          const names = stakeNames(resident, missed);
          remember(resident, missed, namedMiss(names.actor, names.other, item, result.reason), [missed, action.type, "miss"]);
        }
        return;
      }
      society = result.ledger;
      if (act.type === "speak") {
        const speech = [...society.speeches].reverse().find((item) => item.from === resident.id && item.minute === minute);
        if (speech) {
          speech.text = societyText("speak", false, { actor: personName(resident.name, resident.id), other: personName(resident.name, resident.id), item: resident.scene, intent: resident.goal.intent });
          remember(resident, resident.id, speech.text, [resident.scene, "speak"]);
        }
        return;
      }
      if (meet && !(society.pendingMeets ?? []).some((entry) => entry.id === meet.id)) keepMeet(resident, meet);
      const who = partnerId || resident.id;
      const names = stakeNames(resident, who);
      const exitAsked = act.type === "exit" && (society.exitRequests ?? []).some((item) => item.from === resident.id && item.until >= minute);
      const text = act.type === "exit"
        ? exitAsked
          ? [`${names.actor[0]}要退出和${names.other[0]}的合作，${names.other[0]}还没答应。`, `${names.actor[1]} asked to leave the cooperation with ${names.other[1]}. ${names.other[1]} has not answered.`] as Words
          : [`${names.actor[0]}退出了和${names.other[0]}的合作。`, `${names.actor[1]} left the cooperation with ${names.other[1]}.`] as Words
        : societyText(action.type, result.ledger.pendingDeliveries.length > waiting, { actor: names.actor, other: names.other, item, intent: meet?.intent || resident.goal.intent });
      remember(resident, who, text, [who, action.type]);
      const other = residents.get(who);
      if (other && other.id !== resident.id) remember(other, resident.id, text, [resident.id, action.type]);
    }
  }

  function consult(id: string, selected?: string[]) {
    const resident = residents.get(id);
    if (!resident) return;
    const kept = (doc: string) => !selected || selected.includes(doc);
    return {
      persona: resident.persona,
      temperament: resident.temperament ? [...resident.temperament] as Words : null,
      worry: resident.worry ? [...resident.worry] as Words : null,
      voice: resident.voice,
      aim: resident.aim,
      doing: resident.doing ? [...resident.doing] as Words : undefined,
      dayReference: dayReferenceOf(resident.anchors, resident.aim || resident.goal.intent),
      todos: openTodos(resident.todos, minute).filter((todo, index) => kept(`todo:${index}:${todo.who}`)),
      here: seenOf(resident).people,
      ledger: accountOf(id),
      pages: resident.pages.filter((page) => page.view && kept(`person:${page.who}`)).map((page) => ({ who: page.who, met: page.met, view: [...page.view!] as Words })),
      events: resident.events.filter((event, index) => kept(`event:${index}:${event.who}`)).map(noteCopy),
    };
  }

  function listDocuments(id: string) {
    const resident = residents.get(id);
    return resident ? papersOf(resident).map((row) => ({ id: row.id, text: row.text[0] })) : [];
  }

  async function rememberPlayer(id: string, text: Words, _at = minute) {
    const resident = residents.get(id);
    if (!resident) return state();
    remember(resident, "player", text, ["player", resident.scene]);
    return state();
  }

  return { tick, walk, seek, commit, state, transcript, consult, listDocuments, rememberPlayer };
}

type PriorResident = { pages?: (PersonPage & { today?: Words | null })[]; memory?: Memory[]; events?: DayNote[] };

function keptPages(prior: PriorResident | undefined): PersonPage[] {
  return (prior?.pages ?? []).map((page) => ({ who: page.who, met: page.met === "familiar" ? "familiar" as const : "once" as const, view: page.view ? [...page.view] as Words : null, about: [...(page.about ?? [])] }));
}

function noteCopy(event: DayNote): DayNote {
  return { who: event.who, text: [...event.text] as Words, ...(event.sealed ? { sealed: true } : {}), ...(event.heard ? { heard: true } : {}), ...(event.bent ? { bent: event.bent } : {}), ...(event.said ? { said: true } : {}), ...(event.about?.length ? { about: [...event.about] } : {}), ...(event.reviewed ? { reviewed: true } : {}) };
}

const eventKeep = 50;

function keptEvents(prior: PriorResident | undefined): DayNote[] {
  if (prior?.events?.length) return prior.events.slice(-eventKeep).map(noteCopy);
  const fromToday = (prior?.pages ?? []).flatMap((page) => page.today ? [{ who: page.who, text: [...page.today] as Words }] : []);
  if (fromToday.length) return fromToday.slice(-eventKeep);
  return (prior?.memory ?? []).filter((item) => item.with).slice(-eventKeep).map((item) => ({ who: item.with as string, text: [...item.text] as Words }));
}

const spoken = (lines: Words) => lines.length === 2 && lines.every((line) => line.trim().length > 0);
function slotEnd(from: number) {
  return from === 360 ? 720 : from === 720 ? 1020 : 1260;
}

function openTodos(items: Todo[] | undefined, minute: number): Todo[] {
  const today = day(minute);
  const clock = ((minute % 1440) + 1440) % 1440;
  return (items ?? []).filter((item) => item.day > today || (item.day === today && clock < slotEnd(item.from))).slice(-3);
}

function todoWords(when: { day: number; from: number }, minute: number): Words {
  const period = when.from === 360 ? ["早上", "in the morning"] : when.from === 720 ? ["下午", "in the afternoon"] : ["晚上", "in the evening"];
  const which = when.day === day(minute) ? ["今天", "today"] : when.day === day(minute) + 1 ? ["明天", "tomorrow"] : [`第${when.day + 1}天`, `on day ${when.day + 1}`];
  return [`${which[0]}${period[0]}`, `${which[1]} ${period[1]}`];
}

const label = (name: string | Words, locale: 0 | 1) => Array.isArray(name) ? name[locale] : name;
const personName = (name: string | Words | undefined, fallback: string): [string, string] => Array.isArray(name) ? [name[0], name[1]] : [name || fallback, name || fallback];
type EventStake = { actor: [string, string]; other: [string, string]; item: string; intent: string };
const namedMiss = (actor: [string, string], other: [string, string], item: string, reason: string): Words => {
  const [az, ae] = actor;
  const [oz, oe] = other;
  const because = reason === "NPC_APART" ? ["不在一处", "were apart"]
    : reason === "NPC_ALREADY_TALKED" ? ["今天已经说过", "had already talked"]
    : reason === "NPC_RESOURCE" ? ["手头不够", "did not have enough"]
    : reason === "NPC_TERMS" ? ["条款对不上", "did not match the terms"]
    : reason === "NPC_SLOT" ? ["时段占不上", "could not take the time"]
    : reason === "NPC_ABSENT" ? ["人没到", "was not there"]
    : reason === "NPC_BORROWED" ? ["借来的东西动不了", "could not move a borrowed thing"]
    : ["没有办成", "did not get it done"];
  return [`${az}和${oz}因为${because[0]}，${item}还没了结。`, `${ae} and ${oe} ${because[1]}, so ${item} is still unfinished.`];
};
const societyText = (action: NpcAction, pending: boolean, stake: EventStake): Words => {
  const [az, ae] = stake.actor;
  const [oz, oe] = stake.other;
  const item = stake.item;
  const intent = stake.intent;
  if (action === "work") {
    const named = oe !== ae;
    return named
      ? [`${az}为${oz}用掉了${item}，${intent}要的货还要等下一个钟头。`, `${ae} spent ${item} for ${oe}. The goods for ${intent} are not ready until the next hour.`]
      : [`${az}用掉了${item}，${intent}要的货还要等下一个钟头。`, `${ae} spent ${item}. The goods for ${intent} are not ready until the next hour.`];
  }
  if (action === "quote") return [`${az}给${item}报了价，${item}锁着，还没卖掉。`, `${ae} posted a price on ${item}. ${item} is locked and still unsold.`];
  if (action === "trade") return pending ? [`${az}和${oz}谈妥了${item}，两人不在一处，${item}还没交付。`, `${ae} and ${oe} agreed on ${item}, but they are apart, so ${item} is still undelivered.`] : [`${az}和${oz}当面按原价结清了${item}。`, `${ae} and ${oe} settled ${item} where they both stand.`];
  if (action === "gift") return [`${az}把${item}留给${oz}，${oz}还没接受${item}。`, `${ae} is holding ${item} for ${oe}. ${oe} has not accepted ${item} yet.`];
  if (action === "borrow") return [`${az}从${oz}手里借到${item}，${item}的主人仍是${oz}。`, `${ae} borrowed ${item} from ${oe}. ${oe} still owns ${item}.`];
  if (action === "return") return [`${az}把${item}还给了${oz}。`, `${ae} returned ${item} to ${oe}.`];
  if (action === "reserve") return [`${az}要预约${item}，这个时段还没被占上。`, `${ae} asked to reserve ${item}. ${item} is not taken yet.`];
  if (action === "speak") return [`${az}当众说${intent}还没做完。`, `${ae} said in public that ${intent} is still unfinished.`];
  if (action === "propose") return [`${az}请${oz}一起做${intent}，${oz}还没签字。`, `${ae} asked ${oe} to cooperate on ${intent}. ${oe} has not signed.`];
  if (action === "sign") return [`${az}在和${oz}的合作上签了名。人没齐之前，这件事还不生效。`, `${ae} signed the cooperation with ${oe}. It does nothing until everyone named has signed.`];
  if (action === "exit") return [`${az}要退出和${oz}的合作，${oz}还没答应。`, `${ae} asked to leave the cooperation with ${oe}. ${oe} has not answered.`];
  if (action === "invite") return [`${az}约${oz}来做${intent}，${oz}还没答应。`, `${ae} asked ${oe} to come for ${intent}. ${oe} has not answered.`];
  if (action === "attend") return [`${az}到了${item}。到场还不是把${intent}做完。`, `${ae} arrived at ${item}. Arriving has not finished ${intent}.`];
  if (action === "accept") return [`${az}收下了${oz}留下的${item}。`, `${ae} accepted ${item} from ${oe}.`];
  if (action === "deliver") return [`${az}把委托的${item}交给了${oz}，预留的报酬结清了。`, `${ae} delivered the commissioned ${item} to ${oe}. The reserved pay is settled.`];
  return [`${az}没有收下${oz}的${item}，${item}回到${oz}手里。`, `${ae} refused ${item} from ${oe}. ${item} goes back to ${oe}.`];
};

/** Morning, afternoon, and evening places. A reference for the decision, not this hour's destination. */
export function dayReferenceOf(anchors: { scene: string }[], aim: string) {
  return [360, 720, 1020].flatMap((from, index) => {
    const scene = anchors[index]?.scene;
    return scene ? [{ from, scene, intent: aim }] : [];
  });
}

/** The morning, afternoon, or evening base place. Used only to draw the map before a ledger exists. */
export function scheduledDestination(anchors: { scene: string }[], minute: number) {
  const clock = ((minute % 1440) + 1440) % 1440;
  if (clock < 360 || clock >= 1260) return null;
  const index = clock < 720 ? 0 : clock < 1020 ? 1 : 2;
  return anchors[index]?.scene ?? null;
}

export function abilityAllows(can: Ability[], action: NpcAction, scene?: string) {
  const ability = can.find((item) => item.action === action);
  return !!ability && (!scene || !ability.scenes || ability.scenes.includes(scene));
}

function defaultDecide(view: NpcView): NpcIntent {
  const toward = view.me.goal.scene;
  const known = view.anchors.some((anchor) => anchor.scene === toward) || view.places?.some((place) => place.scene === toward);
  if (abilityAllows(view.me.can, "go", toward) && toward !== view.me.scene && known) return { type: "go", scene: toward };
  const company = view.here.find((id) => id === view.me.goal.who) ?? view.here[0];
  if (company && abilityAllows(view.me.can, "talk", view.me.scene) && !view.talked.includes(pair(view.me.id, company))) return { type: "talk", who: company };
  return { type: "stay" };
}
