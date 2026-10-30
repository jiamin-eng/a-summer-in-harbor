/**
 * HTTP Streamable transport for MCP server.
 * Authorization is the game's Aigram login token. The platform resolves it
 * to the same owner the game uses, and tools read and write that journey.
 */

import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMCPServer, type ServerConfig } from '../index.js';
import type { GameJourneys } from '../state/journeys.js';
import { type AigramIdentity } from '../auth/aigram.js';

export interface McpHandlerConfig {
  journeys: GameJourneys;
  defaultLocale?: ServerConfig['defaultLocale'];
  resolve(req: IncomingMessage): Promise<AigramIdentity | null>;
}

interface PlayerMcpSession {
  playerId: string;
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createMCPServer>;
}

const MAX_BODY_BYTES = 1_000_000;

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}


function attachAuth(req: IncomingMessage, identity: AigramIdentity): IncomingMessage & { auth?: AuthInfo } {
  const authed = req as IncomingMessage & { auth?: AuthInfo };
  authed.auth = {
    token: identity.token,
    clientId: identity.owner,
    scopes: ['play'],
    extra: { playerId: identity.owner, telegramId: identity.telegramId },
  };
  return authed;
}

export interface McpHttpHandler {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): Promise<void>;
}

/** MCP route used by the game backend. The public gateway rewrites /mcp to this path. */
export const GAME_MCP_PATH = '/api/mcp';

export function createMcpHttpHandler(config: McpHandlerConfig): McpHttpHandler {
  const journeys = config.journeys;
  const sharedConfig: ServerConfig = {
    journeys,
    defaultLocale: config.defaultLocale,
  };
  const sessions = new Map<string, PlayerMcpSession>();

  return {
    async handle(req, res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      try {
      const identity = await config.resolve(req);
      if (!identity) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        sendJson(res, 401, { error: 'Unauthorized', message: 'A player token is required' });
        return;
      }

      const sessionId = headerValue(req.headers['mcp-session-id']);
      let parsedBody: unknown;
      if (req.method === 'POST') {
        const raw = await readBody(req);
        if (raw) {
          try {
            parsedBody = JSON.parse(raw);
          } catch {
            sendJson(res, 400, { error: 'Invalid JSON' });
            return;
          }
        }
      }

      if (sessionId) {
        const existing = sessions.get(sessionId);
        if (!existing) {
          sendJson(res, 404, { error: 'Session not found' });
          return;
        }
        if (existing.playerId !== identity.owner) {
          sendJson(res, 403, { error: 'Forbidden', message: 'This session belongs to another player' });
          return;
        }
        await existing.transport.handleRequest(attachAuth(req, identity), res, parsedBody);
        return;
      }

      if (req.method !== 'POST' || !isInitializeRequest(parsedBody)) {
        sendJson(res, 400, { error: 'Bad Request', message: 'Initialize a session before calling tools' });
        return;
      }

      const playerServer = createMCPServer({
        ...sharedConfig,
        playerId: identity.owner,
        playerLabel: identity.telegramId,
      });
      const created: { transport?: StreamableHTTPServerTransport } = {};
      created.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { playerId: identity.owner, transport: created.transport!, server: playerServer });
          journeys.presence?.start(identity.owner);
        },
      });
      const transport = created.transport;
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id && sessions.get(id)?.transport === transport) {
          sessions.delete(id);
          journeys.presence?.stop(identity.owner);
        }
      };

      await playerServer.connect(transport);
      await transport.handleRequest(attachAuth(req, identity), res, parsedBody);
    } catch (error) {
      const status = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500;
      console.error('MCP HTTP request failed:', error instanceof Error ? error.message : error);
      sendJson(res, status, { error: status === 413 ? 'Payload too large' : 'Internal server error' });
      }
    },
    async close() {
      await Promise.all([...sessions.values()].map((session) => session.transport.close()));
      sessions.clear();
    },
  };
}
