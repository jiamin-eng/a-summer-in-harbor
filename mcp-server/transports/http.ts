/**
 * HTTP Streamable transport for MCP server
 * Allows remote deployment with optional bearer token auth
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamable-http.js';
import { createMCPServer, type ServerConfig } from '../index.js';

export interface HttpServerConfig extends ServerConfig {
  port?: number;
  host?: string;
  bearerToken?: string;
}

function checkAuth(req: IncomingMessage, bearerToken?: string): boolean {
  if (!bearerToken) return true;
  
  const auth = req.headers.authorization;
  if (!auth) return false;
  
  const token = auth.replace(/^Bearer\s+/i, '');
  return token === bearerToken;
}

export async function runHttpServer(config: HttpServerConfig = {}) {
  const port = config.port || parseInt(process.env.PORT || '3000', 10);
  const host = config.host || process.env.HOST || '0.0.0.0';
  const bearerToken = config.bearerToken || process.env.BEARER_TOKEN;
  
  const mcpServer = createMCPServer(config);
  
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    
    // Health check
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', service: 'harbor-mcp-server' }));
      return;
    }
    
    // MCP Streamable HTTP endpoint
    if (url.pathname === '/mcp') {
      // Check auth
      if (!checkAuth(req, bearerToken)) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      const transport = new StreamableHTTPServerTransport({ req, res });
      await mcpServer.connect(transport);
      
      return;
    }
    
    // 404
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  
  httpServer.listen(port, host, () => {
    console.log(`Harbor MCP Server (HTTP) running on http://${host}:${port}`);
    console.log(`MCP endpoint: http://${host}:${port}/mcp`);
    if (bearerToken) {
      console.log('Bearer token authentication enabled');
    }
  });
  
  return httpServer;
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runHttpServer().catch(console.error);
}
