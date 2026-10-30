import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OPENING = "开始这个夏天。先观察所在场景，把当前任务和可以做的事用原文告诉我。";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (event, ctx) => {
    if (event.reason !== "startup" && event.reason !== "new") return;
    const started = ctx.sessionManager.getBranch().some((entry) => {
      if (entry.type !== "message") return false;
      const role = (entry.message as { role?: string }).role;
      return role === "user" || role === "assistant";
    });
    if (started) return;
    setImmediate(() => {
      pi.sendUserMessage(OPENING);
    });
  });
}
