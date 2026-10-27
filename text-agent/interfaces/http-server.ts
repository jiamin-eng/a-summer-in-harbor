/**
 * HTTP API interface for text agent
 * Provides REST endpoints for web/mobile clients
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AgentSession, type AgentConfig } from '../core/agent-loop';
import { createSessionStore, getOrCreateSave } from '../core/session-manager';

const sessions = new Map<string, AgentSession>();

const HTTP_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '',
  baseURL: process.env.LLM_BASE_URL,
  model: process.env.LLM_MODEL || 'gpt-4o-mini',
  provider: 'openai' as const,
  port: parseInt(process.env.TEXT_AGENT_PORT || '3456', 10),
  host: process.env.TEXT_AGENT_HOST || '127.0.0.1'
};

type SessionStore = Awaited<ReturnType<typeof createSessionStore>>;
let store: SessionStore;

async function json(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function getOrCreateSession(playerId: string, locale: 'zh' | 'en'): Promise<AgentSession> {
  if (sessions.has(playerId)) {
    return sessions.get(playerId)!;
  }
  
  const save = await getOrCreateSave(store, playerId, locale);
  const session = new AgentSession({ ...HTTP_CONFIG, locale }, save);
  sessions.set(playerId, session);
  
  return session;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  
  try {
    // Health check
    if (path === '/health' && method === 'GET') {
      return json(res, 200, { ok: true, mode: 'text-agent' });
    }
    
    // Chat endpoint
    if (path === '/api/chat' && method === 'POST') {
      const body = await readBody(req);
      const data = JSON.parse(body);
      
      const { player_id, message, locale = 'zh' } = data;
      
      if (!player_id || typeof player_id !== 'string') {
        return json(res, 400, { error: 'player_id required' });
      }
      
      if (!message || typeof message !== 'string') {
        return json(res, 400, { error: 'message required' });
      }
      
      const session = await getOrCreateSession(player_id, locale);
      const response = await session.processMessage(message);
      
      // Save state
      if (response.newSave) {
        await store.putSave(player_id, response.newSave);
      }
      
      return json(res, 200, {
        message: response.message,
        suggested_actions: response.suggestedActions,
        state_changed: response.stateChanged
      });
    }
    
    // Reset session
    if (path === '/api/reset' && method === 'POST') {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const { player_id } = data;
      
      if (!player_id) {
        return json(res, 400, { error: 'player_id required' });
      }
      
      sessions.delete(player_id);
      
      return json(res, 200, { ok: true });
    }
    
    // Serve web chat UI
    if (path === '/' || path === '/index.html') {
      const html = await import('node:fs/promises').then(fs => fs.readFile('./text-agent/interfaces/chat.html', 'utf-8'));
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
      return;
    }
    
    json(res, 404, { error: 'Not found' });
    
  } catch (err: any) {
    console.error('Request error:', err);
    json(res, 500, { error: err.message || 'Internal server error' });
  }
}

async function main() {
  if (!HTTP_CONFIG.apiKey) {
    console.error('Error: LLM API key not set. Please set OPENAI_API_KEY or LLM_API_KEY');
    process.exit(1);
  }
  
  const dbPath = process.env.SESSION_DB_PATH || '.data/text-agent-sessions.sqlite';
  store = await createSessionStore(dbPath);
  
  const server = createServer(handleRequest);
  
  server.listen(HTTP_CONFIG.port, HTTP_CONFIG.host, () => {
    console.log(`Text Agent HTTP server running at http://${HTTP_CONFIG.host}:${HTTP_CONFIG.port}/`);
    console.log(`API endpoint: POST http://${HTTP_CONFIG.host}:${HTTP_CONFIG.port}/api/chat`);
  });
  
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    server.close();
    await store.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
