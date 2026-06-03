# Sage — AI Agent

基于 [Pi](https://pi.dev) 引擎的终端 AI 对话 agent。支持 TUI、多模式、技能系统、工具调用。

## 运行与开发

```
npm start        # 启动 TUI
npm run dev      # 同上
npm run build    # tsc 类型检查
npm run test     # 非 TUI 集成测试
```

CLI flags 详见 `docs/usage.md`。

## 项目结构

```
src/
├── app.ts               # 入口：加载 config → 建 model → 建 Agent → 建 TUI
├── agent/
│   ├── index.ts         # createSageAgent() 工厂（Agent 类 + hooks）
│   ├── tools.ts          # Sage 自定 tool（web_search / reflect / challenge）
│   └── memory.ts         # compactMemory() — transformContext 中上下文压缩
├── tui/
│   └── index.ts          # TUI 组件（SageMessages / SageStatusBar / 补全 / 快捷键）
├── config/
│   ├── loader.ts         # ~/.sage/ 目录初始化、config.json 加载、*.md 扫描
│   └── types.ts          # SageConfig / SageModelConfig
├── core/
│   ├── modes.ts          # 5 种内置模式 + ~/.sage/modes/*.md 覆盖
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
  → slash 命令解析（/mode /session-* /skill）
  → agent.prompt(text)
  → Agent 事件流:
     message_update (text_delta) → TUI 流式渲染
     message_update (thinking_delta) → TUI 思考显示
     tool_execution_start/end → TUI tool 标签
     agent_end → session 自动保存 + 日志写入
```

## 技术栈

TypeScript (ESM)，`tsx` 运行。自建 prompt/session/config 层，底层引擎：

| 层 | 包 | Sage 角色 |
|---|---|---|
| LLM | `@pi-ai` | provider 选择 + apiKey 注入 |
| Agent | `@pi-agent-core` | tool 注册 + memory + steering/follow-up |
| TUI | `@pi-tui` | 自定组件 + 主题 |

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

## 调试

### 日志

出问题先读 `~/.sage/logs/<session-id>.jsonl`。

```bash
# 看最后一次运行的事件
tail -20 ~/.sage/logs/*.jsonl

# 只看错误
grep '"error"' ~/.sage/logs/*.jsonl

# 只看 LLM 调用
grep '"agent:prompt\|agent:response"' ~/.sage/logs/*.jsonl
```

日志格式：
```jsonl
{"ts":"...","type":"session:init","id":"...","mode":"socratic","model":"deepseek-v4-pro"}
{"ts":"...","type":"agent:prompt","text":"What is 2+2?"}
{"ts":"...","type":"tool:start","name":"web_search","args":{"query":"..."}}
{"ts":"...","type":"tool:end","name":"web_search"}
{"ts":"...","type":"agent:response","text":"2+2=4"}
{"ts":"...","type":"session:save","id":"..."}
```

所有 API key 自动替换为 `***`。

## 设计文档

`docs/specs/` — 架构设计规格
`docs/usage.md` — 模式/技能/命令使用指南
