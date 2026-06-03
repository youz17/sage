# Sage: Pi Integration Design

## 1. Overview

将 Sage 的手写 agent core、LLM client、TUI 替换为 Pi 的三个底层 npm 包，保留 Sage 的差异化能力（modes、skills、config、session、custom tools）。

```
Sage (重构后)
════════════════════════════════════════════════════
App 入口 (app.ts)
├─ TUI 层 (@pi-tui)
│  ├─ Editor (输入)
│  ├─ Markdown (消息渲染)
│  ├─ Loader (加载动画)
│  └─ Sage 自定主题 + 快捷键
│
├─ Agent 层 (@pi-agent-core)
│  ├─ Agent 实例
│  ├─ 自定 tool (web-search, reflect, challenge)
│  ├─ systemPrompt = mode + rules + skills
│  └─ memory (长期记忆注入)
│
├─ Config 层 (保留)
│  └─ ~/.sage/config.json → Pi model / apiKey
│
├─ Session 层 (保留，改造)
│  └─ 对接 Agent state.messages 做持久化
│
└─ LLM 层 (@pi-ai)
   └─ getModel("deepseek"...), stream()
```

## 2. Dependencies

```json
{
  "dependencies": {
    "@earendil-works/pi-tui": "^latest",
    "@earendil-works/pi-agent-core": "^latest",
    "@earendil-works/pi-ai": "^latest",
    "marked": "^15.0.12",
    "marked-terminal": "^7.3.0"
  }
}
```

`marked` + `marked-terminal` 保留，因为 @pi-tui 的 Markdown 组件需要外部主题注入。

不引入 `@earendil-works/pi-coding-agent` — 那是 opinionated 的成品，不是我们需要的底层积木。

## 3. 文件变更

### 删除

```
src/core/loop.ts         → @pi-agent-core Agent
src/llm/client.ts        → @pi-ai stream/complete
src/tools/registry.ts    → Agent 自带 tool 注册
src/tools/index.ts       → 不再需要
src/tui/index.ts         → @pi-tui TUI
src/tui/input.ts         → @pi-tui Editor
src/tui/renderer.ts      → @pi-tui Markdown
src/tui/completer.ts     → @pi-tui CombinedAutocompleteProvider
src/types.ts             → Pi 类型替代
```

### 新增

```
src/app.ts               → 主入口
src/tui/index.ts          → TUI 组件组装 + 主题 + 快捷键
src/agent/index.ts        → Agent 创建工厂
src/agent/tools.ts        → 注册 Sage tool 到 Agent
src/agent/memory.ts       → 长期记忆注入逻辑
```

### 改造

```
src/config/loader.ts      → 适配 Pi 配置格式
src/session/manager.ts    → 对接 Agent messages state
src/skills/loader.ts      → 改为 Pi extension 格式注册
src/core/modes.ts         → 不变
src/core/prompts.ts       → 改输出格式（agent prompt 构建）
src/tools/web-search.ts   → AgentTool 格式
src/tools/reflect.ts      → AgentTool 格式
src/tools/challenge.ts    → AgentTool 格式
```

## 4. 入口流程 (app.ts)

```
1. loadConfig() → { provider, model, apiKey, defaultMode, tavilyApiKey }
2. getModel(provider, model) → Pi Model 对象
3. createAgent(model, apiKey, config) → Agent 实例
4. createTUI(agent) → TUI 实例
5. tui.start()
```

## 5. TUI 层 (tui/index.ts)

### 组件树

```
TUI
├─ Container (消息区域)
│  ├─ Text (title/slogan)
│  └─ [消息组件列表]
│     ├─ Text (user message)
│     └─ Markdown (assistant response)
├─ Spacer
└─ Editor (输入区域，底部固定)
```

### 主题

定义 Sage 主题，注入 MarkdownTheme、EditorTheme 等：
- 代码块用 Sage 的品牌色
- heading 加颜色区分
- Editor 边框用 Sage 色

### 全局快捷键

| 键 | 动作 |
|---|---|
| Ctrl+C | 退出（保存 session） |
| Ctrl+D | 退出（保存 session） |
| Ctrl+L | 切换模型 |
| Ctrl+P | 切换 mode |
| Esc | 取消当前操作 |

### 斜杠命令处理

在 Editor 的 `onSubmit` 中解析 `/mode`、`/session`、`/quit`、`/skill` 等，调用对应业务逻辑。

斜杠命令自动补全用 `CombinedAutocompleteProvider`。

## 6. Agent 层 (agent/index.ts)

使用 Pi Agent 类的全部能力：事件订阅、steering/follow-up、并行 tool 执行、上下文变换、自定义消息类型、thinking 控制。

### Agent 创建

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt: buildSystemPrompt(mode, skillNames),
    model,
    thinkingLevel: "medium",
    tools: sageTools,
    messages: [],
  },

  // 上下文压缩：超阈值时自动摘要旧消息
  transformContext: async (messages, signal) => {
    const summary = await compactMemory(messages);
    if (summary) return summary;  // 返回替换后的消息列表
    return messages;
  },

  // 将 Sage 自定义消息类型转为 LLM 格式
  convertToLlm: (messages) => {
    return messages.map(m => {
      if (m.role === "memory") {
        return { role: "user", content: m.content };  // 记忆注入为用户消息
      }
      return m;
    });
  },

  // tool 执行前置钩子
  beforeToolCall: async ({ toolCall, args, context }) => {
    // 暂无权限检查需求，保留接口
  },

  // tool 执行后置钩子
  afterToolCall: async ({ toolCall, result, isError, context }) => {
    // 暂无后处理需求，保留接口
  },

  sessionId: currentSessionId,  // 用于 provider prompt caching
});
```

### 事件订阅（驱动 TUI）

```typescript
agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    tui.streamDelta(event.assistantMessageEvent.delta);   // 流式追加到 Markdown
  }
  if (event.type === "tool_execution_start") {
    tui.showToolCall(event.toolName);                     // 显示 tool 调用
  }
  if (event.type === "tool_execution_end") {
    tui.hideToolCall(event.toolCallId);                   // 隐藏 tool 调用
  }
  if (event.type === "agent_end") {
    saveSession(agent.state.messages);                    // 自动保存
  }
});
```

### Steering / Follow-up

```typescript
// Ctrl+T：steering 打断当前执行
agent.steer({ role: "user", content: "Stop! Do this instead.", timestamp: Date.now() });

// 用户键入新消息时，若 agent 正在运行则视为 steering；若已完成则直接 prompt
agent.steeringMode = "one-at-a-time";
agent.followUpMode = "one-at-a-time";
```

### systemPrompt 构建 (来自 core/prompts.ts)

```
系统提示
├─ 模式 prompt (来自 core/modes.ts)
├─ skill prompt (来自 当前激活的 skill)
├─ rules (来自 ~/.sage/rules/*.md)
├─ 记忆提示 (来自 agent/memory.ts)
└─ 基础行为指令
```

mode 切换：直接改 `agent.state.systemPrompt`

skill 激活/停用：重新构建 systemPrompt 并赋值 `agent.state.systemPrompt`

### tool 注册 (agent/tools.ts)

将现有三个 tool 转为 Pi 的 `AgentTool` 格式：

```typescript
import { Type } from "@earendil-works/pi-agent-core";

const webSearchTool: AgentTool = {
  name: "web_search",
  label: "Search Web",
  description: "Search the web for information",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
  }),
  execute: async (toolCallId, params, signal) => {
    const result = await tavilySearch(params.query);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

read/write/bash 等基础 tool 直接使用 `@pi-agent-core` 的内置 tool（如果提供）或从 `pi-coding-agent` 借鉴参数定义。

### 长期记忆 (agent/memory.ts)

**策略：** 当对话 token 接近 context window 上限时，自动摘要早期消息，注入为自定义 `memory` 类型消息。

利用 Agent 的 `transformContext` hook 实现：

```typescript
// agent/memory.ts
export async function compactMemory(
  messages: AgentMessage[],
  signal?: AbortSignal
): Promise<AgentMessage[] | null> {
  const estimatedTokens = estimateTokens(messages);
  if (estimatedTokens < contextWindow * 0.7) return null; // 未达阈值，不压缩

  const splitPoint = Math.floor(messages.length * 0.4);
  const toCompact = messages.slice(0, splitPoint);
  const recent = messages.slice(splitPoint);

  const summary = await llm.complete(
    "Summarize this conversation history concisely, preserving key facts, decisions, and context.",
    toCompact,
    signal
  );

  return [
    { role: "memory", content: `<conversation_memory>\n${summary}\n</conversation_memory>`, timestamp: Date.now() },
    ...recent,
  ];
}
```

`role: "memory"` 是 Sage 通过 declaration merging 扩展的 AgentMessage 类型，在 `convertToLlm` 中映射为 user 消息。

## 7. Config 层 (config/)

保持 `~/.sage/` 目录结构，改造 `loader.ts`：

```typescript
interface SageConfig {
  model: {
    provider: string;  // 映射到 Pi provider: "deepseek" | "openai" | ...
    model: string;     // Pi model id
    apiKey: string;
  };
  defaultMode: string;
  tavilyApiKey: string;
}
```

`loadConfig()` → 读 `~/.sage/config.json`，返回 SageConfig。

## 8. Session 层 (session/)

利用 Agent 的 `state.messages` 和事件流做持久化。

### 保存

```typescript
agent.subscribe(async (event) => {
  if (event.type === "agent_end") {
    const session = {
      id: currentSessionId,
      title: sessionTitle,
      mode: currentMode,
      messages: agent.state.messages,  // AgentMessage[]
      createdAt,
      updatedAt: new Date().toISOString(),
    };
    await saveSession(session);
  }
});
```

### 恢复

```typescript
const session = await loadSession(sessionId);
agent.state.messages = session.messages;
```

### Tree session

Pi 的 session 是树结构，但 Sage 暂时不需要完整支持。可以在保存时记录 parent 关系，`/session list` 只展示叶子。

## 9. Skills 层 (skills/)

Skill 加载逻辑不变（扫 `~/.sage/skills/*.md`），注册方式改为：

1. **轻量 skill**（只有 prompt）：重新调用 `buildSystemPrompt()` 并设置 `agent.state.systemPrompt`
2. **重量 skill**（带 tool）：调用 `agent.state.tools = [...existing, ...skillTools]`

Pi extension 机制可以提供更高级的能力，但首批不追求。

## 10. 数据流

```
用户输入 (Editor.onSubmit)
  ↓
agent.prompt(input)
  ↓
@pi-agent-core 内部循环:
  ├─ build context (messages + systemPrompt)
  ├─ @pi-ai stream(model, context) → LLM
  ├─ 收到 tool_call → execute tool → tool_result → 下一轮
  └─ 收到 text → text_done
  ↓
agent 事件流:
  ├─ message_start (assistant)
  ├─ message_update / text_delta → TUI 追加到 Markdown
  ├─ tool_execution_start → TUI 显示 spinner
  ├─ tool_execution_end → TUI 隐藏 spinner
  └─ message_end → TUI 完成渲染
  ↓
agent_end → Session 自动保存
```

## 11. 不做的事

- **不迁移到 pi-coding-agent** — 那是别人的完整 harness
- **不复刻 Pi 的 package 系统** — Sage 的 skill 系统够用
- **不支持 Pi 的 RPC 模式** — 只需要 TUI
- **不搞 tree session 的完整前端** — 后端留结构即可

## 12. 风险

| 风险 | 缓解 |
|---|---|---|
| Pi API v0.x 不稳定 | `package.json` 锁定精确版本号（^x.y.z 而非 latest），升级前在分支验证 |
| Pi 不了解 | 先跑通最小 demo，逐个子系统接入 |
| 自定 TUI 组件太难 | @pi-tui 的 Component 接口只需实现 `render` + `handleInput` |
| 性能（TypeBox 校验）| tool 数量 < 10，忽略 |

## 13. 补充行为说明

### `--new` flag

启动时不加载上次 session，`agent.state.messages = []`，创建新 session id。

### 记忆压缩阈值

当 `agent.state.messages` 估算 token 超过 context window 的 70% 时，取最早 40% 消息做 LLM 摘要，注入为记忆消息，删除原文。

### Pi 版本

实现时锁定最新可用版本。初次实施用的版本写在 lock 文件中，后续单独处理升级。
