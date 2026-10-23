import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import type { Memory, NpcMemoryPort } from "../src/npc/town";

const searchLimit = 8;

/** Memories and their embeddings for one player. Vector lookup is a sqlite-vec cosine search. */
export function openNpcMemory(path: string, dimensions = 3072) {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 3072) throw Error("NPC_MEMORY_DIM");
  const db = new DatabaseSync(path, { allowExtension: true });
  sqliteVec.load(db);
  db.exec("PRAGMA busy_timeout=5000");
  db.exec(`CREATE TABLE IF NOT EXISTS npc_memory (
    id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    npc TEXT NOT NULL,
    minute INTEGER NOT NULL,
    kind TEXT NOT NULL,
    scene TEXT NOT NULL,
    with_id TEXT,
    importance INTEGER NOT NULL,
    about TEXT NOT NULL,
    text_zh TEXT NOT NULL,
    text_en TEXT NOT NULL,
    accessed INTEGER,
    UNIQUE(owner, npc, minute, kind, text_zh)
  )`);
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS npc_memory_vec USING vec0(memory_id integer primary key, embedding float[${dimensions}] distance_metric=cosine)`);
  const upsert = db.prepare(`INSERT INTO npc_memory(owner, npc, minute, kind, scene, with_id, importance, about, text_zh, text_en, accessed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, npc, minute, kind, text_zh) DO UPDATE SET
      scene=excluded.scene, with_id=excluded.with_id, importance=excluded.importance, about=excluded.about, text_en=excluded.text_en, accessed=excluded.accessed
    RETURNING id`);
  const findId = db.prepare("SELECT id FROM npc_memory WHERE owner = ? AND npc = ? AND minute = ? AND kind = ? AND text_zh = ?");
  const idsFor = db.prepare("SELECT id FROM npc_memory WHERE owner = ? AND npc = ?");
  const dropRow = db.prepare("DELETE FROM npc_memory WHERE id = ?");
  const dropVec = db.prepare("DELETE FROM npc_memory_vec WHERE memory_id = ?");
  const hasVec = db.prepare("SELECT memory_id FROM npc_memory_vec WHERE memory_id = ?");
  const putVec = db.prepare("INSERT INTO npc_memory_vec(memory_id, embedding) VALUES (?, ?)");
  const readVec = db.prepare(`SELECT v.embedding FROM npc_memory m JOIN npc_memory_vec v ON v.memory_id = m.id
    WHERE m.owner = ? AND m.npc = ? AND m.minute = ? AND m.text_zh = ?`);
  const nearest = db.prepare(`SELECT m.minute AS minute, m.text_zh AS text, v.distance AS distance
    FROM npc_memory m JOIN npc_memory_vec v ON v.memory_id = m.id
    WHERE m.owner = ? AND m.npc = ? AND v.embedding MATCH ? AND k = ${searchLimit}
    ORDER BY v.distance`);

  function vectorOf(value: Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return [...new Float32Array(copy.buffer)];
  }

  function write(owner: string, npc: string, memories: Memory[]) {
    const keep = new Set<number>();
    db.exec("BEGIN");
    try {
      for (const item of memories) {
        const row = upsert.get(owner, npc, item.minute, item.kind, item.scene, item.with, item.importance, JSON.stringify(item.about), item.text[0], item.text[1], item.accessed ?? null) as { id: number } | undefined;
        const id = row?.id ?? (findId.get(owner, npc, item.minute, item.kind, item.text[0]) as { id: number } | undefined)?.id;
        if (!id) continue;
        keep.add(id);
        if (item.embedding?.length === dimensions && !hasVec.get(BigInt(id))) putVec.run(BigInt(id), Float32Array.from(item.embedding));
      }
      for (const row of idsFor.all(owner, npc) as { id: number }[]) {
        if (keep.has(row.id)) continue;
        dropVec.run(BigInt(row.id));
        dropRow.run(row.id);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    bind(owner: string): NpcMemoryPort {
      return {
        async hydrate(id, items) {
          return items.map((item) => {
            const row = readVec.get(owner, id, item.minute, item.text) as { embedding?: Uint8Array } | undefined;
            return row?.embedding ? vectorOf(row.embedding) : undefined;
          });
        },
        async search(id, vector) {
          if (vector.length !== dimensions) return [];
          return nearest.all(owner, id, Float32Array.from(vector)) as { minute: number; text: string; distance: number }[];
        },
        async save(id, memories) {
          write(owner, id, memories);
        },
      };
    },
  };
}
