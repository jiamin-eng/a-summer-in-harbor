/**
 * The game login token is the MCP credential.
 * The platform returns the Telegram id for that Bearer token, and the owner
 * is the same hash the game uses for its journey rows.
 */

import { createHash } from 'node:crypto';
import { GAME_UUID } from '../../src/game-id.js';
import { PLATFORM_SELF_URL } from '../../server/platform-token-verifier.js';
import { createPlatformBearerIdentity } from '../../server/platform-no-param-token-candidate.js';

const TELEGRAM_ID = /^[1-9][0-9]{0,29}$/;
const REJECTED = new Set([
  'PLATFORM_TOKEN_REQUIRED',
  'PLATFORM_HTTP_REJECTED',
  'PLATFORM_RETCODE_INVALID',
  'PLATFORM_ERRCODE_INVALID',
  'PLATFORM_MSG_INVALID',
  'PLATFORM_CONTENT_TYPE_INVALID',
  'PLATFORM_BODY_MISSING',
  'PLATFORM_BODY_TOO_LARGE',
  'PLATFORM_JSON_INVALID',
  'PLATFORM_TELEGRAM_ID_INVALID',
]);

export interface AigramIdentity {
  token: string;
  telegramId: string;
  owner: string;
}

export interface AigramVerifier {
  verify(authorization: string | undefined): Promise<AigramIdentity | null>;
}

export function gameOwner(telegramId: string, gameId = GAME_UUID): string {
  return createHash('sha256')
    .update(JSON.stringify(['harbor-owner-v1', gameId, 'telegram-unverified-v1', telegramId]))
    .digest('hex');
}

export function createAigramVerifier(options: {
  gameId?: string;
  identify?: (bearerHeader: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
} = {}): AigramVerifier {
  const gameId = options.gameId ?? GAME_UUID;
  const identify = options.identify ?? createPlatformBearerIdentity({
    endpoint: options.endpoint ?? PLATFORM_SELF_URL,
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs,
  });

  return {
    async verify(authorization) {
      const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
      if (!match?.[1]) return null;
      try {
        const telegramId = await identify(`Bearer ${match[1]}`);
        if (!TELEGRAM_ID.test(telegramId)) return null;
        return { token: match[1], telegramId, owner: gameOwner(telegramId, gameId) };
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (REJECTED.has(code)) return null;
        throw Object.assign(new Error(code || 'PLATFORM_HTTP_UNAVAILABLE'), { statusCode: 503 });
      }
    },
  };
}
