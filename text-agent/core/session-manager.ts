/**
 * Session manager: stores and retrieves player sessions
 * Uses SQLite for persistence
 */

import { openAsyncSqliteAuthorityStore } from '../../vendor/dynamic-runtime/packages/authority-session/async.mjs';
import type { Save } from '../../src/story/state';
import { initial } from '../../src/story/state';
import type { AgentConfig } from './agent-loop';

export type SessionStore = {
  getSave(playerId: string): Promise<Save | null>;
  putSave(playerId: string, save: Save): Promise<void>;
  close(): Promise<void>;
};

/**
 * Create a SQLite-backed session store
 */
export async function createSessionStore(dbPath: string): Promise<SessionStore> {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath);
  
  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS text_agent_sessions (
      player_id TEXT PRIMARY KEY,
      save_data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  
  return {
    async getSave(playerId: string): Promise<Save | null> {
      const row = db.prepare('SELECT save_data FROM text_agent_sessions WHERE player_id = ?').get(playerId) as { save_data: string } | undefined;
      
      if (!row) {
        return null;
      }
      
      try {
        return JSON.parse(row.save_data);
      } catch {
        return null;
      }
    },
    
    async putSave(playerId: string, save: Save): Promise<void> {
      const saveData = JSON.stringify(save);
      const now = Date.now();
      
      db.prepare(`
        INSERT INTO text_agent_sessions (player_id, save_data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET
          save_data = excluded.save_data,
          updated_at = excluded.updated_at
      `).run(playerId, saveData, now);
    },
    
    async close(): Promise<void> {
      db.close();
    }
  };
}

/**
 * Get or create a save for a player
 */
export async function getOrCreateSave(
  store: SessionStore,
  playerId: string,
  locale: 'zh' | 'en' = 'zh'
): Promise<Save> {
  let save = await store.getSave(playerId);
  
  if (!save) {
    // Create new save
    const saveId = `text-agent-${playerId}-${Date.now()}`;
    save = initial(locale, saveId);
    await store.putSave(playerId, save);
  }
  
  return save;
}
