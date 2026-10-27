/**
 * State store interface - pluggable persistence for game saves
 * External services can implement this interface to provide their own persistence
 */

import type { Save } from '../../src/story/state';

export interface StateStore {
  /**
   * Load game state for a player/session
   * Returns null if no save exists
   */
  load(sessionId: string): Promise<Save | null>;
  
  /**
   * Save game state for a player/session
   */
  save(sessionId: string, state: Save): Promise<void>;
  
  /**
   * Export state as JSON (for external backup/migration)
   */
  export(sessionId: string): Promise<string | null>;
  
  /**
   * Import state from JSON
   */
  import(sessionId: string, json: string): Promise<void>;
  
  /**
   * List all session IDs (optional, for admin)
   */
  list?(): Promise<string[]>;
  
  /**
   * Delete a session (optional)
   */
  delete?(sessionId: string): Promise<void>;
}

/**
 * In-memory state store - default implementation
 * External services should replace this with their own persistence
 */
export class InMemoryStateStore implements StateStore {
  private states = new Map<string, Save>();
  
  async load(sessionId: string): Promise<Save | null> {
    return this.states.get(sessionId) || null;
  }
  
  async save(sessionId: string, state: Save): Promise<void> {
    // Deep clone to avoid mutation
    this.states.set(sessionId, JSON.parse(JSON.stringify(state)));
  }
  
  async export(sessionId: string): Promise<string | null> {
    const state = this.states.get(sessionId);
    return state ? JSON.stringify(state) : null;
  }
  
  async import(sessionId: string, json: string): Promise<void> {
    const state = JSON.parse(json);
    this.states.set(sessionId, state);
  }
  
  async list(): Promise<string[]> {
    return Array.from(this.states.keys());
  }
  
  async delete(sessionId: string): Promise<void> {
    this.states.delete(sessionId);
  }
}
