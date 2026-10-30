/**
 * Prints `Bearer <harbor_preview>` for Pi's MCP header.
 * Reuses HARBOR_PREVIEW_TOKEN, then .data/harbor-preview.token.
 * Otherwise asks the local game server to issue one preview capability.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, '.data', 'harbor-preview.token');
const hex = /^[a-f0-9]{64}$/i;

function emit(token) {
  process.stdout.write(`Bearer ${token.toLowerCase()}`);
}

const fromEnv = process.env.HARBOR_PREVIEW_TOKEN?.trim();
if (fromEnv) {
  if (!hex.test(fromEnv)) {
    console.error('HARBOR_PREVIEW_TOKEN must be the 64-hex harbor_preview value');
    process.exit(1);
  }
  emit(fromEnv);
  process.exit(0);
}

try {
  const saved = readFileSync(file, 'utf8').trim();
  if (hex.test(saved)) {
    emit(saved);
    process.exit(0);
  }
} catch {
  // first run
}

let response;
try {
  response = await fetch('http://127.0.0.1:5236/api/bootstrap', { method: 'POST' });
} catch {
  console.error('Game server is not running. Start it with npm run server');
  process.exit(1);
}
if (!response.ok) {
  console.error(`Preview bootstrap failed: ${response.status}`);
  process.exit(1);
}
const setCookie = typeof response.headers.getSetCookie === 'function'
  ? response.headers.getSetCookie().join('; ')
  : (response.headers.get('set-cookie') ?? '');
const match = /harbor_preview=([a-f0-9]{64})/i.exec(setCookie);
if (!match) {
  console.error('The game server did not issue a harbor_preview cookie');
  process.exit(1);
}
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${match[1].toLowerCase()}\n`, { mode: 0o600 });
emit(match[1]);
