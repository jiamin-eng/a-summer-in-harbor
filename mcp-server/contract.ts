/**
 * What a game fills in so MCP can host it.
 * MCP prints these results. It does not read a save's fields.
 * Replace src/story/mcp-game.ts to host another game; the MCP server stays as it is.
 */

export type GameChoice = {
  label: string;
  action: string;
  target: string;
  /** Extra text inside the act call, after action and target. */
  input?: string;
};

/** One moment in play: what happened, the task, and the choices the game currently offers. */
export type GameMoment = {
  text: string;
  task: string;
  taskChanged: boolean;
  notes: string[];
  choices: GameChoice[];
  data?: Record<string, unknown>;
};

/** A labeled list, such as status or inventory. The game chooses the lines. */
export type GameSheet = {
  title: string;
  lines: string[];
  data?: Record<string, unknown>;
};

export interface GameApi<State> {
  create(locale: string, id: string): State;
  look(state: State, locale: string): GameMoment;
  act(state: State, action: string, target: string, locale: string, input?: unknown): Promise<GameMoment | { error: string }>;
  inventory(state: State, locale: string): GameSheet;
  status(state: State, locale: string): GameSheet;
  introduction(locale: string): string;
  map(locale: string): string;
  characters(locale: string): string;
  guide(locale: string): string;
  context(state: State, locale: string): string;
  /** Description and extra act parameters this game needs, besides action and target. */
  actInput(): { description: string; properties: Record<string, unknown> };
}
