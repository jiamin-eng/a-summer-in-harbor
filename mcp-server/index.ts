/**
 * Main MCP Server for A Summer in Harbor
 * Provides game tools, resources, and prompts via MCP protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { StateStore, InMemoryStateStore } from './state/store.js';
import { initial } from '../src/story/state.js';
import type { Locale } from '../src/world/data.js';
import * as gameActions from './tools/game-actions.js';
import * as gameContent from './resources/game-content.js';
import * as narrator from './prompts/narrator.js';

export interface ServerConfig {
  stateStore?: StateStore;
  defaultLocale?: Locale;
}

export function createMCPServer(config: ServerConfig = {}) {
  const stateStore = config.stateStore || new InMemoryStateStore();
  const defaultLocale: Locale = config.defaultLocale || 'zh';
  
  const server = new Server(
    {
      name: 'a-summer-in-harbor',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );
  
  // Helper to get or create game state
  async function getOrCreateState(sessionId: string, locale: Locale) {
    let state = await stateStore.load(sessionId);
    if (!state) {
      const saveId = `${sessionId}-${Date.now()}`;
      state = initial(locale, saveId);
      await stateStore.save(sessionId, state);
    }
    return state;
  }
  
  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'observe_scene',
          description: 'Observe current scene: people, objects, exits, and available actions',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'introduce',
          description: 'Introduce yourself to an unknown person',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              personId: { type: 'string', description: 'Person identifier (e.g., mara, theo)' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId', 'personId']
          }
        },
        {
          name: 'talk',
          description: 'Talk to a known person. If topicId is omitted, lists available topics.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              personId: { type: 'string', description: 'Person identifier' },
              topicId: { type: 'string', description: 'Topic identifier (optional)' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId', 'personId']
          }
        },
        {
          name: 'travel',
          description: 'Travel to an adjacent location',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              destination: { type: 'string', description: 'Destination scene ID' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId', 'destination']
          }
        },
        {
          name: 'fast_travel',
          description: 'Fast travel to a previously visited location',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              destination: { type: 'string', description: 'Destination scene ID' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId', 'destination']
          }
        },
        {
          name: 'use_object',
          description: 'Interact with an object in the scene',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              objectId: { type: 'string', description: 'Object identifier' },
              action: { type: 'string', description: 'Action to perform' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId', 'objectId', 'action']
          }
        },
        {
          name: 'view_inventory',
          description: 'View items in inventory',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'view_status',
          description: 'View player status (energy, money, relationships, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'export_state',
          description: 'Export current game state as JSON (for backup/migration)',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'import_state',
          description: 'Import game state from JSON',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              stateJson: { type: 'string', description: 'JSON string of game state' }
            },
            required: ['sessionId', 'stateJson']
          }
        }
      ]
    };
  });
  
  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      const sessionId = (args as any).sessionId as string;
      const locale = ((args as any).locale as Locale) || defaultLocale;
      
      if (!sessionId) {
        throw new Error('sessionId is required');
      }
      
      // Handle export/import separately (no game state modification)
      if (name === 'export_state') {
        const json = await stateStore.export(sessionId);
        return {
          content: [
            {
              type: 'text',
              text: json || 'No state found for this session'
            }
          ]
        };
      }
      
      if (name === 'import_state') {
        const stateJson = (args as any).stateJson as string;
        await stateStore.import(sessionId, stateJson);
        return {
          content: [
            {
              type: 'text',
              text: locale === 'zh' ? '状态已导入' : 'State imported successfully'
            }
          ]
        };
      }
      
      // Get current state
      const state = await getOrCreateState(sessionId, locale);
      
      let result: gameActions.ToolResult;
      
      switch (name) {
        case 'observe_scene':
          result = gameActions.observeScene(state, locale);
          break;
          
        case 'introduce':
          result = gameActions.introduce(state, (args as any).personId, locale);
          if (result.success) {
            await stateStore.save(sessionId, state);
          }
          break;
          
        case 'talk':
          result = gameActions.talk(state, (args as any).personId, (args as any).topicId, locale);
          if (result.success && (args as any).topicId) {
            await stateStore.save(sessionId, state);
          }
          break;
          
        case 'travel':
          result = gameActions.travel(state, (args as any).destination, locale);
          if (result.success) {
            await stateStore.save(sessionId, state);
          }
          break;
          
        case 'fast_travel':
          result = gameActions.fastTravel(state, (args as any).destination, locale);
          if (result.success) {
            await stateStore.save(sessionId, state);
          }
          break;
          
        case 'use_object':
          result = gameActions.useObject(state, (args as any).objectId, (args as any).action, locale);
          if (result.success) {
            await stateStore.save(sessionId, state);
          }
          break;
          
        case 'view_inventory':
          result = gameActions.viewInventory(state, locale);
          break;
          
        case 'view_status':
          result = gameActions.viewStatus(state, locale);
          break;
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error}`
            }
          ],
          isError: true
        };
      }
      
      // Return result with structured data
      const responseText = result.message + 
        (result.availableActions && result.availableActions.length > 0 
          ? `\n\n${locale === 'zh' ? '可用行动' : 'Available actions'}: ${result.availableActions.join(', ')}`
          : '');
      
      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ],
        ...(result.structuredData && {
          _meta: result.structuredData
        })
      };
      
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });
  
  // List resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'harbor://game/introduction',
          mimeType: 'text/markdown',
          name: 'Game Introduction',
          description: 'Introduction to A Summer in Harbor'
        },
        {
          uri: 'harbor://game/map',
          mimeType: 'text/markdown',
          name: 'World Map',
          description: 'Map of all locations'
        },
        {
          uri: 'harbor://game/characters',
          mimeType: 'text/markdown',
          name: 'Characters',
          description: 'List of all characters'
        },
        {
          uri: 'harbor://game/howtoplay',
          mimeType: 'text/markdown',
          name: 'How to Play',
          description: 'Game rules and mechanics'
        },
        {
          uri: 'harbor://session/{sessionId}/state',
          mimeType: 'application/json',
          name: 'Current Game State',
          description: 'Current state snapshot for a session'
        }
      ]
    };
  });
  
  // Read resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const locale = defaultLocale; // Could be extracted from URI parameters
    
    if (uri === 'harbor://game/introduction') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: gameContent.getGameIntroduction(locale)
          }
        ]
      };
    }
    
    if (uri === 'harbor://game/map') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: gameContent.getWorldMap(locale)
          }
        ]
      };
    }
    
    if (uri === 'harbor://game/characters') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: gameContent.getCharacters(locale)
          }
        ]
      };
    }
    
    if (uri === 'harbor://game/howtoplay') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: gameContent.getHowToPlay(locale)
          }
        ]
      };
    }
    
    if (uri.startsWith('harbor://session/') && uri.endsWith('/state')) {
      const sessionId = uri.split('/')[3];
      const state = await stateStore.load(sessionId);
      
      if (!state) {
        throw new Error('Session not found');
      }
      
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(state, null, 2)
          }
        ]
      };
    }
    
    throw new Error(`Unknown resource: ${uri}`);
  });
  
  // List prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'narrator',
          description: 'System prompt for game narrator/GM',
          arguments: [
            {
              name: 'locale',
              description: 'Language (zh or en)',
              required: false
            }
          ]
        },
        {
          name: 'gamemaster',
          description: 'Game master instructions and guidelines',
          arguments: [
            {
              name: 'locale',
              description: 'Language (zh or en)',
              required: false
            }
          ]
        }
      ]
    };
  });
  
  // Get prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const locale = ((args?.locale as string) || defaultLocale) as Locale;
    
    if (name === 'narrator') {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: narrator.getNarratorPrompt(locale)
            }
          }
        ]
      };
    }
    
    if (name === 'gamemaster') {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: narrator.getGameMasterInstructions(locale)
            }
          }
        ]
      };
    }
    
    throw new Error(`Unknown prompt: ${name}`);
  });
  
  return server;
}

// Run as stdio server
export async function runStdio(config?: ServerConfig) {
  const server = createMCPServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('A Summer in Harbor MCP Server running on stdio');
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const locale = (process.env.GAME_LOCALE || 'zh') as Locale;
  runStdio({ defaultLocale: locale }).catch(console.error);
}
