import type { Action, Save } from '../../src/story/state.js';
import type { Locale } from '../../src/world/data.js';
import type { TownPresence } from './presence.js';

const ENROLLMENT = 'harbor-mcp-journey';

export interface GameJourneys {
  /** The player's latest game journey, or null when they have not started. */
  peek(owner: string): Promise<Save | null>;
  /** Latest journey, creating the game's single MCP enrollment when none exists. */
  current(owner: string, locale: Locale): Promise<Save>;
  /** Commit one action through the game authority. */
  act(owner: string, journeyId: string, action: Action): Promise<{ head: Save; text: [string, string] }>;
  /** Foreground town clock while an MCP session is connected. */
  presence?: TownPresence;
}

type Authority = {
  directory(owner: string): Promise<Array<{ id: string; updated: number }>>;
  get(owner: string, id: string): Promise<Save>;
  create(owner: string, enrollment: string, locale: Locale): Promise<Save>;
  action(owner: string, id: string, action: Action): Promise<{ head: Save; text: [string, string] }>;
};

export function createGameJourneys(authority: Authority, presence?: TownPresence): GameJourneys {
  async function latest(owner: string): Promise<Save | null> {
    const rows = await authority.directory(owner);
    const row = [...rows].sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))[0];
    return row ? authority.get(owner, row.id) : null;
  }

  return {
    peek: latest,
    async current(owner, locale) {
      return await latest(owner) ?? authority.create(owner, ENROLLMENT, locale);
    },
    async act(owner, journeyId, action) {
      const receipt = await authority.action(owner, journeyId, action);
      return { head: receipt.head, text: receipt.text };
    },
    presence,
  };
}
