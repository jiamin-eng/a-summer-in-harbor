import { provideServerModules } from "@rpgjs/server";
import { createNpcTown, type NpcMove, type NpcTick, type NpcTownOptions } from "./town";

type NpcMap = { events?: () => Record<string, { teleport?: (at: { x: number; y: number }) => Promise<unknown> | unknown }> };

export type NpcProviderOptions = NpcTownOptions & { stepsPerTick?: number; onTick?: (tick: NpcTick) => void };

/** Register the town loop on the RPGJS server step. The game passes personas,
 * anchors and an optional decide function. Chapter actions stay outside. */
export function provideNpcTown(options: NpcProviderOptions) {
  const town = createNpcTown(options);
  let steps = 0;
  const every = options.stepsPerTick ?? 1;
  return provideServerModules([{
    engine: {
      onStep(server) {
        steps += 1;
        if (steps % every !== 0) return;
        const tick = town.tick();
        options.onTick?.(tick);
        place(server.subRoom as NpcMap | null, tick.moves);
      },
    },
  }]);
}

function place(map: NpcMap | null | undefined, moves: NpcMove[]) {
  const events = map?.events?.();
  if (!events) return;
  for (const move of moves) void events[move.id]?.teleport?.(move.at);
}
