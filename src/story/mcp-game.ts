/**
 * Harbor's answers to the MCP contract.
 * Another game replaces this file. The MCP server calls GameApi and does not change.
 */
import { randomBytes } from 'node:crypto';
import type { GameApi, GameChoice, GameMoment, GameSheet } from '../../mcp-server/contract';
import { performAction } from '../../mcp-server/tools/perform.js';
import { shoreErrors } from '../ui/ShoreFishingAccess';
import { cartridge } from './cartridge';
import { plotIds } from './crops';
import { description } from './descriptions';
import { fatigueLabel } from './fatigue';
import { prepareOfferedAction, sceneOffers, type OfferedAction } from './player-actions';
import { initial, items, objective, type Action, type Save } from './state';
import { people, rooms, tx, type Locale, type Words } from '../world/data';
import { presentEntity, townTimeLabel } from '../world/residents';

function localeOf(locale: string): Locale {
  return locale === 'en' ? 'en' : 'zh';
}

function taskLine(before: Save | null, after: Save, locale: Locale): string {
  const next = tx(objective(after), locale);
  if (before && tx(objective(before), locale) !== next) {
    return locale === 'zh' ? `新的任务：${next}` : `New task: ${next}`;
  }
  return locale === 'zh' ? `当前任务：${next}` : `Current task: ${next}`;
}

function choiceOf(choice: OfferedAction, locale: Locale): GameChoice {
  let input: string | undefined;
  if (choice.needsHookTick) input = 'hookTick=<拍数>';
  else if (choice.passHookTick === null) input = 'hookTick=null';
  return { label: tx(choice.label, locale), action: choice.action, target: choice.target, input };
}

function growingHere(save: Save, id: string): boolean {
  if (id === 'growing-fern' || id === 'crop-counter' || id === 'gate-hours') return true;
  return plotIds.includes(id) && save.plots?.[id] !== undefined;
}

/** Sentences the page already shows for anything in this room that waits on town time. */
function timeNotes(save: Save, locale: Locale): string[] {
  const room = rooms[save.scene];
  if (!room) return [];
  const lines: string[] = [];
  for (const entity of room.entities) {
    if (!presentEntity(save, entity) || !growingHere(save, entity.id)) continue;
    lines.push(tx(description(save, entity), locale));
  }
  return lines;
}

function moment(save: Save, locale: Locale, before: Save | null, text: string): GameMoment {
  const offers = sceneOffers(save);
  const clock = tx(townTimeLabel(save), locale);
  return {
    text: `${text}\n${clock}`,
    task: taskLine(before, save, locale),
    taskChanged: before ? tx(objective(before), locale) !== tx(objective(save), locale) : false,
    notes: [...timeNotes(save, locale), ...offers.notes.map((note) => tx(note, locale))],
    choices: offers.actions.map((choice) => choiceOf(choice, locale)),
  };
}

function explain(err: unknown, locale: Locale): string {
  const error = err as { message?: string; words?: Words };
  const words = error.words ?? (error.message ? shoreErrors[error.message] : undefined);
  if (words) return tx(words, locale);
  return error.message ?? (locale === 'zh' ? '这个动作没有完成' : 'That action did not complete');
}

function headline(save: Save, locale: Locale): string {
  const room = rooms[save.scene];
  const title = tx(room.title, locale);
  const stats = cartridge(locale).statDefinitions;
  const energy = stats.find((stat) => stat.id === 'energy');
  const cash = stats.find((stat) => stat.id === 'cash');
  return `【${title}】${energy?.label ?? ''} ${save.energy}，${cash?.label ?? ''} ${cash?.unit ?? ''}${save.cash}`;
}

export const game: GameApi<Save> = {
  create(locale, id) {
    return initial(localeOf(locale), id);
  },

  look(save, locale) {
    const lang = localeOf(locale);
    const view = moment(save, lang, null, headline(save, lang));
    view.data = { scene: save.scene, sceneTitle: tx(rooms[save.scene].title, lang), clock: tx(townTimeLabel(save), lang), energy: save.energy, cash: save.cash };
    return view;
  },

  async act(save, actionName, target, locale, input) {
    const lang = localeOf(locale);
    const record = input && typeof input === 'object' ? input as { hookTick?: number | null } : {};
    const hookTick = input && typeof input === 'object' && 'hookTick' in (input as object) ? record.hookTick : undefined;
    let offered: OfferedAction;
    try {
      offered = prepareOfferedAction(save, actionName, target, hookTick);
    } catch (err) {
      return { error: explain(err, lang) };
    }
    const action: Action = {
      action_id: 'mcp-' + randomBytes(8).toString('hex'),
      expected_version: save.version,
      scene: save.scene,
      position: offered.position,
      target: offered.target,
      action: offered.action,
      ...(offered.payload === undefined ? {} : { payload: offered.payload }),
    };
    try {
      const before = structuredClone(save);
      const result = await performAction(save, action);
      Object.assign(save, result.head);
      return moment(save, lang, before, tx(result.text, lang));
    } catch (err) {
      return { error: explain(err, lang) };
    }
  },

  inventory(save, locale) {
    const lang = localeOf(locale);
    const lines: string[] = [];
    const itemList: Array<{ id: string; name: string; count: number; description: string }> = [];
    for (const [itemId, count] of Object.entries(save.items)) {
      const item = items[itemId];
      if (!item) continue;
      lines.push(`• ${tx(item.name, lang)} x${count}`);
      itemList.push({ id: itemId, name: tx(item.name, lang), count, description: tx(item.description, lang) });
    }
    if (!lines.length) lines.push(lang === 'zh' ? '(空)' : '(Empty)');
    return {
      title: lang === 'zh' ? '背包' : 'Inventory',
      lines,
      data: { items: itemList, totalCount: Object.values(save.items).reduce((sum, count) => sum + count, 0) },
    } satisfies GameSheet;
  },

  status(save, locale) {
    const lang = localeOf(locale);
    const values: Record<string, number> = { energy: save.energy, cash: save.cash, standing: save.standing };
    const lines = [tx(townTimeLabel(save), lang)];
    lines.push(...cartridge(lang).statDefinitions.map((stat) => {
      const value = values[stat.id] ?? 0;
      const shown = stat.display === 'bar' ? `${value}/${stat.max}` : `${stat.unit ?? ''}${value}`;
      return `${stat.label}: ${shown}`;
    }));
    lines.push(tx(fatigueLabel(save), lang));
    lines.push(lang === 'zh' ? `已认识: ${save.known.length}人` : `Known people: ${save.known.length}`);
    lines.push(lang === 'zh' ? `已访问: ${save.visited.length}个地点` : `Visited: ${save.visited.length} places`);
    return {
      title: lang === 'zh' ? '状态' : 'Status',
      lines,
      data: {
        energy: save.energy,
        cash: save.cash,
        standing: save.standing,
        knownPeople: save.known.length,
        visitedPlaces: save.visited.length,
      },
    };
  },

  introduction(locale) {
    const book = cartridge(localeOf(locale));
    const arrival = book.opening.blocks.map((block) => block.text).join('\n\n');
    return [`# ${book.copy.title}`, book.copy.subtitle, book.copy.promise, arrival].join('\n\n');
  },

  map(locale) {
    const lang = localeOf(locale);
    const areas: Record<string, string[]> = {};
    for (const [id, room] of Object.entries(rooms)) {
      if (!areas[room.area]) areas[room.area] = [];
      areas[room.area].push(id);
    }
    const blocks = Object.entries(areas).map(([area, roomIds]) => {
      const heading = `## ${tx(rooms[area].title, lang)}`;
      const rows = roomIds.filter((id) => id !== area).map((id) => `- ${tx(rooms[id].title, lang)}`);
      return [heading, ...rows].join('\n');
    });
    const title = lang === 'zh' ? '# 世界地图' : '# World Map';
    return [title, ...blocks].join('\n\n').trim();
  },

  characters(locale) {
    const lang = localeOf(locale);
    const title = lang === 'zh' ? '# 角色列表' : '# Characters';
    const blocks = Object.values(people).map((person) => `## ${tx(person.name, lang)}\n${tx(person.intro, lang)}`);
    return [title, ...blocks].join('\n\n').trim();
  },

  guide(locale) {
    const book = cartridge(localeOf(locale));
    const stats = book.statDefinitions.map((stat) => `- **${stat.label}**: ${stat.description}`).join('\n');
    const rules = book.director?.fixedWorldRules.map((rule) => `- ${rule}`).join('\n') ?? '';
    return [`# ${book.copy.title}`, book.opening.objective, stats, rules].filter(Boolean).join('\n\n');
  },

  context(save, locale) {
    const lang = localeOf(locale);
    const scene = rooms[save.scene];
    const title = scene ? tx(scene.title, lang) : save.scene;
    const goal = tx(objective(save), lang);
    const known = save.known.length ? save.known.join(', ') : (lang === 'zh' ? '无' : 'none');
    const entries = Object.entries(save.items);
    const itemText = entries.length ? entries.map(([id, count]) => `${id}×${count}`).join(', ') : (lang === 'zh' ? '空' : 'empty');
    const stats = cartridge(lang).statDefinitions;
    const energy = stats.find((stat) => stat.id === 'energy');
    const cash = stats.find((stat) => stat.id === 'cash');
    if (lang === 'zh') {
      return [
        '## 当前玩家上下文',
        `玩家: ${save.id}`,
        `地点: ${title} (${save.scene})`,
        `时间: ${tx(townTimeLabel(save), lang)}`,
        `当前目标: ${goal}`,
        `已认识: ${known}`,
        `物品: ${itemText}`,
        `${energy?.label ?? ''}: ${save.energy}，${cash?.label ?? ''}: ${cash?.unit ?? ''}${save.cash}`,
        '只叙述这位玩家的存档。不要引用其他玩家的地点、物品或对话。',
      ].join('\n');
    }
    return [
      '## Current player context',
      `Player: ${save.id}`,
      `Location: ${title} (${save.scene})`,
      `Time: ${tx(townTimeLabel(save), lang)}`,
      `Objective: ${goal}`,
      `Known people: ${known}`,
      `Items: ${itemText}`,
      `${energy?.label ?? ''}: ${save.energy}, ${cash?.label ?? ''}: ${cash?.unit ?? ''}${save.cash}`,
      "Narrate only this player's save. Do not refer to another player's location, items, or dialogue.",
    ].join('\n');
  },

  actInput() {
    return {
      description: '提交游戏此刻列出的一个动作。action 和 target 用观察结果括号里的原文，不要改写。',
      properties: {
        hookTick: { type: ['number', 'null'], description: '只在钓鱼提竿时传。拍数用抛竿结果里的下沉拍。错过咬钩时传 null。其他动作不要传。' },
      },
    };
  },
};
