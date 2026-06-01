# Sage — AI Coding Agent

Claude-Code 风格的终端 AI 对话 agent，支持 TUI、多模式、技能系统、工具调用。

## 运行

```
npm start        # 启动 TUI
npm run dev      # 同上
npm run build    # tsc → dist/
```

Flags: `--new` 跳过会话恢复，开启全新会话。

## 技术栈

TypeScript 5.8 (ES2022, Node16 ESM)，`tsx` 直接运行，`marked` + `marked-terminal` 渲染 Markdown，LLM 走 OpenAI 兼容 `/v1/chat/completions`（默认 DeepSeek）。

## 项目结构

```
src/
├── tui/index.ts         # 入口，TUI 主循环
├── tui/input.ts         # 原始模式输入、多行编辑、历史、Tab 补全
├── tui/renderer.ts      # 流式渲染：spinner、工具调用、Markdown
├── tui/completer.ts     # 斜杠命令自动补全
├── core/loop.ts         # runAgent() 异步生成器，核心 agent 循环
├── core/modes.ts        # 5 种内置模式 + ~/.sage/modes/*.md 自定义模式
├── core/prompts.ts      # 构建 system prompt（模式 + rules + skills）
├── llm/client.ts        # LLMClient：fetch 调用 OpenAI 兼容 API
├── config/loader.ts     # ~/.sage/ 目录初始化、配置加载、*.md 扫描
├── session/manager.ts   # SessionManager：CRUD、自动保存、恢复
├── skills/loader.ts     # 技能加载（内置 + ~/.sage/skills/）
├── tools/               # 工具注册与执行
│   ├── registry.ts      #   ToolRegistry
│   ├── web-search.ts    #   Tavily 搜索
│   ├── web-fetch.ts     #   HTTP fetch + HTML 剥离
│   ├── reflect.ts       #   自省工具（调用 LLM）
│   └── challenge.ts     #   魔鬼代言人工具（调用 LLM）
└── types.ts             # Message, ToolDefinition, AgentEvent 等核心类型
```

## 数据流

```
输入 → InputEditor → /command 解析 → SessionManager + runAgent()
→ 构建 system prompt (mode + rules + skills)
→ LLMClient.stream() → ToolRegistry.execute() → 流式渲染到 Renderer
→ 每轮自动保存会话到 ~/.sage/sessions/<id>.json
```

## 关键类型 (`src/types.ts`)

- `Message` — `{ role, content, tool_calls?, tool_call_id? }`
- `ToolDefinition` — `{ name, description, parameters, execute }`
- `AgentEvent` — `{ type, content?, toolName?, toolCallId?, iteration? }`
  - type: `thinking | tool_call | tool_result | text_chunk | text_done | error | done`
- `AgentConfig` — `{ maxIterations, mode, skills?, onEvent? }`

## 配置

`~/.sage/config.json`（首次运行自动创建）：
```json
{
  "model": { "provider": "https://api.deepseek.com/v1", "model": "deepseek-pro-flash", "apiKey": "" },
  "defaultMode": "socratic",
  "tavilyApiKey": ""
}
```

自定义扩展目录（`~/.sage/` 下）：
- `modes/*.md` — 自定义对话模式（同名覆盖内置）
- `skills/*.md` — 自定义技能（同名覆盖内置）
- `rules/*.md` — 全局规则（全部注入 system prompt）
- `sessions/*.json` — 会话存档

## 内置模式

| 模式 | 行为 |
|------|------|
| `socratic`（默认） | 苏格拉底式提问引导 |
| `direct` | 直接明确，先给结论 |
| `discuss` | 协作讨论 |
| `deep` | 多维深度分析 |
| `perspectives` | 多角色视角合成 |

## 内置技能

- `reflect` — 先调用 reflect 工具自省再回答
- `challenge` — 先调用 challenge 工具评审再回答
- `goal` — 任务分解、逐步推进

## TUI 斜杠命令

- `/mode <name>` — 切换模式
- `/<skill>` — 激活技能
- `/session new|list|resume <id>|delete <id>` — 会话管理
- `/quit | /exit` — 退出（Ctrl+C / Ctrl+D 也可）

## 设计规格

`docs/specs/` 下有 2 份设计文档，决策优先参考这些文档。
