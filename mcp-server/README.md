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
- ✅ **Transports**: stdio（Claude Desktop/Cursor本地使用）和 HTTP Streamable（远程部署，可选Bearer token认证）

## 安装

```bash
npm install
```

## 运行方式

### Stdio 模式（本地使用）

```bash
# 使用默认语言（中文）
npm run mcp:stdio

# 指定语言
GAME_LOCALE=en npm run mcp:stdio
```

### HTTP 模式（远程部署）

```bash
# 默认端口 3000
npm run mcp:http

# 自定义端口和认证
PORT=8080 BEARER_TOKEN=your-secret npm run mcp:http
```

HTTP端点：
- `GET /health` - 健康检查
- `POST /mcp` - MCP Streamable HTTP端点（需要 Authorization: Bearer <token> 如果设置了BEARER_TOKEN）

## Claude Desktop / Cursor 配置

在 Claude Desktop 或 Cursor 的 `mcp.json` 中添加：

```json
{
  "mcpServers": {
    "harbor": {
      "command": "node",
      "args": ["--import", "tsx", "mcp-server/index.ts"],
      "cwd": "/path/to/a-summer-in-harbor",
      "env": {
        "GAME_LOCALE": "zh"
      }
    }
  }
}
```

或使用HTTP连接（远程服务器）：

```json
{
  "mcpServers": {
    "harbor": {
      "url": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token"
      }
    }
  }
}
```

## 工具列表

所有工具都需要 `sessionId` 参数来标识玩家会话。

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
| `harbor://session/{sessionId}/state` | 当前会话状态快照 |

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
// 导出
const exported = await client.callTool({
  name: 'export_state',
  arguments: { sessionId: 'player-123' }
});
const stateJson = exported.content[0].text;

// 保存到你的数据库
await myDatabase.save('player-123', stateJson);

// 稍后导入
const stateJson = await myDatabase.load('player-123');
await client.callTool({
  name: 'import_state',
  arguments: { sessionId: 'player-123', stateJson }
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
├── state/
│   └── store.ts          # 状态存储接口
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
| `PORT` | HTTP服务器端口 | 3000 |
| `HOST` | HTTP服务器主机 | 0.0.0.0 |
| `BEARER_TOKEN` | HTTP认证令牌（可选） | - |

## 与外部服务集成

外部服务（如你们团队的聊天服务）应该：

1. **连接MCP服务器**：通过stdio或HTTP SSE
2. **管理会话**：为每个玩家生成 `sessionId`
3. **持久化状态**：定期调用 `export_state` 备份到数据库
4. **LLM集成**：将MCP工具、资源和提示词暴露给LLM
5. **聊天UI**：提供自己的聊天界面

示例流程：
```
玩家 → 你们的聊天服务 → LLM (配置MCP) → MCP服务器 → 游戏引擎
                ↓
          你们的数据库 (存储状态)
```

## 许可

MIT
