/**
 * State-to-text renderer: produces compact scene/status summaries for the LLM
 */

import type { Save } from '../../src/story/state';
import { rooms, people, entityLabel, tx, type Locale } from '../../src/world/data';
import { items, objective } from '../../src/story/state';
import { presentEntity, townMinutes } from '../../src/world/residents';

export type SceneDescription = {
  locale: Locale;
  scene: string;
  sceneTitle: string;
  objective: string;
  position: { x: number; y: number };
  energy: number;
  cash: number;
  standing: number;
  time: string;
  
  // What the player can interact with
  availablePeople: Array<{ id: string; name: string; knownStatus: 'known' | 'unknown' }>;
  availableObjects: Array<{ id: string; label: string; actions: string[] }>;
  availableExits: Array<{ id: string; destination: string; label: string }>;
  
  // Player status
  itemCount: number;
  keyItems: string[];
  activeChallenge?: { kind: string; description: string };
  
  // Recent history (last 3 entries)
  recentHistory: Array<{ kind: string; person?: string; text: string }>;
};

function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function describeChallenge(save: Save, locale: Locale): string | undefined {
  const c = save.activeChallenge;
  if (!c) return undefined;
  
  if (c.kind === 'fishing') {
    return tx(['钓鱼进行中', 'Fishing in progress'], locale);
  } else if (['sparring', 'footwork', 'endurance'].includes(c.kind)) {
    return tx(['切磋练习进行中', 'Training session in progress'], locale);
  } else if (c.kind === 'repair') {
    return tx(['修理拼图进行中', 'Repair puzzle in progress'], locale);
  } else if (c.kind === 'map') {
    return tx(['地图拼图进行中', 'Map puzzle in progress'], locale);
  }
  return c.kind;
}

/**
 * Render the current game state into a compact text summary for the LLM
 */
export function renderState(save: Save): SceneDescription {
  const locale = save.locale;
  const room = rooms[save.scene];
  
  // Gather available entities
  const availablePeople: SceneDescription['availablePeople'] = [];
  const availableObjects: SceneDescription['availableObjects'] = [];
  const availableExits: SceneDescription['availableExits'] = [];
  
  for (const entity of room.entities) {
    if (entity.kind === 'person' && entity.person) {
      const person = people[entity.person];
      const isKnown = save.known.includes(entity.person);
      const isPresent = presentEntity(save, entity);
      
      if (isPresent) {
        availablePeople.push({
          id: entity.person,
          name: tx(isKnown ? person.name : person.unknown, locale),
          knownStatus: isKnown ? 'known' : 'unknown'
        });
      }
    } else if (entity.kind === 'object') {
      const label = tx(entityLabel(entity, save.flags), locale);
      availableObjects.push({
        id: entity.id,
        label,
        actions: entity.actions || []
      });
    } else if (entity.kind === 'portal') {
      availableExits.push({
        id: entity.id,
        destination: entity.destination!,
        label: tx(entity.label, locale)
      });
    }
  }
  
  // Get key items (not showing all items to keep it compact)
  const keyItemIds = ['key', 'toolkit', 'toolbag', 'wood', 'fish', 'photo', 'route'];
  const keyItems = keyItemIds.filter(id => save.items[id]).map(id => tx(items[id].name, locale));
  
  // Recent history (last 3)
  const recentHistory = save.history.slice(-3).map(entry => ({
    kind: entry.kind,
    person: entry.person,
    text: tx(entry.text, locale)
  }));
  
  const activeChallenge = save.activeChallenge ? {
    kind: save.activeChallenge.kind,
    description: describeChallenge(save, locale) || save.activeChallenge.kind
  } : undefined;
  
  return {
    locale,
    scene: save.scene,
    sceneTitle: tx(room.title, locale),
    objective: tx(objective(save), locale),
    position: save.position,
    energy: save.energy,
    cash: save.cash,
    standing: save.standing,
    time: formatTime(save.townMinutes ?? 540),
    availablePeople,
    availableObjects,
    availableExits,
    itemCount: Object.values(save.items).reduce((sum, n) => sum + n, 0),
    keyItems,
    activeChallenge,
    recentHistory
  };
}

/**
 * Format the scene description as a compact prompt for the LLM
 */
export function formatPrompt(desc: SceneDescription): string {
  const locale = desc.locale;
  const isZh = locale === 'zh';
  
  let prompt = isZh
    ? `【当前场景】${desc.sceneTitle}\n【当前目标】${desc.objective}\n【时间】${desc.time} | 【精力】${desc.energy}/100 | 【资金】$${desc.cash}\n\n`
    : `【Current Scene】${desc.sceneTitle}\n【Current Objective】${desc.objective}\n【Time】${desc.time} | 【Energy】${desc.energy}/100 | 【Money】$${desc.cash}\n\n`;
  
  if (desc.activeChallenge) {
    prompt += isZh
      ? `⚠ ${desc.activeChallenge.description}\n\n`
      : `⚠ ${desc.activeChallenge.description}\n\n`;
  }
  
  if (desc.availablePeople.length > 0) {
    prompt += isZh ? '【可交谈的人】\n' : '【People Here】\n';
    desc.availablePeople.forEach(p => {
      prompt += `• ${p.name}${p.knownStatus === 'unknown' ? (isZh ? ' (尚未认识)' : ' (not introduced)') : ''}\n`;
    });
    prompt += '\n';
  }
  
  if (desc.availableObjects.length > 0) {
    prompt += isZh ? '【可互动物品】\n' : '【Interactive Objects】\n';
    desc.availableObjects.forEach(obj => {
      prompt += `• ${obj.label}\n`;
    });
    prompt += '\n';
  }
  
  if (desc.availableExits.length > 0) {
    prompt += isZh ? '【可前往地点】\n' : '【Available Exits】\n';
    desc.availableExits.forEach(exit => {
      prompt += `• ${exit.label}\n`;
    });
    prompt += '\n';
  }
  
  if (desc.keyItems.length > 0) {
    const items = desc.keyItems.join(', ');
    prompt += isZh ? `【关键物品】${items}\n\n` : `【Key Items】${items}\n\n`;
  }
  
  if (desc.recentHistory.length > 0) {
    prompt += isZh ? '【最近行动】\n' : '【Recent Actions】\n';
    desc.recentHistory.forEach(h => {
      if (h.kind === 'talk' && h.person) {
        prompt += `• [${h.person}] ${h.text.slice(0, 80)}${h.text.length > 80 ? '...' : ''}\n`;
      } else {
        prompt += `• ${h.text.slice(0, 80)}${h.text.length > 80 ? '...' : ''}\n`;
      }
    });
  }
  
  return prompt.trim();
}
