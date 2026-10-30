/**
 * Prints `Bearer <aigram token>` for Pi's MCP header.
 * Uses HARBOR_AIGRAM_TOKEN, otherwise .data/aigram.token (one line, raw token).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'aigram.token');
const tokenPattern = /^[\x21-\x7e]{1,4096}$/;

function tokenOf(value) {
  const trimmed = value.trim();
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(trimmed);
  return bearer ? bearer[1] : trimmed;
}

function emit(token) {
  if (!tokenPattern.test(token)) {
    console.error('The Aigram token must be one line of printable characters, without spaces');
    process.exit(1);
  }
  process.stdout.write(`Bearer ${token}`);
}

const fromEnv = process.env.HARBOR_AIGRAM_TOKEN;
if (fromEnv?.trim()) {
  emit(tokenOf(fromEnv));
  process.exit(0);
}

try {
  emit(tokenOf(readFileSync(file, 'utf8')));
} catch {
  console.error('Put your Aigram token in HARBOR_AIGRAM_TOKEN or .data/aigram.token');
  process.exit(1);
}
