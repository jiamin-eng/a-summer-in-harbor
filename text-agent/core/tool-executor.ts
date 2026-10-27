/**
 * Tool executor: applies LLM tool calls to the game engine
 */

import { randomBytes } from 'node:crypto';
import type { Save, Action } from '../../src/story/state';
import { items, availableTopics, applyAction } from '../../src/story/state';
import { rooms, people, tx } from '../../src/world/data';
import { renderState, formatPrompt, type SceneDescription } from './state-renderer';
import { getPersonTopics, describeObjectActions } from './game-tools';
import { worldWithFlags } from '../../src/world/data';

export type ToolCall = {
  tool: string;
  arguments: Record<string, any>;
};

export type ToolExecutionResult = {
  success: boolean;
  message: string;
  stateSnapshot?: SceneDescription;
  error?: string;
  metadata?: {
    topics?: Array<{ id: string; label: string }>;
    actions?: string[];
    inventory?: Record<string, { name: string; count: number }>;
  };
};

/**
 * Execute a tool call against the game state
 * Returns the result and optionally a new state snapshot
 */
export async function executeTool(
  save: Save,
  toolCall: ToolCall,
  dialogueResolver?: (s: Save, a: Action, owner: string) => Promise<{ topic: string | null; reply: string[] }>
): Promise<{ result: ToolExecutionResult; newSave: Save }> {
  const locale = save.locale;
  const isZh = locale === 'zh';
  
  try {
    const { tool, arguments: args } = toolCall;
    
    // Handle non-action tools (queries)
    if (tool === 'observe_scene') {
      const desc = renderState(save);
      return {
        result: {
          success: true,
          message: formatPrompt(desc),
          stateSnapshot: desc
        },
        newSave: save
      };
    }
    
    if (tool === 'view_inventory') {
      const inventory: Record<string, { name: string; count: number }> = {};
      for (const [itemId, count] of Object.entries(save.items)) {
        if (items[itemId]) {
          inventory[itemId] = {
            name: tx(items[itemId].name, locale),
            count
          };
        }
      }
      
      let message = isZh ? '【背包物品】\n' : '【Inventory】\n';
      for (const [id, info] of Object.entries(inventory)) {
        message += `• ${info.name} x${info.count}\n`;
      }
      
      return {
        result: {
          success: true,
          message: message.trim(),
          metadata: { inventory }
        },
        newSave: save
      };
    }
    
    if (tool === 'view_status') {
      const message = isZh
        ? `【详细状态】\n精力: ${save.energy}/100\n资金: $${save.cash}\n声望: ${save.standing}\n物品数量: ${Object.values(save.items).reduce((s, n) => s + n, 0)}\n已认识: ${save.known.length}人\n已访问: ${save.visited.length}个地点`
        : `【Status】\nEnergy: ${save.energy}/100\nMoney: $${save.cash}\nStanding: ${save.standing}\nItems: ${Object.values(save.items).reduce((s, n) => s + n, 0)}\nKnown people: ${save.known.length}\nVisited places: ${save.visited.length}`;
      
      return {
        result: {
          success: true,
          message
        },
        newSave: save
      };
    }
    
    // For talk_to_person, check if we need to list topics
    if (tool === 'talk_to_person') {
      const personId = args.person as string;
      const topicId = args.topic as string | undefined;
      
      if (!topicId) {
        // List available topics
        const topics = getPersonTopics(save, personId);
        const personName = tx(people[personId].name, locale);
        
        let message = isZh
          ? `【与${personName}的话题】\n`
          : `【Topics with ${personName}】\n`;
        
        if (topics.length === 0) {
          message += isZh
            ? '(没有可选话题，但可以自由对话)'
            : '(No structured topics available, but you can chat freely)';
        } else {
          topics.forEach(t => {
            message += `• [${t.id}] ${t.label}\n`;
          });
        }
        
        return {
          result: {
            success: true,
            message: message.trim(),
            metadata: { topics }
          },
          newSave: save
        };
      }
      
      // Execute the talk action
      const room = rooms[save.scene];
      const entity = room.entities.find(e => e.person === personId);
      if (!entity) {
        throw new Error(isZh ? '找不到此人' : 'Person not found');
      }
      
      // Use the entity's approach position
      const approachPos = entity.approach || entity.at;
      
      const action: Action = {
        action_id: 'text-agent-' + randomBytes(8).toString('hex'),
        expected_version: save.version,
        scene: save.scene,
        position: approachPos,
        target: entity.id,
        action: 'talk:' + topicId
      };
      
      const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
      const newSave = result.head;
      
      return {
        result: {
          success: true,
          message: tx(result.text, locale),
          stateSnapshot: renderState(newSave)
        },
        newSave
      };
    }
    
    // Introduce to person
    if (tool === 'introduce_to_person') {
      const personId = args.person as string;
      const room = rooms[save.scene];
      const entity = room.entities.find(e => e.person === personId);
      
      if (!entity) {
        throw new Error(isZh ? '找不到此人' : 'Person not found');
      }
      
      // Use the entity's approach position for validation
      const approachPos = entity.approach || entity.at;
      
      const action: Action = {
        action_id: 'text-agent-' + randomBytes(8).toString('hex'),
        expected_version: save.version,
        scene: save.scene,
        position: approachPos,
        target: entity.id,
        action: 'introduce'
      };
      
      const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
      const newSave = result.head;
      
      return {
        result: {
          success: true,
          message: tx(result.text, locale),
          stateSnapshot: renderState(newSave)
        },
        newSave
      };
    }
    
    // Interact with object
    if (tool === 'interact_with_object') {
      const objectId = args.object_id as string;
      const actionName = args.action as string;
      
      const room = rooms[save.scene];
      const entity = room.entities.find(e => e.id === objectId);
      
      if (!entity || entity.kind !== 'object') {
        throw new Error(isZh ? '找不到此物品' : 'Object not found');
      }
      
      if (!entity.actions?.includes(actionName)) {
        const available = describeObjectActions(save, objectId);
        throw new Error(
          isZh
            ? `动作不可用。可用动作: ${available.join(', ')}`
            : `Action not available. Available: ${available.join(', ')}`
        );
      }
      
      // Use the entity's approach position
      const approachPos = entity.approach || entity.at;
      
      const action: Action = {
        action_id: 'text-agent-' + randomBytes(8).toString('hex'),
        expected_version: save.version,
        scene: save.scene,
        position: approachPos,
        target: entity.id,
        action: actionName
      };
      
      const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
      const newSave = result.head;
      
      return {
        result: {
          success: true,
          message: tx(result.text, locale),
          stateSnapshot: renderState(newSave)
        },
        newSave
      };
    }
    
    // Travel to location
    if (tool === 'travel_to') {
      const destination = args.destination as string;
      const room = rooms[save.scene];
      const portal = room.entities.find(e => e.kind === 'portal' && e.destination === destination);
      
      if (!portal) {
        throw new Error(isZh ? '找不到此出口' : 'Exit not found');
      }
      
      // Use the portal's approach position
      const approachPos = portal.approach || portal.at;
      
      const action: Action = {
        action_id: 'text-agent-' + randomBytes(8).toString('hex'),
        expected_version: save.version,
        scene: save.scene,
        position: approachPos,
        target: portal.id,
        action: 'travel'
      };
      
      const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
      const newSave = result.head;
      
      return {
        result: {
          success: true,
          message: tx(result.text, locale),
          stateSnapshot: renderState(newSave)
        },
        newSave
      };
    }
    
    // Fast travel (map travel)
    if (tool === 'fast_travel') {
      const destination = args.destination as string;
      
      if (!save.visited.includes(destination)) {
        const errorMsg = isZh ? '你还没有访问过这个地点' : 'You haven\'t visited this location yet';
        throw new Error(errorMsg);
      }
      
      const action: Action = {
        action_id: 'text-agent-' + randomBytes(8).toString('hex'),
        expected_version: save.version,
        scene: save.scene,
        position: { ...save.position },
        target: destination,
        action: 'travel-map'
      };
      
      const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
      const newSave = result.head;
      
      return {
        result: {
          success: true,
          message: tx(result.text, locale),
          stateSnapshot: renderState(newSave)
        },
        newSave
      };
    }
    
    // Rest
    if (tool === 'rest') {
      const sleepUntilMorning = args.sleep_until_morning as boolean | undefined;
      const actionName = sleepUntilMorning ? 'sleep' : 'rest';
      
      const room = rooms[save.scene];
      const bed = room.entities.find(e => e.id === 'bed');
      
      if (!bed) {
        throw new Error(isZh ? '这里没有床' : 'No bed here');
      }
      
      const action: Action = {
        action_id: 'text-agent-' + randomBytes(8).toString('hex'),
        expected_version: save.version,
        scene: save.scene,
        position: { ...save.position },
        target: bed.id,
        action: actionName
      };
      
      const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
      const newSave = result.head;
      
      return {
        result: {
          success: true,
          message: tx(result.text, locale),
          stateSnapshot: renderState(newSave)
        },
        newSave
      };
    }
    
    throw new Error(isZh ? '未知工具: ' + tool : 'Unknown tool: ' + tool);
    
  } catch (err: any) {
    return {
      result: {
        success: false,
        message: '',
        error: err.message || String(err)
      },
      newSave: save
    };
  }
}
