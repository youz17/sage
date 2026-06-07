# Sage — AI Agent

基于 [Pi](https://pi.dev) 引擎的终端 AI 对话 agent。支持 TUI、多模式、技能系统、工具调用。

## 技术栈

TypeScript (ESM)，`tsx` 运行。自建 prompt/session/config 层，底层引擎：

| 层 | 包 | Sage 角色 |
|---|---|---|
| LLM | `@pi-ai` | provider 选择 + apiKey 注入 |
| Agent | `@pi-agent-core` | tool 注册 + memory + steering/follow-up |
| TUI | `@pi-tui` | 自定组件 + 主题 |

## AI 行为约束

### 文档同步

- 修改 `src/` 中任何模块后，检查 `AGENTS.md` 和 `docs/` 下的描述是否仍然准确，必要时同步更新
- 新增功能涉及 CLI 或模式/技能时，更新 `docs/usage.md`
- 架构级改动（新增模块、数据流变化）需更新 `docs/specs/` 对应设计文档
- 项目结构调整时更新 `docs/project-structure.md`

### 测试要求

- 每次代码改动后，运行 `npm run build`（类型检查）和 `npm run test`（集成测试），确保通过后才算完成
- 新增功能或修 bug 需补充或更新 `src/test.ts` 中的对应测试

### Agent 方案设计

- 涉及 agent 架构、prompt 组织、skill 系统、工具调用等方案设计时，在给出意见或执行前，先参考 Claude Code、OpenCode、pi-agent 等现有 agent 产品的设计，避免闭门造车

## 设计文档

- `docs/usage.md` — 模式/技能/命令使用指南
- `docs/project-structure.md` — 项目结构
- `docs/developing.md` — 运行命令、配置、调试
- `docs/specs/` — 架构设计规格
