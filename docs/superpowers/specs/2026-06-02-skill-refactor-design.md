# Skill 机制重构设计

> 日期: 2026-06-02 | 状态: 设计完成

## 动机

当前 skill 机制有两个问题：

1. **无 auto/manual 区分** — 所有 skill 必须手动 `/name` 激活，无法像 Claude Code 一样让 auto skill 自动可用
2. **内置 skill 硬编码** — `reflect`/`challenge`/`goal` 写在 `src/skills/builtin.ts` 中（TypeScript 字符串），与自定义 skill（`.md` 文件）格式不统一

## 目标

- 支持 `type: auto` 和 `type: manual` 两种 skill，auto skill 通过 `use_skill` 工具由 LLM 自主激活
- 内置 skill 统一为 `.md` 文件格式（YAML frontmatter + Markdown 正文）
- 与 Claude Code skill 机制对齐

---

## 1. Skill 文件格式

### Frontmatter 规格

```markdown
---
type: auto | manual
description: 一句话描述（auto skill 时必须填写）
---

## 指令

完整的 skill prompt 正文，Markdown 格式。
```

- `type` — 必填
  - `auto`: 始终可用。description 注入 system prompt，LLM 通过 `use_skill` 工具激活后获取完整 prompt
  - `manual`: 仅用户输入 `/name` 或 `/` 补全激活，完整 prompt 直接注入本轮 system prompt
- `description` — auto skill 必须填写，manual 可选。注入 system prompt 让 LLM 知道此 skill 的存在

### 内置 skill 示例

`src/skills/builtin/reflect.md`:
```markdown
---
type: manual
description: 回答前先自省反思
---

在给出最终回复之前，你必须调用 `reflect` 工具审视你的回答是否存在问题。在 reflect 返回结果后，根据需要修正你的回答。
```

`src/skills/builtin/challenge.md`: (同样结构，type: manual)

`src/skills/builtin/goal.md`: (同样结构，type: manual)

> reflect/challenge 设为 manual 而非 auto，因为每次触发都会额外调用一次 LLM（翻倍延迟和 token 消耗），不适合自动激活。

---

## 2. 文件布局

```
src/skills/
├── index.ts              # 公共导出
├── loader.ts             # 扫描、解析 frontmatter、分类 auto/manual、构建 use_skill 工具
└── builtin/              # 内置 skill（.md 文件，与自定义格式一致）
    ├── reflect.md
    ├── challenge.md
    └── goal.md

~/.sage/skills/           # 自定义 skill（同名覆盖内置）
├── code-review.md
└── ...
```

原 `src/skills/builtin.ts` 删除。

---

## 3. 加载流程

```
启动时:
  1. 扫描 src/skills/builtin/*.md   → Map<name, Skill>
  2. 扫描 ~/.sage/skills/*.md       → Map<name, Skill>（同名覆盖内置）
  3. 合并后按 type 分类:
     ├─ auto[]   → 注册 use_skill 工具，description 注入 system prompt
     └─ manual[] → 等待 /name 输入激活

运行时 /name 输入:
  → 从合并 map 取 skill（auto 和 manual 皆可手动激活）
  → 注入完整 prompt 到本轮 system prompt
```

---

## 4. `use_skill` 工具

### 工具注册

**仅当存在 auto skill 时**注册 `use_skill` 工具。零个 auto skill 时不注册该工具，也不注入 auto skill 相关 prompt。

```typescript
{
  name: "use_skill",
  description: "Activate a skill to get its full instructions and capabilities",
  parameters: {
    type: "object",
    properties: {
      skill: {
        type: "string",
        enum: ["code-review", "debugging", ...], // 全部 auto skill 名
        description: "The skill to activate"
      }
    },
    required: ["skill"]
  }
}
```

### Agent loop 拦截

`src/core/loop.ts` 中 `use_skill` 不经过 ToolRegistry 执行：

1. 拦截 `use_skill` 调用
2. 从 skill map 取完整 prompt
3. 构造 tool result: `"Skill 'xxx' activated. Instructions:\n<完整正文>"`
4. 追加 `tool` message 到上下文
5. LLM 继续（自动携带 skill 指令）

重复激活同一 skill 时返回 `"Skill 'xxx' is already active."`，不重复注入。

---

## 5. System prompt 变化

**仅当存在 auto skill 时**，`src/core/prompts.ts` 新增 auto skill 列表段落。零个 auto skill 时不注入此段落，也不注册 `use_skill` 工具。

```
## Available Skills

You can call the `use_skill` tool to activate any of these skills when relevant:

- code-review: 用资深工程师视角 review 代码变更，关注正确性/安全/可维护性
- debugging: 系统化调试流程
- ...
```

---

## 6. 类型变化

```typescript
// src/skills/loader.ts
interface SkillFrontmatter {
  type: "auto" | "manual";
  description?: string;
}

interface Skill {
  name: string;
  type: "auto" | "manual";
  description?: string;
  prompt: string;        // frontmatter 之后的 markdown 正文
}
```

`src/types.ts` 中 `AgentConfig.skills` 无需改动（仍为 `string[]`）。

---

## 7. 影响范围

| 文件 | 改动 |
|------|------|
| `src/skills/builtin.ts` | **删除** |
| `src/skills/builtin/*.md` | **新增** — 3 个内置 skill |
| `src/skills/loader.ts` | **重写** — frontmatter 解析、auto/manual 分类、use_skill 工具构建 |
| `src/skills/index.ts` | 更新导出 |
| `src/core/loop.ts` | 拦截 `use_skill` 调用；auto skill description 注入 |
| `src/core/prompts.ts` | 新增 auto skill 列表段落 |
| `src/tui/index.ts` | 注册 `use_skill` 到 ToolRegistry；skill 解析逻辑微调 |
| `src/tui/completer.ts` | 补全列表增加 description 提示 |
| `src/types.ts` | `Skill` 接口无变化（skill 内部类型在 loader.ts） |

不涉及：`tools/`、`config/`、`session/`。

---

## 决策记录

- **skill 格式**: YAML frontmatter（生态通用，与 Claude Code 对齐）
- **auto skill 分发**: `use_skill` 工具 + agent loop 拦截（与 Claude Code 对齐，LLM 自主决策）
- **reflect/challenge**: 保持 manual（避免每轮额外 LLM 调用的延迟/成本）
- **内置 skill**: 改为 `.md` 文件，与自定义 skill 统一格式
- **向后兼容**: 不处理（用户确认无需兼容旧格式）
