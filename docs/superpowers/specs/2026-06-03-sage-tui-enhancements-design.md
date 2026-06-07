# Sage: Status Bar + Two-Level Autocomplete + Thinking Display

## 1. Overview

给 Sage TUI 增加三个功能：
1. **状态栏** — Editor 上方显示当前 mode、thinking level、model、激活的 skill
2. **通用二级补全** — `/mode ` 自动补全 mode 名，`/session ` 补全子命令
3. **思考内容展示** — 消息区域显示 Agent 的 thinking 过程

## 2. 通用二级补全

### 命令定义扩展

```typescript
interface SlashCommand {
  name: string;
  description: string;
  completions?: () => string[];  // 可选二级补全
}
```

实例：
```typescript
const SLASH_COMMANDS: SlashCommand[] = [
  { name: "mode", description: "切换模式", completions: () => getAllModeNames() },
  { name: "session-new", description: "创建新会话" },
  { name: "session-list", description: "列出所有会话" },
  { name: "session-resume", description: "恢复会话", completions: () => SessionManager.list().map(s => s.title || s.id) },
  { name: "session-delete", description: "删除会话", completions: () => SessionManager.list().map(s => s.title || s.id) },
  { name: "reflect", description: "激活 reflect skill" },
  { name: "challenge", description: "激活 challenge skill" },
  { name: "goal", description: "激活 goal skill" },
  { name: "quit", description: "退出" },
  { name: "exit", description: "退出" },
];
```

### 实现

`SageAutocompleteProvider`：
- 前缀匹配 `/xxx` 且无空格 → 返回所有命令名
- 前缀匹配 `/xxx <partial>` → 调用该命令的 `completions()`，过滤 `partial` 前缀
- 其他 → 委托文件补全

### SageAutocompleteProvider

实现 Pi 的 `AutocompleteProvider` 接口：

```typescript
class SageAutocompleteProvider implements AutocompleteProvider {
  constructor(
    private commands: SlashCommand[],
    private basePath: string
  ) {}

  getCompletions(text: string, cursorPos: number): Completion[] {
    const prefix = text.slice(0, cursorPos);
    const match = prefix.match(/^\/(\w+)\s+(.*)?$/);
    if (match) {
      const cmd = this.commands.find(c => c.name === match[1]);
      if (cmd?.completions) {
        const items = typeof cmd.completions === "function" ? cmd.completions() : cmd.completions;
        const partial = match[2] ?? "";
        return items.filter(i => i.startsWith(partial)).map(i => ({ label: i, value: i }));
      }
    }
    // Fallback: file completion via CombinedAutocompleteProvider
    const fileProvider = new CombinedAutocompleteProvider(this.commands, this.basePath);
    return fileProvider.getCompletions(prefix, cursorPos);
  }
}
```

```typescript
// SageTUI 接口新增
interface SageTUI {
  // ... existing
  onThinkingDelta: (delta: string) => void;
  updateStatus: (props: { mode: string; thinkingLevel: string; modelName: string; skills: string[] }) => void;
}
```

## 3. 状态栏

### 组件

`SageStatusBar` 实现 `Component`：
- 单行 Text，显示格式：`Mode: xxx | Think: xxx | Model: xxx | Skills: xxx, xxx`
- 宽度自适应，超出时截断
- 暴露 `update(mode, thinkingLevel, modelName, skills)` 方法

### 触发更新

| 事件 | 更新内容 |
|---|---|
| 用户切换 mode | statusBar.update(mode, ...) |
| 用户激活/停用 skill | statusBar.update(..., skills) |
| 用户切换模型 (Ctrl+L) | statusBar.update(..., model) |

## 4. 思考内容展示

### 渲染位置

消息区域内，assistant 文本流之上，以 dim 风格显示当前轮的思考：

```
  [thinking]
  Let me think about this step by step...
  First analyze the question, then formulate response.
  [/thinking]
```

### 实现

在 `SageMessages` 中增加 `_thinkingContent` 字段，订阅 `thinking_delta` 事件时追加内容。开始新 assistant 消息时清空。用 `chalk.gray.italic` 渲染。

在 `app.ts` 的 agent.subscribe 中新增事件处理：
```typescript
if (event.type === "message_update") {
  const ae = (event as any).assistantMessageEvent;
  if (ae?.type === "thinking_delta") {
    tui.onThinkingDelta(ae.delta);
  }
}
```

## 5. Session 增强

### 命令形式

| 命令 | 功能 | 补全 |
|---|---|---|
| `/session-new <名称?>` | 创建新会话，可选自定义名称 | 无 |
| `/session-list` | 列出所有会话 | 无 |
| `/session-resume <名称>` | 模糊匹配 title 或 id 恢复会话 | ✅ 现有 session title(id) |
| `/session-delete <名称>` | 模糊匹配 title 或 id 删除会话 | ✅ 现有 session title(id) |

### Session 名称规约

- Session 有 title 时显示 title，无 title 时 fallback 到 id
- `SessionManager.list()` 返回的 title 字段设为 `title || id`
- resume/delete 模糊匹配同时查 title 和 id

### 命令行参数

```bash
sage --new my-session    # 创建新会话，名称 my-session
sage --new               # 创建新会话，自动标题
sage --resume my-...     # 恢复指定名称的会话（模糊匹配）
sage --resume             # 恢复最近一个会话
```

`src/app.ts` 启动时解析 `process.argv`：
- 遇到 `--new` → 取下一个非 flag 参数为名称，`sessionManager.newSession(mode)` + 设 title
- 遇到 `--resume` → 取下一个参数为名称片段，`SessionManager.list()` 模糊匹配 title 或 id

## 6. 数据流

```
agent.prompt(input)
  ↓
agent 事件流:
  thinking_delta → tui.onThinkingDelta → SageMessages.appendThinking
  text_delta → tui.onStreamDelta → SageMessages.appendDelta
  tool_execution_start → tui.onToolCallStart → SageMessages.addToolCall
  agent_end → auto-save
```

## 7. 文件变更

| 文件 | 变更 |
|---|---|
| `src/tui/index.ts` | 新增 `SageStatusBar`、`SageAutocompleteProvider`、`SlashCommand` 类型；`SageMessages` 加 think 渲染；`SageTUI` 接口加 `onThinkingDelta`、`updateStatus` |
| `src/app.ts` | `agent.subscribe` 加 thinking 事件；mode/skill 变化时调用 `tui.updateStatus()`；解析 `--new <name>` / `--resume <name>` 参数 |
