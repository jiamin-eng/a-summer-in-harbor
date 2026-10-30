/**
 * Turns a game's contract results into MCP tool results.
 * The game's fields and rules live in src/story/mcp-game.ts.
 */

import type { GameMoment, GameSheet } from '../contract';
import { game } from '../../src/story/mcp-game.js';

type State = Parameters<typeof game.look>[0];

export type ToolResult = {
  success: boolean;
  message: string;
  structuredData?: Record<string, unknown>;
  availableActions?: string[];
  error?: string;
};

function callOf(choice: GameMoment['choices'][number], locale: string): string {
  const call = `act action=${choice.action} target=${choice.target}${choice.input ? ' ' + choice.input : ''}`;
  return locale === 'zh' ? `（${call}）` : ` (${call})`;
}

function fromMoment(moment: GameMoment, locale: string): ToolResult {
  const choices = moment.choices.map((choice) => `• ${choice.label}${callOf(choice, locale)}`).join('\n');
  const notes = moment.notes.flatMap((note) => ['', note]);
  return {
    success: true,
    message: [moment.text.trim(), '', moment.task, ...notes, '', choices].join('\n').trim(),
    availableActions: moment.choices.map((choice) => choice.label),
    structuredData: {
      ...moment.data,
      quest: moment.task,
      questChanged: moment.taskChanged,
      choices: moment.choices.map((choice) => ({ ...choice, call: `act action=${choice.action} target=${choice.target}${choice.input ? ' ' + choice.input : ''}` })),
    },
  };
}

function fromSheet(sheet: GameSheet): ToolResult {
  return {
    success: true,
    message: [`【${sheet.title}】`, ...sheet.lines].join('\n').trim(),
    structuredData: sheet.data,
    availableActions: [],
  };
}

export function observeScene(state: State, locale: string): ToolResult {
  return fromMoment(game.look(state, locale), locale);
}

export async function act(state: State, action: string, target: string, locale: string, input?: unknown): Promise<ToolResult> {
  const result = await game.act(state, action, target, locale, input);
  if ('error' in result) return { success: false, error: result.error, message: '' };
  return fromMoment(result, locale);
}

export function viewInventory(state: State, locale: string): ToolResult {
  return fromSheet(game.inventory(state, locale));
}

export function viewStatus(state: State, locale: string): ToolResult {
  return fromSheet(game.status(state, locale));
}
