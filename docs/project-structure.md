# 项目结构

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
