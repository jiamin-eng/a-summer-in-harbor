/**
 * Game action tools for MCP
 * Each tool validates with the game engine and returns outcomes + available next actions
 */

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { Save, Action } from '../../src/story/state';
import { applyAction, availableTopics, items } from '../../src/story/state';
import { rooms, people, entityLabel, tx, type Locale } from '../../src/world/data';
import { worldWithFlags } from '../../src/world/data';
import { presentEntity } from '../../src/world/residents';

export type ToolResult = {
  success: boolean;
  message: string;
  structuredData?: any;
  availableActions?: string[];
  error?: string;
};

/**
 * Get current scene description and available actions
 */
export function observeScene(save: Save, locale: Locale): ToolResult {
  const room = rooms[save.scene];
  
  const availablePeople: string[] = [];
  const availableObjects: string[] = [];
  const availableExits: string[] = [];
  
  for (const entity of room.entities) {
    if (entity.kind === 'person' && entity.person) {
      const isPresent = presentEntity(save, entity);
      if (isPresent) {
        const person = people[entity.person];
        const isKnown = save.known.includes(entity.person);
        availablePeople.push(tx(isKnown ? person.name : person.unknown, locale));
      }
    } else if (entity.kind === 'object') {
      availableObjects.push(tx(entityLabel(entity, save.flags), locale));
    } else if (entity.kind === 'portal') {
      availableExits.push(tx(entity.label, locale));
    }
  }
  
  const isZh = locale === 'zh';
  let message = isZh
    ? `【${tx(room.title, locale)}】\n`
    : `【${tx(room.title, locale)}】\n`;
  
  if (availablePeople.length > 0) {
    message += isZh ? '\n可见的人：\n' : '\nPeople here:\n';
    availablePeople.forEach(p => message += `• ${p}\n`);
  }
  
  if (availableObjects.length > 0) {
    message += isZh ? '\n可互动物品：\n' : '\nInteractive objects:\n';
    availableObjects.forEach(o => message += `• ${o}\n`);
  }
  
  if (availableExits.length > 0) {
    message += isZh ? '\n可前往：\n' : '\nExits:\n';
    availableExits.forEach(e => message += `• ${e}\n`);
  }
  
  const actions: string[] = [];
  if (availablePeople.length > 0) actions.push(isZh ? '与人交谈' : 'Talk to people');
  if (availableObjects.length > 0) actions.push(isZh ? '使用物品' : 'Use objects');
  if (availableExits.length > 0) actions.push(isZh ? '移动到其他地点' : 'Travel to other locations');
  if (save.visited.length > 1) actions.push(isZh ? '快速旅行到已访问地点' : 'Fast travel');
  
  return {
    success: true,
    message: message.trim(),
    structuredData: {
      scene: save.scene,
      sceneTitle: tx(room.title, locale),
      people: availablePeople,
      objects: availableObjects,
      exits: availableExits,
      energy: save.energy,
      cash: save.cash
    },
    availableActions: actions
  };
}

/**
 * Introduce to an unknown person
 */
export function introduce(save: Save, personId: string, locale: Locale): ToolResult {
  const room = rooms[save.scene];
  const entity = room.entities.find(e => e.person === personId);
  
  if (!entity) {
    return {
      success: false,
      error: locale === 'zh' ? '找不到此人' : 'Person not found',
      message: ''
    };
  }
  
  const approachPos = entity.approach || entity.at;
  
  const action: Action = {
    action_id: 'mcp-' + randomBytes(8).toString('hex'),
    expected_version: save.version,
    scene: save.scene,
    position: approachPos,
    target: entity.id,
    action: 'introduce'
  };
  
  try {
    const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
    
    // Update save in place
    Object.assign(save, result.head);
    
    return {
      success: true,
      message: tx(result.text, locale),
      structuredData: {
        person: personId,
        nowKnown: save.known.includes(personId)
      },
      availableActions: [locale === 'zh' ? `与${tx(people[personId].name, locale)}交谈` : `Talk to ${tx(people[personId].name, locale)}`]
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      message: ''
    };
  }
}

/**
 * Talk to a person (with optional topic)
 */
export function talk(save: Save, personId: string, topicId: string | undefined, locale: Locale): ToolResult {
  if (!topicId) {
    // List available topics
    const topics = availableTopics(save, personId);
    const personName = tx(people[personId].name, locale);
    
    const isZh = locale === 'zh';
    let message = isZh ? `【与${personName}的话题】\n` : `【Topics with ${personName}】\n`;
    
    if (topics.length === 0) {
      message += isZh ? '(当前没有可选话题)' : '(No topics available)';
    } else {
      topics.forEach(t => {
        message += `• [${t.id}] ${tx(t.label, locale)}\n`;
      });
    }
    
    return {
      success: true,
      message: message.trim(),
      structuredData: {
        person: personId,
        topics: topics.map(t => ({ id: t.id, label: tx(t.label, locale) }))
      },
      availableActions: topics.length > 0 ? [locale === 'zh' ? '选择话题继续对话' : 'Choose a topic'] : []
    };
  }
  
  // Execute talk action
  const room = rooms[save.scene];
  const entity = room.entities.find(e => e.person === personId);
  
  if (!entity) {
    return {
      success: false,
      error: locale === 'zh' ? '找不到此人' : 'Person not found',
      message: ''
    };
  }
  
  const approachPos = entity.approach || entity.at;
  
  const action: Action = {
    action_id: 'mcp-' + randomBytes(8).toString('hex'),
    expected_version: save.version,
    scene: save.scene,
    position: approachPos,
    target: entity.id,
    action: 'talk:' + topicId
  };
  
  try {
    const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
    
    // Update save in place
    const oldItems = { ...save.items };
    Object.assign(save, result.head);
    
    const nextActions: string[] = [];
    const newTopics = availableTopics(save, personId);
    if (newTopics.length > 0) {
      nextActions.push(locale === 'zh' ? `继续与${tx(people[personId].name, locale)}交谈` : `Continue talking to ${tx(people[personId].name, locale)}`);
    }
    
    return {
      success: true,
      message: tx(result.text, locale),
      structuredData: {
        person: personId,
        topic: topicId,
        itemsReceived: Object.keys(save.items).filter(k => !oldItems[k] || save.items[k] > oldItems[k])
      },
      availableActions: nextActions
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      message: ''
    };
  }
}

/**
 * Travel to another location
 */
export function travel(save: Save, destination: string, locale: Locale): ToolResult {
  const room = rooms[save.scene];
  const portal = room.entities.find(e => e.kind === 'portal' && e.destination === destination);
  
  if (!portal) {
    return {
      success: false,
      error: locale === 'zh' ? '找不到此出口' : 'Exit not found',
      message: ''
    };
  }
  
  const approachPos = portal.approach || portal.at;
  
  const action: Action = {
    action_id: 'mcp-' + randomBytes(8).toString('hex'),
    expected_version: save.version,
    scene: save.scene,
    position: approachPos,
    target: portal.id,
    action: 'travel'
  };
  
  try {
    const oldScene = save.scene;
    const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
    
    // Update save in place
    Object.assign(save, result.head);
    
    return {
      success: true,
      message: tx(result.text, locale),
      structuredData: {
        from: oldScene,
        to: save.scene,
        newLocation: save.scene !== oldScene
      },
      availableActions: [locale === 'zh' ? '观察新场景' : 'Observe new scene']
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      message: ''
    };
  }
}

/**
 * Fast travel to visited location
 */
export function fastTravel(save: Save, destination: string, locale: Locale): ToolResult {
  if (!save.visited.includes(destination)) {
    return {
      success: false,
      error: locale === 'zh' ? '尚未访问过此地点' : 'Location not yet visited',
      message: ''
    };
  }
  
  const action: Action = {
    action_id: 'mcp-' + randomBytes(8).toString('hex'),
    expected_version: save.version,
    scene: save.scene,
    position: { ...save.position },
    target: destination,
    action: 'travel-map'
  };
  
  try {
    const oldScene = save.scene;
    const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
    
    // Update save in place
    Object.assign(save, result.head);
    
    return {
      success: true,
      message: tx(result.text, locale),
      structuredData: {
        from: oldScene,
        to: save.scene
      },
      availableActions: [locale === 'zh' ? '观察场景' : 'Observe scene']
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      message: ''
    };
  }
}

/**
 * Interact with object
 */
export function useObject(save: Save, objectId: string, actionName: string, locale: Locale): ToolResult {
  const room = rooms[save.scene];
  const entity = room.entities.find(e => e.id === objectId);
  
  if (!entity || entity.kind !== 'object') {
    return {
      success: false,
      error: locale === 'zh' ? '找不到此物品' : 'Object not found',
      message: ''
    };
  }
  
  if (!entity.actions?.includes(actionName)) {
    return {
      success: false,
      error: locale === 'zh' ? `动作不可用。可用: ${entity.actions?.join(', ')}` : `Action not available. Available: ${entity.actions?.join(', ')}`,
      message: ''
    };
  }
  
  const approachPos = entity.approach || entity.at;
  
  const action: Action = {
    action_id: 'mcp-' + randomBytes(8).toString('hex'),
    expected_version: save.version,
    scene: save.scene,
    position: approachPos,
    target: entity.id,
    action: actionName
  };
  
  try {
    const oldFlags = [...save.flags];
    const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
    
    // Update save in place
    Object.assign(save, result.head);
    
    return {
      success: true,
      message: tx(result.text, locale),
      structuredData: {
        object: objectId,
        action: actionName,
        flagsAdded: save.flags.filter(f => !oldFlags.includes(f))
      },
      availableActions: []
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      message: ''
    };
  }
}

/**
 * View inventory
 */
export function viewInventory(save: Save, locale: Locale): ToolResult {
  const isZh = locale === 'zh';
  let message = isZh ? '【背包】\n' : '【Inventory】\n';
  
  const itemList: Array<{ id: string; name: string; count: number; description: string }> = [];
  
  for (const [itemId, count] of Object.entries(save.items)) {
    if (items[itemId]) {
      const item = items[itemId];
      message += `• ${tx(item.name, locale)} x${count}\n`;
      itemList.push({
        id: itemId,
        name: tx(item.name, locale),
        count,
        description: tx(item.description, locale)
      });
    }
  }
  
  if (itemList.length === 0) {
    message += isZh ? '(空)' : '(Empty)';
  }
  
  return {
    success: true,
    message: message.trim(),
    structuredData: {
      items: itemList,
      totalCount: Object.values(save.items).reduce((s, n) => s + n, 0)
    },
    availableActions: []
  };
}

/**
 * View player status
 */
export function viewStatus(save: Save, locale: Locale): ToolResult {
  const isZh = locale === 'zh';
  const message = isZh
    ? `【状态】\n精力: ${save.energy}/100\n资金: $${save.cash}\n声望: ${save.standing}\n已认识: ${save.known.length}人\n已访问: ${save.visited.length}个地点`
    : `【Status】\nEnergy: ${save.energy}/100\nMoney: $${save.cash}\nStanding: ${save.standing}\nKnown people: ${save.known.length}\nVisited: ${save.visited.length} places`;
  
  return {
    success: true,
    message,
    structuredData: {
      energy: save.energy,
      cash: save.cash,
      standing: save.standing,
      knownPeople: save.known.length,
      visitedPlaces: save.visited.length
    },
    availableActions: []
  };
}
