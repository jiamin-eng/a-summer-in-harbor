import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { applyAction, initial, type Action, type Save } from '../../src/story/state.js';
import { rooms, worldWithFlags, type Locale } from '../../src/world/data.js';
import { createAigramVerifier, gameOwner } from '../auth/aigram.js';
import { createGameJourneys } from '../state/journeys.js';
import { createMcpHttpHandler } from '../transports/http.js';

const aliceTelegram = '100000000001';
const bobTelegram = '100000000002';

function textOf(result: { content?: Array<{ type: string; text?: string }>; toolResult?: unknown }): string {
  return (result.content ?? [])
    .map((block) => (block.type === 'text' ? block.text ?? '' : ''))
    .join('\n');
}

async function connectPlayer(url: URL, token: string) {
  const client = new Client({ name: 'harbor-player-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, transport };
}

test('an Aigram bearer token resolves to the game owner', async () => {
  const verify = createAigramVerifier({
    fetchImpl: async (_url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization');
      if (authorization !== 'Bearer live-token') {
        return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        retcode: 0,
        errcode: 0,
        msg: 'success',
        data: { telegram_id: '42' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const identity = await verify.verify('Bearer live-token');
  assert.equal(identity?.telegramId, '42');
  assert.equal(identity?.owner, gameOwner('42'));
  assert.equal(await verify.verify('Bearer other-token'), null);
  assert.equal(await verify.verify(undefined), null);
});

test('each Aigram login reads and writes only that player journey in the game authority', async () => {
  const rows = new Map<string, Save>();
  const authority = {
    async directory(owner: string) {
      const save = rows.get(owner);
      return save ? [{ id: save.id, updated: save.version }] : [];
    },
    async get(owner: string, id: string) {
      const save = rows.get(owner);
      if (!save || save.id !== id) throw Error('SESSION_NOT_FOUND');
      return structuredClone(save);
    },
    async create(owner: string, _enrollment: string, locale: Locale) {
      const existing = rows.get(owner);
      if (existing) return structuredClone(existing);
      const save = initial(locale, randomUUID());
      rows.set(owner, save);
      return structuredClone(save);
    },
    async action(owner: string, id: string, action: Action) {
      const save = rows.get(owner);
      if (!save || save.id !== id) throw Error('SESSION_NOT_FOUND');
      const result = applyAction(save, action, undefined, worldWithFlags(save.flags));
      rows.set(owner, result.head);
      return { head: structuredClone(result.head), text: result.text };
    },
  };
  const journeys = createGameJourneys(authority);
  const verify = createAigramVerifier({
    identify: async (authorization) => {
      const token = authorization.slice('Bearer '.length);
      if (token === 'alice-token') return aliceTelegram;
      if (token === 'bob-token') return bobTelegram;
      throw Error('PLATFORM_HTTP_REJECTED');
    },
  });
  const mcp = createMcpHttpHandler({
    journeys,
    defaultLocale: 'zh',
    resolve: (req) => verify.verify(Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization),
  });
  const http = createServer((req, res) => {
    const path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (path !== '/mcp') {
      res.statusCode = 404;
      res.end();
      return;
    }
    void mcp.handle(req, res);
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('HTTP server did not bind a port');
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const players: Array<{ client: Client; transport: StreamableHTTPClientTransport }> = [];

  try {
    const missing = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: '{}',
    });
    assert.equal(missing.status, 401);

    const alice = await connectPlayer(url, 'alice-token');
    const bob = await connectPlayer(url, 'bob-token');
    players.push(alice, bob);

    const observe = (await alice.client.listTools()).tools.find((tool) => tool.name === 'observe_scene');
    const schema = observe?.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    assert.equal(Object.hasOwn(schema.properties ?? {}, 'sessionId'), false);

    const mara = rooms.station.entities.find((entity) => entity.person === 'mara');
    const introduced = await alice.client.callTool({ name: 'act', arguments: { action: 'introduce', target: mara?.id ?? '' } });
    assert.notEqual(introduced.isError, true);
    assert.match(textOf(introduced), /玛拉|Mara/);

    const aliceStatus = await alice.client.callTool({ name: 'view_status', arguments: {} });
    const bobStatus = await bob.client.callTool({ name: 'view_status', arguments: {} });
    assert.match(textOf(aliceStatus), /已认识: 1人/);
    assert.match(textOf(bobStatus), /已认识: 0人/);

    const aliceHead = await journeys.peek(gameOwner(aliceTelegram));
    const bobHead = await journeys.peek(gameOwner(bobTelegram));
    assert.deepEqual(aliceHead?.known, ['mara']);
    assert.deepEqual(bobHead?.known, []);

    const stolen = await alice.client.callTool({ name: 'import_state', arguments: { stateJson: '{}' } });
    assert.equal(stolen.isError, true);
    assert.deepEqual((await journeys.peek(gameOwner(bobTelegram)))?.known, []);

    const alicePrompt = await alice.client.getPrompt({ name: 'narrator', arguments: { locale: 'zh' } });
    const bobContext = await bob.client.readResource({ uri: 'harbor://me/context' });
    const aliceText = alicePrompt.messages[0]?.content.type === 'text' ? alicePrompt.messages[0].content.text : '';
    const bobBlock = bobContext.contents[0];
    const bobText = bobBlock && 'text' in bobBlock ? bobBlock.text : '';
    assert.match(aliceText, /已认识: mara/);
    assert.match(bobText, /已认识: 无/);
    assert.doesNotMatch(bobText, /mara/);

    await assert.rejects(
      () => bob.client.readResource({ uri: `harbor://session/${gameOwner(aliceTelegram)}/state` }),
      /不能读取其他玩家的存档|Cannot read another player's state/,
    );

    const hijack = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer bob-token',
        'mcp-session-id': alice.transport.sessionId!,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    assert.equal(hijack.status, 403);

    await alice.client.close();
    const aliceAgain = await connectPlayer(url, 'alice-token');
    players[0] = aliceAgain;
    const stillAlice = await aliceAgain.client.callTool({ name: 'view_status', arguments: {} });
    assert.match(textOf(stillAlice), /已认识: 1人/);
  } finally {
    for (const player of players) await player.client.close().catch(() => undefined);
    await mcp.close();
    if (http.listening) {
      await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
    }
  }
});
