/**
 * Databar MCP Server — HTTP entry point.
 * For remote deployment as a hosted service.
 *
 * Supports:
 *   - Streamable HTTP transport (POST/GET/DELETE /mcp) — recommended
 *   - Legacy SSE transport (GET /sse + POST /message) — for older clients
 *
 * Authentication: Bearer token in Authorization header (Databar API key).
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { createMcpServer } from './mcp-factory.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  exposedHeaders: ['Mcp-Session-Id'],
  origin: '*',
}));

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function extractApiKey(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7) || null;
}

function rejectUnauthorized(res: express.Response): void {
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized: provide a Databar API key as Bearer token' },
    id: null,
  });
}

// ---------------------------------------------------------------------------
// Streamable HTTP transport — /mcp
// ---------------------------------------------------------------------------

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  apiKey: string;
}

const sessions: Map<string, SessionEntry> = new Map();

app.post('/mcp', async (req: express.Request, res: express.Response) => {
  const apiKey = extractApiKey(req);
  if (!apiKey) return rejectUnauthorized(res);

  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, { transport, apiKey });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
      };

      const server = createMcpServer(apiKey);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null,
    });
  } catch (error) {
    console.error('Error handling POST /mcp:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling GET /mcp:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

app.delete('/mcp', async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling DELETE /mcp:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing session termination');
    }
  }
});

// ---------------------------------------------------------------------------
// Legacy SSE transport — /sse + /message
// ---------------------------------------------------------------------------

interface SseSessionEntry {
  transport: SSEServerTransport;
  apiKey: string;
}

const sseSessions: Map<string, SseSessionEntry> = new Map();

app.get('/sse', async (req: express.Request, res: express.Response) => {
  const apiKey = extractApiKey(req);
  if (!apiKey) return rejectUnauthorized(res);

  try {
    const transport = new SSEServerTransport('/message', res);
    const server = createMcpServer(apiKey);

    sseSessions.set(transport.sessionId, { transport, apiKey });

    res.on('close', () => {
      sseSessions.delete(transport.sessionId);
    });

    await server.connect(transport);
  } catch (error) {
    console.error('Error handling GET /sse:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

app.post('/message', async (req: express.Request, res: express.Response) => {
  const sessionId = req.query.sessionId as string;
  const session = sseSessions.get(sessionId);
  if (!session) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Session not found' },
      id: null,
    });
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('Error handling POST /message:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    transport: ['streamable-http', 'sse'],
    sessions: sessions.size,
    sseSessions: sseSessions.size,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.MCP_PORT || '3100', 10);

const httpServer = app.listen(PORT, () => {
  console.log(`Databar MCP HTTP Server listening on port ${PORT}`);
  console.log(`  Streamable HTTP: POST/GET/DELETE /mcp`);
  console.log(`  Legacy SSE:      GET /sse  +  POST /message`);
  console.log(`  Health:          GET /health`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  for (const [sid, entry] of sessions) {
    try { await entry.transport.close(); } catch { /* ignore */ }
    sessions.delete(sid);
  }
  httpServer.close();
  process.exit(0);
});
