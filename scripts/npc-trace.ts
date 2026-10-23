import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import "../src/world/data.ts";
import { createNpcConverse, createNpcDecision, createNpcNarrate, createNpcReview, runNpcHour } from "../server/npc-chat.ts";
import type { NpcTownState } from "../src/npc/town.ts";

const hours = Number(process.argv[2] ?? "1");
const out = resolve(process.argv[3] ?? ".data/npc-trace.log");
if (!Number.isSafeInteger(hours) || hours < 1 || hours > 48) throw Error("用法：node --import tsx scripts/npc-trace.ts [小时数 1-48] [日志路径]");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `海湾居民循环记录\n开始于 ${new Date().toISOString()}\n每次调用下面先是完整请求，再是完整响应。请求里的 input 和对话正文已经展开成可读的 JSON。\n模型地址：${process.env.HARBOR_NPC_DECIDE_URL || "https://chat.aiwaves.tech/aigram/api/chatgpt/decision"} ，${process.env.HARBOR_NPC_CHAT_URL || "https://chat.aiwaves.tech/aigram/api/game-chat"}\n计划跑 ${hours} 个小时，从第 1 天 09:00 的冷启动记忆开始。\n`);
process.env.HARBOR_NPC_LOG = out;

const choose = createNpcDecision();
const converse = createNpcConverse();
const narrate = createNpcNarrate();
const review = createNpcReview();
let state: NpcTownState | undefined;
let minute = 540;

for (let index = 0; index < hours; index += 1) {
  process.stdout.write(`结算 ${minute} …\n`);
  const hour = await runNpcHour(state, minute, choose, undefined, converse, narrate, review);
  state = hour.state;
  minute += 60;
  const accepted = hour.tick?.accepted.length ?? 0;
  const rejected = hour.tick?.rejected.length ?? 0;
  const skipped = hour.skipped.length;
  process.stdout.write(`  接受 ${accepted}，拒绝 ${rejected}，跳过 ${skipped}\n`);
}

process.stdout.write(`写好了 ${out}\n`);
