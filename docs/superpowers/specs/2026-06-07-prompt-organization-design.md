# Prompt 组织优化设计

## 目标

优化 Sage 的 system prompt 和 skill 激活时的 prompt 结构，使其语义更清晰、LLM 更易理解。

## 现状问题

1. **Mode/Rule/Skill 缺少自描述**：文件 body 直接拼入 prompt，LLM 看到一段指令但不知道"这是 mode 还是 rule、我该怎么对待它"。文件自身不携带上下文说明。
2. **Skill 激活缺少过渡**：手动 `/skillname` 调用时，skill prompt 和用户输入直接 `\n\n` 拼接，无语义过渡。
3. **格式没有规范**：write-skill/write-rule/write-mode 不知道它们的产物会以什么形式被注入到 prompt 中，它们产出的文件结构可能不一致。

## 设计

### 1. System Prompt 最终结构

```
You are Sage, an AI assistant.

[Mode body — 文件自身开头包含自描述语句，说明"当前处于 XX 模式，此模式决定了我的沟通风格..."]

## Rules
[Rule body — 文件自身开头包含自描述语句，说明"这是一条行为约束，你必须遵守：..."]

<available_skills>
<skill>
  <name>reflect</name>
  <description>回答前先自省反思，审视答案的正确性、完整性和逻辑一致性</description>
</skill>
<skill>
  <name>challenge</name>
  <description>用魔鬼代言人视角挑战你的答案，发现薄弱点和盲区</description>
</skill>
</available_skills>

你可以使用 `use_skill` 工具激活以上技能，激活后将获得完整指令。
```

**变化**：
- Skill 列表从 markdown bullet list 改为 `<available_skills>` XML 块（对齐 pi-agent-core 格式，结构化更好）
- Mode/Rule 不再由代码层加过渡语句，改为文件 body 自身包含

### 2. Skill 激活时注入格式

无论 auto skill（通过 `use_skill` 工具）还是 manual skill（通过 `/name` 命令），统一使用：

```
<activated_skill name="skill-name">
[skill full body]
</activated_skill>

请按照上述指令处理以下用户输入：

<user_query>
[用户原始输入]
</user_query>
```

**格式说明**：
- `<activated_skill>` 和 `<user_query>` 是结构边界标记，LLM 不需要理解其语义概念
- 过渡句 `请按照上述指令处理以下用户输入` 明确了两段之间的语义关系
- 仅 manual skill 有用户输入时包含 `<user_query>` 块；auto skill 通过 `use_skill` 激活时可能在 agent 上下文中没有直接的用户输入，此时 skill body 作为完整指令直接返回

### 3. 文件自描述规范

| 文件类型 | 是否需要自描述 | 原因 |
|---------|-------------|------|
| Mode | **需要**。body 开头：`当前处于「XX」模式。此模式决定了我的沟通风格和领域知识。具体行为如下：` | Mode body 无标题，直接拼在 `You are Sage` 之后，不自己说明身份 LLM 不知道这段是什么 |
| Rule | **不需要** | `## Rules` 标题已提供足够上下文 |
| Skill | **需要**。body 开头说明此 skill 的用途和流程 | 激活后 skill body 是完整指令，需要开头自述作用 |

自描述语句由 write-xxx 技能指导 LLM 写出，不在代码层硬编码。

### 4. write-xxx 技能更新

每个 write-xxx 技能增加一段说明，告知 LLM 其产出的文件最终会如何被注入：

**write-mode** 增加：
```
你写的 mode 内容会被直接插入 system prompt 的 "You are Sage, an AI assistant." 之后。请在 body 开头包含自描述语句，说明当前是什么模式及其作用。
```

**write-rule** 增加：
```
你写的 rule 内容会被插入 system prompt 的 "## Rules" 标题下方。标题本身已提供上下文，rule 正文无需额外的自描述语句，直接写约束内容即可。
```

**write-skill** 增加：
```
你写的 skill 内容会在激活时以如下格式注入：
<activated_skill name="name">
[你的内容]
</activated_skill>
请按照上述指令处理以下用户输入：
<user_query>
[用户输入]
</user_query>
请在 body 开头包含自描述语句，说明此 skill 的作用。
```

## 代码改动清单

| 文件 | 改动 |
|------|------|
| `src/core/prompts.ts` | `buildSystemPrompt()`：skill 列表从 markdown bullet 改为 `<available_skills>` XML 块 |
| `src/skills/loader.ts` | `buildAutoSkillPrompt()` → 输出 `<available_skills>` XML 格式；`buildSkillPrompt()` → 输出 `<activated_skill>` + 过渡句 + `<user_query>` 格式；`buildUseSkillTool()` → 补齐 `label` + `execute`，execute 内加载 skill 并以 `<activated_skill>` 格式返回 |
| `src/app.ts` | `onSkill()` 拼装格式与 `buildSkillPrompt` 统一 |
| `src/skills/builtin/reflect.md` | body 开头加自描述 |
| `src/skills/builtin/challenge.md` | body 开头加自描述 |
| `src/skills/builtin/goal.md` | body 开头加自描述 |
| `src/skills/builtin/write-skill.md` | body 开头加自描述 + 说明注入格式 |
| `src/skills/builtin/write-rule.md` | 说明注入格式（`## Rules` 下方，无需自描述） |
| `src/skills/builtin/write-mode.md` | body 开头加自描述 + 说明注入格式 |
| `src/core/builtin/discuss.md` | body 开头加自描述 |
| `src/core/builtin/default.md` | body 开头加自描述 |
| `src/skills/loader.ts` | 删除未使用的 `buildSkillPrompt`（改后由新函数替代，旧函数无调用者） |

## 不变的部分

- Mode/Rule 文件的 frontmatter 格式不变
- Skill 文件的 frontmatter（type、description）格式不变
- `use_skill` 工具定义不变（name、parameters 结构相同，仅 execute 返回的格式变化）
- Mode/Rule 的扫描和加载逻辑不变
- `onModeChange` 中直接更新 `agent.state.systemPrompt` 的模式不变
