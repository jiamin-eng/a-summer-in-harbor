import { abilityAllows, createNpcTown, scheduledDestination, type NpcIntent, type NpcTownState, type NpcView, type ResidentConfig, type Words } from "./town";

/** Same names as the old town, now driven by the sandbox goals. Elena and Arthur stay outside. */
const ids = ["owen", "mara", "samira", "dani", "gabriel", "avery", "theo", "june", "idris", "ruth", "luis", "nell"];
let cast: ResidentConfig[] = [];
const cache = new Map<number, NpcTownState>();

export const harborLoopIds = ids;

export function bindHarborLoop(residents: ResidentConfig[]) {
  cast = residents;
  cache.clear();
}

export function harborCast() {
  return cast;
}

export function harborLoopScene(id: string, minute: number) {
  return project(minute).residents.find((resident) => resident.id === id)?.scene;
}

export function harborLoopMemory(id: string, minute: number): Words | undefined {
  const resident = project(minute).residents.find((item) => item.id === id);
  return resident?.pages.find((item) => item.view)?.view ?? undefined;
}

function project(minute: number) {
  const hit = cache.get(minute);
  if (hit) return hit;
  const town = createNpcTown({ residents: cast, minute: 0, minutesPerTick: 60, decide: harborScheduleDecide });
  const state = town.walk(minute);
  cache.set(minute, state);
  return state;
}

export function harborScheduleDecide(view: NpcView): NpcIntent {
  const scene = scheduledDestination(view.anchors, view.minute);
  if (scene && scene !== view.me.scene && abilityAllows(view.me.can, "go", scene)) return { type: "go", scene };
  const company = view.here.find((id) => id === view.me.goal.who) ?? view.here[0];
  if (company && abilityAllows(view.me.can, "talk", view.me.scene) && !view.talked.includes([view.me.id, company].sort().join("|"))) return { type: "talk", who: company };
  return { type: "stay" };
}
