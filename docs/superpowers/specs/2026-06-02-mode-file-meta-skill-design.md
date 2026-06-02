# Mode 文件化 & 新增 meta-skill 设计

> 日期: 2026-06-02 | 状态: 设计完成

## 动机

1. **Mode 硬编码** — 5 个内置 mode 写在 `src/core/modes.ts` 中，和改版前 skill 一样的问题
2. **Mode 过剩** — `socratic`/`direct`/`deep`/`perspectives` 要么和 `discuss` 重叠，要么太偏门不应内置
3. **缺 meta-skill** — 没有帮用户创建 skill/mode/rule 的 skill

## 目标

- Mode 统一为 .md 文件格式（和 skill 一致）
- 内置 mode 精简为 `default`（空注入）+ `discuss`
- 新增 `write-skill`、`write-mode`、`write-rule` 三个 meta-skill

---

## 1. Mode 文件格式

```markdown
---
description: 一句话描述
---

完整的 mode prompt 正文（Markdown）
```

- `description` — 显示在 `/mode` 补全列表中
- 正文为空时表示不做任何风格注入

### 内置 mode

`src/core/builtin/default.md`:
```markdown
---
description: 默认模式，使用模型原生行为
---

```

`src/core/builtin/discuss.md`:
```markdown
---
description: 协作讨论模式，多元视角、权衡分析
---

## Communication Mode: Discussion

- Engage as a thoughtful discussion partner, not an answer machine.
- Ask probing questions to understand the user's perspective and constraints.
- Present multiple viewpoints and trade-offs before settling on a position.
- Help the user think through the problem rather than just giving an answer.
- Challenge assumptions constructively when you spot them.
```

### 加载逻辑

1. 扫描 `src/core/builtin/*.md` → `Map<name, Mode>`
2. 扫描 `~/.sage/modes/*.md` → 同名覆盖内置
3. `default` 为默认 mode（启动时不指定时的 fallback）

---

## 2. 新增 meta-skill

### write-skill

`src/skills/builtin/write-skill.md`:
```markdown
---
type: manual
description: 按规范创建新的 skill 文件（YAML frontmatter）
---

用户想要创建一个新的 skill。按以下流程操作：

1. 与用户讨论、理解这个 skill 的用途和场景。
2. 判断 type 应该是 auto 还是 manual：
   - **auto**：通用背景技能，LLM 自行判断何时激活
   - **manual**：特定工作流或强制工具调用，用户主动 /name 调用
3. 按 YAML frontmatter 格式写出完整的 skill 内容。
4. 将文件写入 `~/.sage/skills/<name>.md`。
```

### write-mode

`src/skills/builtin/write-mode.md`:
```markdown
---
type: manual
description: 按规范创建新的 mode 文件
---

用户想要创建一个新的 mode。按以下流程操作：

1. 与用户讨论、理解这个 mode 的沟通风格和适用场景。
2. 按 YAML frontmatter 格式写出完整的 mode 内容。
3. 将文件写入 `~/.sage/modes/<name>.md`。
```

### write-rule

`src/skills/builtin/write-rule.md`:
```markdown
---
type: manual
description: 按规范创建新的 rule 文件
---

用户想要创建一个新的 rule。按以下流程操作：

1. 与用户讨论、理解这个 rule 的约束内容和生效范围。
2. 写出 rule 的纯文本内容（无 frontmatter，正文直接作为 rule）。
3. 将文件写入 `~/.sage/rules/<name>.md`。
```

---

## 3. 删除内容

- `src/core/modes.ts` 中硬编码的 `BUILTIN_MODES` 全部删除
- 不再内置的 mode：`socratic`、`direct`、`deep`、`perspectives`
- `deep`、`perspectives` 用户可自行放 `~/.sage/modes/` 恢复

---

## 4. 类型变化

```typescript
// src/core/modes.ts
interface Mode {
  name: string;
  description: string;
  prompt: string;
}

export function getAllModes(): Map<string, Mode>;
export function getAllModeNames(): string[];
export function isValidMode(name: string): boolean;
export function getModePrompt(name: string): string;
```

`getModePrompt` 返回 prompt 正文（可能为空字符串，即 default mode）。

---

## 5. 影响范围

| 文件 | 改动 |
|------|------|
| `src/core/modes.ts` | **重写** — .md 扫描 + frontmatter 解析 |
| `src/core/builtin/default.md` | **新增** |
| `src/core/builtin/discuss.md` | **新增** |
| `src/skills/builtin/write-skill.md` | **新增** |
| `src/skills/builtin/write-mode.md` | **新增** |
| `src/skills/builtin/write-rule.md` | **新增** |
| `src/tui/index.ts` | mode 补全显示 description |
| `src/core/prompts.ts` | 无改动（default 空 prompt 自然不注入） |
| `src/core/index.ts` | 无改动（导出接口不变） |
| `package.json` | build 脚本加 `cp src/core/builtin dist/core/builtin` |

不涉及：`core/loop.ts`、`skills/loader.ts`、`tools/`、`config/`、`session/`。

---

## 决策记录

- **Mode 格式**: YAML frontmatter + Markdown 正文，和 skill 统一
- **Mode 无 auto/manual**: mode 始终通过 `/mode` 切换，无需 type 字段
- **Default mode**: 空 prompt，不改变模型原生行为
- **Meta-skill 均为 manual**: 用户主动调用，不需要 LLM 自动激活
