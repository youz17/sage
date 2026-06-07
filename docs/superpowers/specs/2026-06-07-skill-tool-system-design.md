# Skill Tool System 设计

## 目标

让 skill 不只是注入 prompt 指令，还能提供可被 LLM 调用的外部工具（脚本/命令）。例如股票分析 skill 可以提供 `fetch_kline`、`get_price` 等工具。

## 现状

Sage 的 Skill 和 Tool 是两个完全独立的系统：
- **Skill**：`.md` 文件，通过 `use_skill` 工具激活，注入 prompt 指令
- **Tool**：TypeScript `AgentTool` 对象，在 `createSageAgent` 中硬编码注册（`webfetch`、`web_search`、`use_skill`）

两个系统无交集。要让 skill 带工具，需要建立二者之间的关联。

## 设计

### 1. Skill 目录结构

Skill 从单文件升级为可选目录。没有目录的同名 `.md` 文件保持向后兼容。

```
~/.sage/skills/stock-analyzer/
├── skill.md          # prompt 指令（现有格式，可为空 body）
├── tools.json        # 工具定义（新增，可选）
└── fetch_kline.py    # 脚本文件（skill 作者自行提供）
```

- `skill.md` 保持现有 YAML frontmatter 格式：`type: auto | manual`，`description`
- `skill.md` 的 body 可以为空——空 body 时 `use_skill` 只激活工具，不注入 prompt 指令
- `type` 字段决定该 skill 是否出现在 `<available_skills>` 列表（`auto` 出现，`manual` 不出现）以及是否走 `use_skill` 入口
- 没有 `tools.json` 的 skill 保持现有行为（纯 prompt 注入）
- 没有 `skill.md` 的目录不被视为 skill

### 2. tools.json 格式

```jsonc
{
  "tools": [
    {
      "name": "fetch_kline",
      "label": "获取K线",
      "description": "获取A股日K线数据。code 为股票代码如 000001",
      "parameters": {
        "code": {
          "type": "string",
          "required": true,
          "description": "股票代码，如 000001 或 sh600000"
        },
        "period": {
          "type": "string",
          "required": false,
          "description": "K线周期：daily（日线）、weekly（周线）、monthly（月线）"
        }
      },
      "command": "python {{skillDir}}/fetch_kline.py --code '{{code}}' --period '{{period}}'",
      "timeout": 60000
    }
  ]
}
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 工具名，LLM tool call 用。全局唯一，重复视为错误 |
| `label` | 是 | UI 显示用，如 "获取K线" |
| `description` | 是 | LLM 理解工具用途 |
| `parameters` | 是 | 参数定义。key 为参数名，value 含 `type`（仅 `"string"`）、`required`、`description` |
| `command` | 是 | 命令模板。支持 `{{skillDir}}`、`{{paramName}}` 占位符 |
| `timeout` | 否 | 超时毫秒数，默认 30000，上限 300000 |

**占位符：**
- `{{skillDir}}`：执行时替换为 skill 目录的绝对路径
- `{{paramName}}`：执行时替换为 LLM 传入的参数值（已做 shell 转义）。若参数标记为 `required: false` 且 LLM 未传值，占位符替换为空字符串

**参数类型：** 第一期只支持 `"string"` 类型。命令行参数天然是字符串，不需要 number/boolean 的复杂映射。

### 3. ToolManager

一个新模块，管理"全量已扫描工具"和"当前活跃工具子集"。

```typescript
class ToolManager {
  // 基础工具（webfetch, web_search, use_skill），始终活跃
  private baseTools: AgentTool[];

  // 全量工具：skillName → AgentTool[]
  private allTools: Map<string, AgentTool[]>;

  // 当前已激活的 skill 名集合
  private activeSkillNames: Set<string>;

  // Agent 引用，用于同步工具列表
  private agent: Agent;

  constructor(baseTools: AgentTool[], skillsDir: string, agent: Agent);

  /** 激活指定 skill 的工具。幂等：重复调用无效。 */
  activate(skillName: string): void;

  /** 反激活。目前不需要，预留。 */
  deactivate(skillName: string): void;

  /** 从持久化列表批量恢复激活状态 */
  activateFrom(skillNames: string[]): void;

  /** 获取当前活跃 skill 名列表（用于 session 持久化） */
  getActiveSkillNames(): string[];

  /** 获取当前活跃的完整 AgentTool 列表 */
  getActiveTools(): AgentTool[];

  /** 获取指定 skill 的工具描述文本（注入 use_skill 返回内容） */
  getToolDescriptions(skillName: string): string | null;

  /** 获取指定 skill 的工具数量 */
  getToolCount(skillName: string): number;

  /** 获取指定 skill 的 AgentTool 列表 */
  getSkillTools(skillName: string): AgentTool[];

  /** 将当前活跃工具同步到 agent.state.tools */
  private syncToAgent(): void;
}
```

**`syncToAgent()`** 全量重建工具列表：

```
agent.state.tools = [...baseTools, ...所有 activeSkillNames 对应的工具]
```

**activate 幂等性：** `activeSkillNames` 是 `Set<string>`，重复调用不会导致工具数组膨胀。

### 4. tools.json → AgentTool 转换

`ToolManager` 启动时扫描所有 skill 目录，将 `tools.json` 中的每个工具定义转换为 `AgentTool` 对象存储。

**TypeBox schema 构建：** 遍历 `parameters`，每个参数生成 `Type.String({ description })`。required 参数不包装；非 required 用 `Type.Optional(Type.String(...))`。

**命令执行：**

```
① 模板替换：{{skillDir}} → 绝对路径，{{param}} → 转义后的参数值
② child_process.exec(command, { cwd: skillDir, timeout: toolDef.timeout })
③ stdout → 截断（100KB）→ { type: "text", text }
④ 非零 exit → throw Error(stderr)
⑤ AbortSignal 传递给子进程
```

如果 `tools.json` 不存在或 JSON 解析失败，静默跳过该 skill 的工具（`console.warn` 日志），不影响其他 skill 和 skill prompt 功能。

### 5. Shell 转义

参数值用单引号包裹后拼入命令：

```typescript
function escapeShell(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}
```

标准 bash 转义技法——单引号内唯一特殊字符是单引号本身，用 `'\''` 断开。

### 6. use_skill 改造

当前 `use_skill` 只做两件事：查 skill → 返回 prompt。

改造后：

```
execute(skillName):
  ① 查 skill（现有逻辑）
  ② 如果 skill 有 tools.json → toolManager.activate(skillName)
  ③ 构建返回内容：
      - 如果有 body → 现有 XML 格式不变
      - 追加工具列表文本（如果有工具）："此技能提供了以下工具：\n- fetch_kline: 获取A股日K线数据\n- get_price: 获取实时股价"
      - 如果无 body 也无工具 → 返回未找到
  ④ 返回 { content: [...], details: { skillName, toolsActivated: N } }
```

工具通过 `agent.state.tools = [...]` 在 `use_skill` 执行时生效。Agent 在下一轮 `prompt()` 时会读取最新 tools 数组，LLM 即可调用新工具。

不需要 `prepareNextTurn` 回调——`use_skill` 执行完毕 → 返回文本给 LLM → 当前轮结束 → 下一轮 LLM 自然看到新工具列表。

### 7. 会话持久化

Session JSON 新增 `activeSkills` 字段：

```json
{
  "id": "2026-06-07-session-id",
  "name": "stock analysis",
  "mode": "default",
  "messages": [...],
  "activeSkills": ["stock-analyzer"]
}
```

- **保存：** 会话结束时从 `toolManager.getActiveSkillNames()` 获取列表写入
- **恢复：** 新会话或恢复会话时，调用 `toolManager.activateFrom(activeSkills)` 重建活跃工具
- **向后兼容：** 旧 session JSON 没有此字段 → 视为空数组，不影响加载

### 8. 错误处理

| 层级 | 场景 | 行为 |
|------|------|------|
| 加载 | `tools.json` 不存在 / 解析失败 / 参数不合法 | 静默跳过，`console.warn` 日志。不影响该 skill 的 prompt 功能和其他 skill |
| 执行 | 脚本不存在 / 超时（>300s 强制杀掉） | 子进程抛 Error，Agent 将 error.message 作为 tool result 返回给 LLM |
| 执行 | 非零 exit code | stderr 内容作为 error.message 返回给 LLM |
| 执行 | 参数注入攻击 | `escapeShell()` 已转义 |
| 加载 | 工具名重复 | 启动时警告，后者覆盖前者（按扫描顺序） |

### 9. 安全

明确声明：skill 脚本以用户权限运行，不做沙箱、不做权限检查、不做进程隔离。用户安装第三方 skill 前应自行审查。

仅做最低限度的卫生措施：
- `{{skillDir}}` 占位符不允许逃逸到 skill 目录之外
- 超时硬上限：300 秒
- 参数值做 shell 转义（`escapeShell`）

### 10. 兼容性

- 没有 `tools.json` 的 skill → 行为完全不变
- 现有 `Skill` 接口、`SkillFrontmatter`、`buildAutoSkillPrompt` 等全部不动
- 现有基础工具（`webfetch`、`web_search`、`use_skill`）不受影响
- 旧 session JSON 没有 `activeSkills` 字段 → 恢复时视为空数组

### 11. 测试策略

| 类型 | 内容 |
|------|------|
| 单元 | `escapeShell()` 边界测试（空字符串、单引号、特殊字符）；模板替换正确性；`activate` 幂等性；`tools.json` 解析各种异常路径 |
| 集成 | 创建临时 skill 目录 + 简单脚本（如 `echo` 按参数输出），验证 `use_skill` → tool call → stdout 完整链路 |
| 回归 | 无 `tools.json` 的 skill 行为不变；基础工具不受影响；session 持久化/恢复正确 |
