/**
 * Game action tools: headless game actions exposed as LLM tool definitions
 * 
 * Every tool validates with the game engine and returns what the player can do next.
 * The LLM never invents things - all possibilities come from the game state.
 */

import type { Save, Action } from '../../src/story/state';
import { availableTopics } from '../../src/story/state';
import { rooms, people, entityLabel, tx } from '../../src/world/data';
import { presentEntity } from '../../src/world/residents';
import { renderState, type SceneDescription } from './state-renderer';

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
};

export type ToolResult = {
  success: boolean;
  message: string;
  newState?: SceneDescription;
  error?: string;
};

/**
 * Get all available tools based on current game state
 */
export function getAvailableTools(save: Save): ToolDefinition[] {
  const locale = save.locale;
  const isZh = locale === 'zh';
  const room = rooms[save.scene];
  const tools: ToolDefinition[] = [];
  
  // Always available: observe/look
  tools.push({
    name: 'observe_scene',
    description: isZh
      ? '观察当前场景，查看周围环境、可互动的人和物品、可前往的地点'
      : 'Observe the current scene, see people, objects, and exits',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  });
  
  // Talk to people
  const knownPeople = room.entities.filter(e => 
    e.kind === 'person' && e.person && save.known.includes(e.person) && presentEntity(save, e)
  );
  
  if (knownPeople.length > 0) {
    const personIds = knownPeople.map(e => e.person!);
    tools.push({
      name: 'talk_to_person',
      description: isZh
        ? '与某人交谈，选择话题或自由对话'
        : 'Talk to someone; choose a topic or have a free conversation',
      parameters: {
        type: 'object',
        properties: {
          person: {
            type: 'string',
            enum: personIds,
            description: isZh ? '要交谈的人' : 'Person to talk to'
          },
          topic: {
            type: 'string',
            description: isZh
              ? '话题ID (可选，留空则为自由对话)'
              : 'Topic ID (optional, leave empty for free dialogue)'
          }
        },
        required: ['person']
      }
    });
  }
  
  // Introduce to unknown people
  const unknownPeople = room.entities.filter(e =>
    e.kind === 'person' && e.person && !save.known.includes(e.person) && presentEntity(save, e)
  );
  
  if (unknownPeople.length > 0) {
    const personIds = unknownPeople.map(e => e.person!);
    tools.push({
      name: 'introduce_to_person',
      description: isZh
        ? '向某人自我介绍，认识新朋友'
        : 'Introduce yourself to someone new',
      parameters: {
        type: 'object',
        properties: {
          person: {
            type: 'string',
            enum: personIds,
            description: isZh ? '要认识的人' : 'Person to meet'
          }
        },
        required: ['person']
      }
    });
  }
  
  // Interact with objects
  const objects = room.entities.filter(e => e.kind === 'object' && (e.actions?.length ?? 0) > 0);
  if (objects.length > 0) {
    tools.push({
      name: 'interact_with_object',
      description: isZh
        ? '与物品互动，如检查、修理、收集等'
        : 'Interact with an object (inspect, repair, collect, etc.)',
      parameters: {
        type: 'object',
        properties: {
          object_id: {
            type: 'string',
            enum: objects.map(e => e.id),
            description: isZh ? '物品ID' : 'Object ID'
          },
          action: {
            type: 'string',
            description: isZh ? '动作 (如 inspect-bridge, repair-bridge)' : 'Action (e.g., inspect-bridge)'
          }
        },
        required: ['object_id', 'action']
      }
    });
  }
  
  // Travel to exits
  const exits = room.entities.filter(e => e.kind === 'portal');
  if (exits.length > 0) {
    const destinations = exits.map(e => e.destination!);
    tools.push({
      name: 'travel_to',
      description: isZh
        ? '前往另一个地点'
        : 'Travel to another location',
      parameters: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            enum: destinations,
            description: isZh ? '目的地' : 'Destination'
          }
        },
        required: ['destination']
      }
    });
  }
  
  // Fast travel (map travel) to visited locations
  if (save.visited.length > 1) {
    const visitedOther = save.visited.filter(s => s !== save.scene);
    if (visitedOther.length > 0) {
      tools.push({
        name: 'fast_travel',
        description: isZh
          ? '快速前往已访问过的地点'
          : 'Fast travel to a previously visited location',
        parameters: {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              enum: visitedOther,
              description: isZh ? '目的地' : 'Destination'
            }
          },
          required: ['destination']
        }
      });
    }
  }
  
  // View inventory
  if (Object.keys(save.items).length > 0) {
    tools.push({
      name: 'view_inventory',
      description: isZh
        ? '查看背包中的所有物品'
        : 'View all items in your inventory',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    });
  }
  
  // View status
  tools.push({
    name: 'view_status',
    description: isZh
      ? '查看详细状态（精力、资金、关系等）'
      : 'View detailed status (energy, money, relationships, etc.)',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  });
  
  // Fishing (if at dock with fishing kit)
  if (save.scene === 'dock' && save.fishingV1?.kit) {
    tools.push({
      name: 'start_fishing',
      description: isZh
        ? '开始钓鱼 (需要在码头且有钓具)'
        : 'Start fishing (requires being at the dock with gear)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    });
  }
  
  // Rest/sleep (if in room with bed)
  const bed = room.entities.find(e => e.id === 'bed' && e.actions?.includes('rest'));
  if (bed) {
    tools.push({
      name: 'rest',
      description: isZh
        ? '在床上休息，恢复体力'
        : 'Rest on the bed to recover energy',
      parameters: {
        type: 'object',
        properties: {
          sleep_until_morning: {
            type: 'boolean',
            description: isZh ? '是否睡到第二天早上' : 'Sleep until next morning'
          }
        },
        required: []
      }
    });
  }
  
  return tools;
}

/**
 * Get available topics for a person
 */
export function getPersonTopics(save: Save, personId: string): Array<{ id: string; label: string }> {
  const topics = availableTopics(save, personId);
  const locale = save.locale;
  
  return topics.map(t => ({
    id: t.id,
    label: tx(t.label, locale)
  }));
}

/**
 * Describe what actions are available on an object
 */
export function describeObjectActions(save: Save, objectId: string): string[] {
  const locale = save.locale;
  const room = rooms[save.scene];
  const obj = room.entities.find(e => e.id === objectId);
  
  if (!obj || obj.kind !== 'object') return [];
  
  return obj.actions || [];
}
