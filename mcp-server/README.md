# Harbor MCP Server · 海湾新生活 MCP 服务器

《海湾新生活》的 Model Context Protocol (MCP) 服务器实现。提供游戏工具、资源和提示词，让 LLM 代理可以通过标准化协议玩游戏。

## 架构

本MCP服务器**只连接游戏引擎**，不包含：
- ❌ LLM agent loop（由外部服务实现）
- ❌ 聊天UI（由外部服务实现）
- ❌ 持久化存储（提供可插拔接口）

包含：
- ✅ 游戏动作工具（observe, talk, move, use等）
- ✅ 游戏资源（世界观、地图、角色、玩法规则）
- ✅ 提示词（叙述者系统提示）
- ✅ **可插拔状态存储**: `StateStore`接口 + 内存默认实现 + JSON导入/导出
- ✅ **HTTP**：挂在本地权威服务 `http://127.0.0.1:5236/mcp`，读写游戏里的同一份旅程

## 安装

```bash
npm install
```

## 运行方式

挂在本地权威服务上，没有单独的 MCP 进程：

```bash
npm run server
```

MCP 在 `http://127.0.0.1:5236/mcp`，和游戏共用 `.data/preview.sqlite`。身份是浏览器里的 `harbor_preview` 能力值：放在 Cookie 里，或作为 `Authorization: Bearer <64位十六进制>`。没有单独的 MCP 进程。

## Claude Desktop / Cursor 配置

在 Claude Desktop 或 Cursor 的 `mcp.json` 中添加：

```json
{
  "mcpServers": {
    "harbor": {
      "url": "http://127.0.0.1:5236/mcp",
      "headers": {
        "Authorization": "Bearer <浏览器 harbor_preview 的值>"
      }
    }
  }
}
```

## 工具列表

身份来自浏览器的 `harbor_preview`。工具列表里没有 `sessionId`。`import_state` 不可用，因为进度只在游戏里。

| 工具 | 描述 | 参数 |
|------|------|------|
| `observe_scene` | 观察当前场景 | sessionId, locale? |
| `introduce` | 向陌生人介绍自己 | sessionId, personId, locale? |
| `talk` | 与人交谈（可选话题） | sessionId, personId, topicId?, locale? |
| `travel` | 前往相邻地点 | sessionId, destination, locale? |
| `fast_travel` | 快速旅行到已访问地点 | sessionId, destination, locale? |
| `use_object` | 使用场景中的物品 | sessionId, objectId, action, locale? |
| `view_inventory` | 查看背包 | sessionId, locale? |
| `view_status` | 查看玩家状态 | sessionId, locale? |
| `export_state` | 导出游戏状态为JSON | sessionId |
| `import_state` | 从JSON导入游戏状态 | sessionId, stateJson |

## 资源列表

| URI | 描述 |
|-----|------|
| `harbor://game/introduction` | 游戏介绍 |
| `harbor://game/map` | 世界地图 |
| `harbor://game/characters` | 角色列表 |
| `harbor://game/howtoplay` | 玩法规则 |
| `harbor://session/{sessionId}/state` | stdio：指定会话的存档 |
| `harbor://me/state` | HTTP：当前认证玩家的存档 |
| `harbor://me/context` | HTTP：当前认证玩家的叙述上下文 |

## 提示词列表

| 名称 | 描述 | 参数 |
|------|------|------|
| `narrator` | 游戏叙述者系统提示 | locale? |
| `gamemaster` | 游戏主持人指南 | locale? |

## 状态持久化

MCP服务器**不提供持久化**。外部服务需要实现 `StateStore` 接口：

```typescript
interface StateStore {
  load(sessionId: string): Promise<Save | null>;
  save(sessionId: string, state: Save): Promise<void>;
  export(sessionId: string): Promise<string | null>;
  import(sessionId: string, json: string): Promise<void>;
}
```

### 使用自定义存储

```typescript
import { createMCPServer } from './mcp-server/index.js';
import { MyDatabaseStore } from './my-store.js';

const server = createMCPServer({
  stateStore: new MyDatabaseStore(),
  defaultLocale: 'zh'
});
```

### 导入/导出状态

使用 `export_state` 和 `import_state` 工具在外部服务中管理状态：

```javascript
// stdio 传入 sessionId。HTTP 连接已经绑定玩家，arguments 留空，存档键就是玩家 id。
const exported = await client.callTool({
  name: 'export_state',
  arguments: { sessionId: 'player-123' }
});
const stateJson = exported.content[0].text;

await myDatabase.save('player-123', stateJson);

const restored = await myDatabase.load('player-123');
await client.callTool({
  name: 'import_state',
  arguments: { sessionId: 'player-123', stateJson: restored }
});
```

# 测试

```bash
# 运行完整任务流程测试
npm run mcp:playthrough
```

测试涵盖完整任务流程（认识Mara → 领钥匙 → 放行李 → 告知Mara → 去咖啡馆 → 认识Theo → 取工具袋 → 归还工具袋）。

## 目录结构

```
mcp-server/
├── index.ts              # 主MCP服务器
├── auth/
│   └── aigram.ts         # Aigram 登录令牌 → 游戏 owner
├── state/
│   ├── store.ts          # 仅 stdio 本机调试用的内存状态
│   └── journeys.ts       # 游戏权威库里的旅程
├── tools/
│   └── game-actions.ts   # 游戏动作工具
├── resources/
│   └── game-content.ts   # 游戏资源（世界观、地图等）
├── prompts/
│   └── narrator.ts       # 提示词
├── transports/
│   └── http.ts           # HTTP Streamable transport
└── tests/
    ├── server.test.ts    # 服务器测试
    └── playthrough.test.ts # 完整流程测试
```

## 游戏无关设计

核心设计可复用于其他RPG：
- `state/store.ts` - 通用状态存储接口
- `tools/game-actions.ts` - 可适配为其他游戏动作
- `resources/` 和 `prompts/` - 可替换为其他游戏内容

游戏特定逻辑在：
- 工具实现中调用 `src/story/state.ts` 的 `applyAction()`
- 资源内容引用 `src/world/data.ts` 的世界数据

## 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `GAME_LOCALE` | 游戏语言 (zh/en) | zh |

## 与外部服务集成

外部服务（如你们团队的聊天服务）应该：

1. **连接本地权威服务**：`http://127.0.0.1:5236/mcp`
2. **本地 HTTP** 使用浏览器 `harbor_preview` 能力值。不要再签发另一把 MCP 令牌
3. **进度在 `.data/preview.sqlite`**：MCP 不另存
4. **LLM集成**：将MCP工具、资源和提示词暴露给LLM。`narrator` / `gamemaster` 和 `harbor://me/context` 只描述这位玩家的旅程
5. **聊天UI**：提供自己的聊天界面

同一登录令牌重新连接，读到的仍是游戏里该玩家最近的一份旅程。另一把登录令牌看不到它，也不能复用别人的 `Mcp-Session-Id`。

示例流程：
```
玩家 → 你们的聊天服务 → LLM (配置MCP) → MCP服务器 → 游戏引擎
                ↓
          你们的数据库 (存储状态)
```

## 许可

MIT
