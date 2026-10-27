# 文字代理 (Text Agent)

《海湾新生活》的文字冒险版本。玩家通过与LLM代理对话来玩游戏，无需打开2D游戏界面。

## 架构

### 核心组件

1. **状态渲染器** (`core/state-renderer.ts`)
   - 将游戏状态转换为紧凑的文本摘要
   - 包含当前场景、可互动的人/物品、出口、物品、目标等
   - 格式化为LLM提示词

2. **游戏工具** (`core/game-tools.ts`)
   - 将游戏动作暴露为LLM工具定义
   - 基于当前状态动态生成可用工具
   - 包括：观察场景、交谈、介绍、互动、移动、查看状态等

3. **工具执行器** (`core/tool-executor.ts`)
   - 执行LLM工具调用，应用到游戏引擎
   - 所有游戏逻辑和验证由游戏引擎处理
   - 工具结果总是包含玩家接下来可以做什么

4. **代理循环** (`core/agent-loop.ts`)
   - 管理LLM交互与工具调用
   - 支持OpenAI兼容的API (OpenAI、Azure、本地模型等)
   - 每回合提供2-4个建议行动

5. **会话管理** (`core/session-manager.ts`)
   - 使用SQLite持久化玩家会话
   - 每个玩家ID对应独立的游戏存档

### 接口

- **CLI** (`interfaces/cli.ts`) - 命令行交互式聊天
- **HTTP** (`interfaces/http-server.ts`) - REST API服务器
- **Web UI** (`interfaces/chat.html`) - 简单的网页聊天界面

### 复用性设计

核心组件设计为通用：
- `state-renderer.ts` - 可适配其他状态结构
- `game-tools.ts` - 可扩展为其他动作集
- `agent-loop.ts` - 提供者无关的LLM接口
- `session-manager.ts` - 通用会话存储

游戏特定逻辑集中在：
- 具体工具定义
- 状态字段映射
- 游戏规则验证（由`src/story/state.ts`处理）

## 环境变量

必需：
- `OPENAI_API_KEY` 或 `LLM_API_KEY` - LLM API密钥

可选：
- `LLM_BASE_URL` - 自定义API端点（默认：OpenAI）
- `LLM_MODEL` - 模型名称（默认：gpt-4o-mini）
- `GAME_LOCALE` - 游戏语言，zh或en（默认：zh）
- `SESSION_DB_PATH` - 会话数据库路径（默认：.data/text-agent-sessions.sqlite）
- `TEXT_AGENT_PORT` - HTTP服务器端口（默认：3456）
- `TEXT_AGENT_HOST` - HTTP服务器主机（默认：127.0.0.1）

## 运行方式

### CLI聊天

```bash
# 使用环境变量
export OPENAI_API_KEY=sk-...
npm run text-agent:cli

# 或指定玩家ID
npm run text-agent:cli my-player-id
```

### HTTP服务器

```bash
export OPENAI_API_KEY=sk-...
npm run text-agent:http

# 然后访问 http://127.0.0.1:3456/
# 或使用API: POST http://127.0.0.1:3456/api/chat
```

API示例：
```json
POST /api/chat
{
  "player_id": "player-123",
  "message": "四处看看",
  "locale": "zh"
}

响应：
{
  "message": "你站在车站街...",
  "suggested_actions": ["和玛拉打招呼", "去咖啡馆", "去租屋"],
  "state_changed": false
}
```

### 测试

```bash
# 运行工具层测试
npm run text-agent:test

# 运行演示流程（无需LLM API）
npm run text-agent:demo
```

## 测试与演示

- **工具测试** (`tests/tool-tests.ts`)
  - 验证每个工具正确操作游戏状态
  - 覆盖观察、交谈、移动、互动等
  
- **演示流程** (`tests/demo-transcript.ts`)
  - 模拟完整玩法：从抵达小镇到完成第一个任务
  - 无需LLM API密钥，使用预定义工具调用
  - 证明玩家可通过文字冒险取得实际进展

## 已知限制

当前版本范围内明确排除的功能：

1. **多客户端并发/锁定** - 2D网页版和文字代理之间没有锁定机制
2. **移动旅行时间** - 移动是即时的（future可加旅行时间）
3. **钓鱼小游戏** - 当前简化为工具调用（future可扩展为多轮交互）
4. **战斗小游戏** - 类似钓鱼，简化为单次动作
5. **拼图** - 当前未实现（需要特殊工具参数）

这些是设计决策，不是bug。可在后续版本扩展。

## 扩展到其他RPG

要将此系统适配到其他RPG：

1. 实现状态渲染器 - 提取当前场景/选项
2. 定义游戏工具 - 映射游戏动作
3. 集成游戏引擎 - 工具执行器调用游戏逻辑
4. 复用代理循环、会话管理、接口

核心架构（LLM循环、工具调用、会话管理）无需修改。
