/**
 * While an MCP session is connected, stand in town on the game's foreground clock.
 * Same settlement as the open page: one town minute per four real seconds,
 * and a gap longer than the three-second lease is not filled in afterwards.
 */
import { randomUUID } from 'node:crypto';
import { activePlayActionId, type ActivePlayAck } from '../../src/candidate/active-play-types';
import type { Action, Save } from '../../src/story/state';
import { battleLocksWorld } from '../../src/story/turn-battle';
import { withPlayerLock } from './lock';

const TICK_MS = 2_000;

type PlayAuthority = {
  directory(owner: string): Promise<Array<{ id: string; updated: number }>>;
  get(owner: string, id: string): Promise<Save>;
  activePlay?(owner: string, id: string, action: Action): Promise<ActivePlayAck>;
};

type Held = {
  owner: string;
  client: string;
  refs: number;
  timer?: ReturnType<typeof setInterval>;
};

export interface TownPresence {
  start(owner: string): void;
  stop(owner: string): void;
  /** Drop our lease before a tool reads or writes, then pick it up again after. */
  release(owner: string): Promise<void>;
  resume(owner: string): Promise<void>;
}

function latestId(rows: Array<{ id: string; updated: number }>): string | undefined {
  return [...rows].sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))[0]?.id;
}

function codeOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

export function createTownPresence(authority: PlayAuthority): TownPresence {
  const heldByOwner = new Map<string, Held>();
  const play = authority.activePlay?.bind(authority);

  async function journey(owner: string): Promise<Save | null> {
    const id = latestId(await authority.directory(owner));
    return id ? authority.get(owner, id) : null;
  }

  async function submit(owner: string, save: Save, client: string, action: 'candidate-active-open' | 'candidate-active-tick' | 'candidate-active-pause', extra: Record<string, unknown> = {}): Promise<void> {
    if (!play) return;
    const last = save.activePlayClock?.transport?.last.ack;
    const ordinal = (last?.ordinal ?? 0) + 1;
    await play(owner, save.id, {
      action_id: activePlayActionId(save.id, ordinal),
      expected_version: save.version,
      scene: save.scene,
      position: { ...save.position },
      target: '',
      action,
      payload: { ordinal, previous: last?.token ?? '', client, ...extra },
    });
  }

  async function pause(owner: string, client: string): Promise<void> {
    const save = await journey(owner);
    const lease = save?.activePlayClock?.lease;
    if (!save || !lease || lease.client !== client) return;
    const activeMs = Math.min(3000, Math.max(0, Date.now() - lease.lastAt));
    try {
      await submit(owner, save, client, 'candidate-active-pause', {
        lease: lease.id,
        sequence: lease.sequence + 1,
        activeMs,
      });
    } catch (error) {
      const code = codeOf(error);
      if (code !== 'ACTIVE_LEASE_EXPIRED' && code !== 'VERSION_CONFLICT' && code !== 'ACTIVE_LEASE_BUSY') throw error;
    }
  }

  async function step(owner: string, client: string): Promise<void> {
    if (!play) return;
    const save = await journey(owner);
    if (!save || save.activeChallenge || battleLocksWorld(save)) {
      await pause(owner, client);
      return;
    }
    const lease = save.activePlayClock?.lease;
    if (lease && lease.client !== client) return;
    if (!lease) {
      try {
        await submit(owner, save, client, 'candidate-active-open');
      } catch (error) {
        const code = codeOf(error);
        if (code === 'ACTIVE_LEASE_BUSY' || code === 'CHALLENGE_ACTIVE' || code === 'VERSION_CONFLICT') return;
        throw error;
      }
      return;
    }
    const elapsed = Date.now() - lease.lastAt;
    if (elapsed < 1_000) return;
    const activeMs = Math.min(3000, elapsed);
    try {
      await submit(owner, save, client, 'candidate-active-tick', {
        lease: lease.id,
        sequence: lease.sequence + 1,
        activeMs,
      });
    } catch (error) {
      const code = codeOf(error);
      if (code === 'ACTIVE_LEASE_EXPIRED') {
        await pause(owner, client);
        return;
      }
      if (code === 'VERSION_CONFLICT' || code === 'ACTIVE_LEASE_BUSY') return;
      throw error;
    }
  }

  return {
    start(owner) {
      if (!play) return;
      const existing = heldByOwner.get(owner);
      if (existing) {
        existing.refs += 1;
        return;
      }
      const held: Held = { owner, client: randomUUID(), refs: 1 };
      heldByOwner.set(owner, held);
      const run = () => {
        const current = heldByOwner.get(owner);
        if (!current || current.refs <= 0) return;
        return withPlayerLock(owner, () => step(owner, current.client));
      };
      void run();
      held.timer = setInterval(() => {
        void run()?.catch((error: unknown) => {
          console.error('Town clock tick failed:', error instanceof Error ? error.message : error);
        });
      }, TICK_MS);
    },

    stop(owner) {
      const held = heldByOwner.get(owner);
      if (!held) return;
      held.refs -= 1;
      if (held.refs > 0) return;
      if (held.timer) clearInterval(held.timer);
      heldByOwner.delete(owner);
      void withPlayerLock(owner, () => pause(owner, held.client)).catch(() => undefined);
    },

    async release(owner) {
      const held = heldByOwner.get(owner);
      if (!held) return;
      await pause(owner, held.client);
    },

    async resume(owner) {
      const held = heldByOwner.get(owner);
      if (!held || held.refs <= 0) return;
      await step(owner, held.client);
    },
  };
}
