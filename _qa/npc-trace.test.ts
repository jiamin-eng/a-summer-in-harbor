import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { clockLabel, labelNpcRequest, presentNpcRequest, traceNpcExchange } from "../server/npc-log";
import { fitSpoken, runNpcHour } from "../server/npc-chat";
import "../src/world/residents";

test("a long spoken line is kept whole", () => {
  const english = "He is delivering the off-season crop and opening another sales channel at the grocery.";
  const fitted = fitSpoken(["  他正在杂货店交作物。  ", `  ${english}  `]);
  assert.equal(fitted[0], "他正在杂货店交作物。");
  assert.equal(fitted[1], english);
});

test("a decision request is labeled from the resident and the question", () => {
  const body = { input: JSON.stringify({ me: { id: "owen" } }), questions: [{ type: "choice", name: "action", instructions: "one", choices: [] }] };
  assert.deepEqual(labelNpcRequest(body), { who: "owen", purpose: "action" });
  assert.match(presentNpcRequest(body), /"id": "owen"/);
  const bilingual = { input: JSON.stringify({ me: { id: "owen", temperament: ["他不把耽误当成冒犯。", "A delay does not yet feel like an insult."] } }), questions: [] };
  const shown = presentNpcRequest(bilingual);
  assert.match(shown, /A delay does not yet feel like an insult/);
  assert.equal(shown.includes("他不把耽误当成冒犯"), false);
  assert.equal(clockLabel(540), "第1天 上午 09:00（minute 540）");
});

test("a traced hour writes the action, the failure, and the memory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "harbor-npc-log-"));
  const file = join(dir, "trace.log");
  const previous = process.env.HARBOR_NPC_LOG;
  process.env.HARBOR_NPC_LOG = file;
  try {
    traceNpcExchange("decide", { input: JSON.stringify({ me: { id: "june" } }), questions: [{ type: "choice", name: "scene", instructions: "where", choices: [] }] }, { response: { answers: [{ type: "choice", name: "scene", choice: "dock" }] }, ms: 12 });
    const hour = await runNpcHour(undefined, 540, async (view) => {
      if (view.me.id === "owen") return { type: "go", scene: "path" };
      if (view.me.id === "mara") throw Error("NPC_DECIDE");
      return { type: "stay" };
    });
    const text = readFileSync(file, "utf8");
    assert.match(text, /decide  scene  june/);
    assert.match(text, /"choice": "dock"/);
    assert.match(text, /欧文 owen  go path/);
    assert.match(text, /玛拉 mara  NPC_DECIDE/);
    assert.match(text, /Theo still has Owen's plane/);
    assert.equal(hour.state.residents.find((resident) => resident.id === "owen")?.scene, "path");
    assert.equal(hour.skipped.map((item) => item.id).join(","), "mara");
  } finally {
    if (previous === undefined) delete process.env.HARBOR_NPC_LOG;
    else process.env.HARBOR_NPC_LOG = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
