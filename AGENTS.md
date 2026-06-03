# Sage — AI Agent

基于 [Pi](https://pi.dev) 引擎的终端 AI 对话 agent。支持 TUI、多模式、技能系统、工具调用。

## 运行

```
npm start        # 启动 TUI
npm run dev      # 同上
npm run build    # tsc 类型检查
npm run test     # 快速集成测试（非 TUI）
```

Flags: `--new <name?>` 跳过会话恢复、`--resume <name?>` 恢复指定会话。

## 技术栈

TypeScript (ESM)，`tsx` 运行。自建 prompt/session/config 层，底层由 Pi 包驱动：

| 层 | Pi 包 | Sage 角色 |
|---|---|---|
| LLM | `@pi-ai` | provider 选择 + apiKey 注入 |
| Agent | `@pi-agent-core` | tool 注册 + memory + steering/follow-up |
| TUI | `@pi-tui` | 自定组件（SageMessages / SageStatusBar）+ 主题 |

## 项目结构

```
src/
├── app.ts               # 入口：加载 config → 建 model → 建 Agent → 建 TUI
├── agent/
│   ├── index.ts         # createSageAgent() 工厂
│   ├── tools.ts          # Sage 自定 tool（web_search / reflect / challenge）
│   └── memory.ts         # compactMemory() 上下文压缩
├── tui/
│   └── index.ts          # TUI 组件：SageMessages / SageStatusBar / 补全 / 快捷键
├── config/
│   ├── loader.ts         # ~/.sage/ 目录初始化、config.json 加载、*.md 扫描
│   └── types.ts          # SageConfig / SageModelConfig
├── core/
│   ├── modes.ts          # 5 种内置模式 + ~/.sage/modes/*.md
│   └── prompts.ts        # buildSystemPrompt(mode, skillNames)
├── session/
│   └── manager.ts        # SessionManager：CRUD、JSON 持久化
├── skills/
│   ├── loader.ts         # 技能加载（内置 + ~/.sage/skills/）
│   └── builtin.ts        # 3 个内置技能 prompt
├── log/
│   └── logger.ts         # JSONL 日志输出
└── test.ts               # 非 TUI 集成测试
```

## 数据流

```
用户输入（Editor）
  → slash 命令解析
  → agent.prompt(text)
  → Agent 事件流:
     message_update (text_delta) → TUI 流式渲染
     message_update (thinking_delta) → TUI 思考显示
     tool_execution_start/end → TUI tool 标签
     agent_end → session 自动保存 + 日志写入
```

## 配置

`~/.sage/config.json`（首次运行自动创建）：
```json
{
  "model": { "provider": "deepseek", "model": "deepseek-v4-pro", "apiKey": "" },
  "defaultMode": "socratic",
  "tavilyApiKey": ""
}
```

`provider` 用 Pi 名称（`deepseek` / `openai` / `anthropic` ...），不是 URL。

扩展目录：
- `modes/*.md` — 自定义对话模式（同名覆盖内置）
- `skills/*.md` — 自定义技能 prompt（同名覆盖内置）
- `rules/*.md` — 全局规则（全部注入 system prompt）
- `sessions/*.json` — 会话存档
- `logs/*.jsonl` — 运行日志

## 内置模式

| 模式 | 行为 |
|------|------|
| `socratic`（默认） | 苏格拉底式提问引导 |
| `direct` | 直接明确，先给结论 |
| `discuss` | 协作讨论 |
| `deep` | 多维深度分析 |
| `perspectives` | 多角色视角合成 |

## 内置技能

- `reflect` — 激活自省模式
- `challenge` — 激活魔鬼代言人模式
- `goal` — 任务分解、逐步推进

## TUI 斜杠命令

- `/mode <name>` — 切换模式（补全 mode 名）
- `/session-new <name?>` — 新会话
- `/session-list` — 列出会话
- `/session-resume <name>` — 恢复会话（补全 session 名）
- `/session-delete <name>` — 删除会话（补全 session 名）
- `/reflect` / `/challenge` / `/goal` — 激活技能
- `/quit` / `/exit` — 退出（Ctrl+C / Ctrl+D 也可）

## 调试

### 日志

每次运行在 `~/.sage/logs/<session-id>.jsonl` 输出结构化日志。**出问题先读日志。**

```
{"ts":"...","type":"session:init","id":"...","mode":"socratic","model":"deepseek-v4-pro"}
{"ts":"...","type":"agent:prompt","text":"What is 2+2?"}
{"ts":"...","type":"tool:start","name":"web_search","args":{"query":"..."}}
{"ts":"...","type":"tool:end","name":"web_search"}
{"ts":"...","type":"agent:response","text":"2+2=4"}
{"ts":"...","type":"session:save","id":"..."}
{"ts":"...","type":"error","message":"...","stack":"..."}
```

所有 API key 自动替换为 `***`。

### 快速诊断

```bash
# 看最后一次运行的所有事件
tail -20 ~/.sage/logs/*.jsonl | sort -t, -k2

# 只看错误
grep '"error"' ~/.sage/logs/*.jsonl

# 只看 LLM 调用
grep '"agent:prompt\|agent:response"' ~/.sage/logs/*.jsonl
```

## 设计文档

架构和历史设计见 `docs/specs/`。
