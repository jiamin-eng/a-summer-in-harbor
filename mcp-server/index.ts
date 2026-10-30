/**
 * Tool, resource, and prompt registration for the local game server.
 * server/index.ts is the process that listens. This file does not start one.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { StateStore, InMemoryStateStore } from './state/store.js';
import { withPlayerLock } from './state/lock.js';
import type { GameJourneys } from './state/journeys.js';
import { game } from '../src/story/mcp-game.js';
import type { Locale } from '../src/world/data.js';
import * as gameActions from './tools/game-actions.js';
import { withPerformer, adoptSave } from './tools/perform.js';
import * as narrator from './prompts/narrator.js';

export interface ServerConfig {
  stateStore?: StateStore;
  defaultLocale?: Locale;
  /**
   * When set, this server instance belongs to one authenticated player.
   * Tools, resources, and prompts use this id. A different sessionId is rejected.
   */
  playerId?: string;
  /** Shown to the model. The game owner hash stays in playerId. */
  playerLabel?: string;
  /** Game authority journeys. When set, MCP does not keep a second copy. */
  journeys?: GameJourneys;
}

type ToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

type HandlerExtra = {
  authInfo?: { extra?: Record<string, unknown> };
};

export function createMCPServer(config: ServerConfig = {}) {
  const stateStore = config.stateStore || new InMemoryStateStore();
  const defaultLocale: Locale = config.defaultLocale || 'zh';
  const boundPlayerId = config.playerId;
  const playerLabel = config.playerLabel || boundPlayerId;
  const journeys = config.journeys;
  
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
      instructions: boundPlayerId
        ? (defaultLocale === 'zh'
          ? `当前连接是游戏登录玩家 ${playerLabel}。工具读写的是游戏里这一份旅程。不要传递 sessionId，也不要访问其他玩家。`
          : `This connection is game player ${playerLabel}. Tools read and write that player's journey in the game. Do not pass sessionId or access another player.`)
        : undefined,
    }
  );

  function scopeTools(tools: ToolDef[]): ToolDef[] {
    if (!boundPlayerId) return tools;
    return tools.map((tool) => {
      const properties = { ...tool.inputSchema.properties };
      delete properties.sessionId;
      const required = (tool.inputSchema.required ?? []).filter((name) => name !== 'sessionId');
      return {
        ...tool,
        inputSchema: { ...tool.inputSchema, properties, required },
      };
    });
  }

  function assertSamePlayer(extra?: HandlerExtra) {
    const claimed = extra?.authInfo?.extra?.playerId;
    if (boundPlayerId && typeof claimed === 'string' && claimed !== boundPlayerId) {
      throw new Error(defaultLocale === 'zh'
        ? '认证玩家与此连接不一致'
        : 'Authenticated player does not match this connection');
    }
  }

  /**
   * HTTP connections are bound to the authenticated game owner.
   * Stdio still selects a local journey with sessionId.
   */
  function playerKey(args: Record<string, unknown> | undefined): string {
    const requested = typeof args?.sessionId === 'string' ? args.sessionId : undefined;
    if (boundPlayerId) {
      if (requested && requested !== boundPlayerId) {
        throw new Error(defaultLocale === 'zh'
          ? '这个连接已经绑定到当前玩家，不能指定其他玩家'
          : 'This connection is bound to the authenticated player');
      }
      return boundPlayerId;
    }
    if (!requested) throw new Error('sessionId is required');
    return requested;
  }
  
  async function getOrCreateState(sessionId: string, locale: Locale) {
    if (journeys) return journeys.current(sessionId, locale);
    let state = await stateStore.load(sessionId);
    if (!state) {
      state = game.create(locale, sessionId);
      await stateStore.save(sessionId, state);
    }
    return state;
  }

  async function remember(sessionId: string, state: Awaited<ReturnType<typeof getOrCreateState>>) {
    if (journeys) return;
    await stateStore.save(sessionId, state);
  }

  async function loadBound(locale: Locale) {
    if (!boundPlayerId) return null;
    if (journeys) return journeys.peek(boundPlayerId);
    return stateStore.load(boundPlayerId);
  }

  async function playerPrompt(text: string, locale: Locale): Promise<string> {
    if (!boundPlayerId) return text;
    const state = await loadBound(locale);
    const context = state
      ? game.context(state, locale)
      : (locale === 'zh'
        ? '## 当前玩家上下文\n新游戏，尚未行动。先观察所在场景。身份已绑定，不要传 sessionId。'
        : '## Current player context\nNew game. Observe the scene first. Identity is already bound; do not pass sessionId.');
    return `${text}\n\n${context}`;
  }
  
  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: ToolDef[] = [
        {
          name: 'observe_scene',
          description: '观察当前地点。返回当前任务，以及游戏按所在位置给出的可选项。',
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
          name: 'act',
          description: game.actInput().description,
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Player session ID' },
              action: { type: 'string', description: 'Action id from the parentheses' },
              target: { type: 'string', description: 'Target id from the parentheses' },
              ...game.actInput().properties,
              locale: { type: 'string', enum: ['zh', 'en'], description: 'Language' }
            },
            required: ['sessionId', 'action', 'target']
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
    ];
    return { tools: scopeTools(tools) };
  });
  
  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request, extra: HandlerExtra) => {
    const { name, arguments: args } = request.params;
    
    try {
      assertSamePlayer(extra);
      const sessionId = playerKey(args as Record<string, unknown> | undefined);
      const locale = ((args as any).locale as Locale) || defaultLocale;

      return await withPlayerLock(sessionId, async () => {
        await journeys?.presence?.release(sessionId);
        try {
        const run = async () => {
      
      // Handle export/import separately (no game state modification)
      if (name === 'export_state') {
        if (journeys) {
          const state = await journeys.peek(sessionId);
          return {
            content: [{ type: 'text', text: state ? JSON.stringify(state) : 'No state found for this session' }]
          };
        }
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
        if (journeys) {
          throw new Error(locale === 'zh' ? '进度只在游戏里，不能导入另一份' : 'Progress lives in the game and cannot be imported');
        }
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

        case 'act': {
          const record = (args ?? {}) as Record<string, unknown>;
          const { action, target, ...input } = record;
          delete input.sessionId;
          delete input.locale;
          result = await gameActions.act(state, String(action ?? ''), String(target ?? ''), locale, input);
          if (result.success) await remember(sessionId, state);
          break;
        }
          
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
      
      const responseText = result.message;
      
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
        };
        if (!journeys) return run();
        return withPerformer(async (save, action) => {
          const receipt = await journeys.act(sessionId, save.id, action);
          adoptSave(save, receipt.head);
          return { head: receipt.head, text: receipt.text };
        }, run);
        } finally {
          await journeys?.presence?.resume(sessionId);
        }
      });
      
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
        ...(boundPlayerId
          ? [
              {
                uri: 'harbor://me/state',
                mimeType: 'application/json',
                name: 'My Game State',
                description: 'Save belonging to the authenticated player'
              },
              {
                uri: 'harbor://me/context',
                mimeType: 'text/markdown',
                name: 'My Context',
                description: 'Narrative context for the authenticated player'
              }
            ]
          : [
              {
                uri: 'harbor://session/{sessionId}/state',
                mimeType: 'application/json',
                name: 'Current Game State',
                description: 'Current state snapshot for a session'
              }
            ])
      ]
    };
  });
  
  // Read resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra: HandlerExtra) => {
    const { uri } = request.params;
    const locale = defaultLocale; // Could be extracted from URI parameters
    assertSamePlayer(extra);
    
    if (uri === 'harbor://game/introduction') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: game.introduction(locale)
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
            text: game.map(locale)
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
            text: game.characters(locale)
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
            text: game.guide(locale)
          }
        ]
      };
    }
    
    if (uri === 'harbor://me/state' || uri === 'harbor://me/context') {
      if (!boundPlayerId) {
        throw new Error('harbor://me is only available on an authenticated player connection');
      }
      const state = await withPlayerLock(boundPlayerId, () => journeys ? journeys.peek(boundPlayerId) : stateStore.load(boundPlayerId));
      if (!state) throw new Error('Session not found');
      if (uri === 'harbor://me/context') {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: game.context(state, locale)
            }
          ]
        };
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

    if (uri.startsWith('harbor://session/') && uri.endsWith('/state')) {
      const parts = uri.split('/');
      if (parts.length !== 5 || !parts[3]) throw new Error('Session not found');
      const sessionId = decodeURIComponent(parts[3]);
      if (boundPlayerId && sessionId !== boundPlayerId) {
        throw new Error(defaultLocale === 'zh'
          ? '不能读取其他玩家的存档'
          : "Cannot read another player's state");
      }
      const state = await withPlayerLock(sessionId, () => journeys ? journeys.peek(sessionId) : stateStore.load(sessionId));
      
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
  server.setRequestHandler(GetPromptRequestSchema, async (request, extra: HandlerExtra) => {
    const { name, arguments: args } = request.params;
    const locale = ((args?.locale as string) || defaultLocale) as Locale;
    assertSamePlayer(extra);

    const text = name === 'narrator'
      ? narrator.getNarratorPrompt(locale)
      : name === 'gamemaster'
        ? narrator.getGameMasterInstructions(locale, playerLabel)
        : undefined;
    if (!text) throw new Error(`Unknown prompt: ${name}`);

    const body = boundPlayerId
      ? await withPlayerLock(boundPlayerId, () => playerPrompt(text, locale))
      : text;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: body
          }
        }
      ]
    };
  });
  
  return server;
}
