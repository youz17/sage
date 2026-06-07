# Prompt 组织优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 Sage 的 system prompt 和 skill 激活时的 prompt 结构——skill 列表改用 `<available_skills>` XML，skill 激活统一用 `<activated_skill>` + 过渡句 + `<user_query>` 格式，mode/skill 文件添加自描述语句，write-xxx 技能增加格式指导。

**Architecture:** 修改 3 个核心代码文件（`prompts.ts`、`loader.ts`、`app.ts`）和 8 个 markdown 文件。`buildAutoSkillPrompt` 改为输出 XML，`buildSkillPrompt` 拆为 `buildSkillActivation`（use_skill 工具用）和 `buildManualSkillPrompt`（手动 /name 用），`buildUseSkillTool` 补齐 execute 函数。app.ts 的 onSkill 改用统一格式。

**Tech Stack:** TypeScript, pi-agent-core (AgentTool 接口), Node.js

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/skills/loader.ts` | 修改 | skill 加载/格式化/工具构建的核心逻辑 |
| `src/core/prompts.ts` | 修改 | system prompt 拼装，skill 列表区域调整 |
| `src/app.ts` | 修改 | onSkill handler 改用统一激活格式 |
| `src/skills/builtin/reflect.md` | 修改 | 加自描述 |
| `src/skills/builtin/challenge.md` | 修改 | 加自描述 |
| `src/skills/builtin/goal.md` | 修改 | 加自描述 |
| `src/skills/builtin/write-skill.md` | 修改 | 加自描述 + 注入格式说明 |
| `src/skills/builtin/write-rule.md` | 修改 | 注入格式说明（无需自描述） |
| `src/skills/builtin/write-mode.md` | 修改 | 加自描述 + 注入格式说明 |
| `src/core/builtin/discuss.md` | 修改 | 加自描述 |
| `src/core/builtin/default.md` | 修改 | 加自描述 |
| `src/test.ts` | 修改 | 添加 prompt 结构单元测试 |
| `package.json` | 修改 | 添加 `test` script |

---

### Task 1: 重写 `buildAutoSkillPrompt` — skill 列表改为 `<available_skills>` XML

**Files:**
- Modify: `src/skills/loader.ts`（`buildAutoSkillPrompt` 函数）

- [ ] **Step 1: 重写 `buildAutoSkillPrompt`**

将 markdown bullet list 改为 `<available_skills>` XML 块。

当前代码（`loader.ts:105-108`）：
```ts
export function buildAutoSkillPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  return skills.map((s) => `- ${s.name}: ${s.description ?? "No description"}`).join("\n");
}
```

替换为：
```ts
export function buildAutoSkillPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const items = skills.map(
    (s) => `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description ?? "No description"}</description>\n  </skill>`
  );
  return `<available_skills>\n${items.join("\n")}\n</available_skills>`;
}
```

- [ ] **Step 2: 运行 build 验证类型**

```powershell
npm run build
```

期望：编译通过，无类型错误。

- [ ] **Step 3: 写单元测试**

在 `src/test.ts` 顶部添加 prompt 结构单元测试（API key 无关）：

```ts
import { buildAutoSkillPrompt, Skill } from "./skills/loader.js";

function testBuildAutoSkillPrompt() {
  const skills: Skill[] = [
    { name: "reflect", type: "auto", description: "回答前自省", prompt: "xxx" },
    { name: "challenge", type: "auto", description: "魔鬼代言人", prompt: "yyy" },
  ];

  const result = buildAutoSkillPrompt(skills);

  // 验证包含 expected 子串
  const checks = [
    result.includes("<available_skills>"),
    result.includes("</available_skills>"),
    result.includes("<skill>"),
    result.includes("</skill>"),
    result.includes("<name>reflect</name>"),
    result.includes("<description>回答前自省</description>"),
    result.includes("<name>challenge</name>"),
    result.includes("<description>魔鬼代言人</description>"),
    !result.includes("- reflect"),  // 确认不是旧格式
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ buildAutoSkillPrompt passed" : "❌ buildAutoSkillPrompt FAILED");
}
```

- [ ] **Step 4: 运行单元测试**

由于 test.ts 需要 API key 才能跑完全程，先添加一个独立的 prompt 测试入口。更新 `package.json` 添加 `test` script：

```json
"test": "tsx src/test.ts"
```

在 `test.ts` 中，将 prompt 单元测试放在 API key 检查之前运行：

```ts
// 在 test() 函数开头，loadConfig() 之前插入：
testBuildAutoSkillPrompt();
// ... 后续测试函数调用
```

运行：`npm run test`（此时如果无 API key 会报错退出，但 prompt 测试的断言已执行）

- [ ] **Step 5: Commit**

```powershell
git add src/skills/loader.ts src/test.ts package.json
git commit -m "feat: buildAutoSkillPrompt改用available_skills XML格式"
```

---

### Task 2: 将 `buildSkillPrompt` 拆为 `buildSkillActivation` + `buildManualSkillPrompt`

**Files:**
- Modify: `src/skills/loader.ts`
- Modify: `src/skills/index.ts`（更新 re-export）

- [ ] **Step 1: 删除旧 `buildSkillPrompt`，新增两个函数**

在 `loader.ts` 中，删除 `buildSkillPrompt` 函数（约第 137-149 行），新增：

```ts
/** 格式化 skill 激活内容（use_skill 工具返回用，无用户输入） */
export function buildSkillActivation(skill: Skill): string {
  return `<activated_skill name="${skill.name}">\n${skill.prompt}\n</activated_skill>`;
}

/** 格式化手动 skill 激活 + 用户输入 */
export function buildManualSkillPrompt(skill: Skill, userText: string): string {
  return [
    `<activated_skill name="${skill.name}">`,
    skill.prompt,
    `</activated_skill>`,
    ``,
    `请按照上述指令处理以下用户输入：`,
    ``,
    `<user_query>`,
    userText,
    `</user_query>`,
  ].join("\n");
}
```

- [ ] **Step 2: 更新 `src/skills/index.ts` 的 re-export**

将 `buildSkillPrompt` 改为 `buildSkillActivation` 和 `buildManualSkillPrompt`：

```ts
export {
  getAllSkills,
  getAutoSkills,
  buildAutoSkillPrompt,
  buildUseSkillTool,
  loadSkill,
  buildSkillActivation,
  buildManualSkillPrompt,
  getAllSkillNames,
  type Skill,
  type SkillFrontmatter,
} from "./loader.js";
```

- [ ] **Step 3: 运行 build**

```powershell
npm run build
```

期望：编译通过。

- [ ] **Step 4: 添加单元测试**

在 `src/test.ts` 的 prompt 测试区域添加：

```ts
import { buildSkillActivation, buildManualSkillPrompt } from "./skills/loader.js";

function testBuildSkillActivation() {
  const skill: Skill = {
    name: "test-skill",
    type: "auto" as const,
    description: "测试技能",
    prompt: "这是测试技能的指令内容：\n1. 做A\n2. 做B",
  };

  const result = buildSkillActivation(skill);

  const checks = [
    result.startsWith('<activated_skill name="test-skill">'),
    result.endsWith("</activated_skill>"),
    result.includes("这是测试技能的指令内容："),
    result.includes("1. 做A"),
    result.includes("2. 做B"),
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ buildSkillActivation passed" : "❌ buildSkillActivation FAILED");
}

function testBuildManualSkillPrompt() {
  const skill: Skill = {
    name: "goal",
    type: "manual" as const,
    description: "目标分解",
    prompt: "用户设定了一个目标。按以下步骤：\n1. 分解\n2. 执行",
  };

  const userText = "帮我分析这个项目";

  const result = buildManualSkillPrompt(skill, userText);

  const checks = [
    result.startsWith('<activated_skill name="goal">'),
    result.includes("</activated_skill>"),
    result.includes("请按照上述指令处理以下用户输入："),
    result.includes("<user_query>"),
    result.includes("帮我分析这个项目"),
    result.includes("</user_query>"),
    // userText 在 </user_query> 之前
    result.indexOf("帮我分析这个项目") < result.indexOf("</user_query>"),
    // transition 在 </activated_skill> 之后
    result.indexOf("请按照上述指令") > result.indexOf("</activated_skill>"),
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ buildManualSkillPrompt passed" : "❌ buildManualSkillPrompt FAILED");
}
```

在 `test()` 函数开头调用：
```ts
testBuildSkillActivation();
testBuildManualSkillPrompt();
```

- [ ] **Step 5: Commit**

```powershell
git add src/skills/loader.ts src/skills/index.ts src/test.ts
git commit -m "feat: buildSkillPrompt拆为buildSkillActivation+buildManualSkillPrompt"
```

---

### Task 3: `buildUseSkillTool` 补齐 label + execute

**Files:**
- Modify: `src/skills/loader.ts`
- Modify: `src/agent/index.ts`（去掉 `as unknown as AgentTool` 强转）

- [ ] **Step 1: 补齐 label 和 execute**

修改 `buildUseSkillTool`，添加 `Type` 导入和完整 tool 定义：

在 `loader.ts` 顶部添加导入：
```ts
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
```

新增参数 schema（在 `buildUseSkillTool` 上方）：
```ts
const useSkillParams = Type.Object({
  skill: Type.String({ description: "要激活的 skill 名称" }),
});
```

重写 `buildUseSkillTool`：
```ts
export function buildUseSkillTool(skills: Skill[]): AgentTool<typeof useSkillParams> {
  return {
    name: "use_skill",
    label: "Use Skill",
    description:
      "激活一个 skill 以获取其完整指令和能力。当某个 skill 的描述表明它对当前任务有帮助时使用。",
    parameters: useSkillParams,
    execute: async (_toolCallId, params) => {
      const skill = loadSkill(params.skill);
      if (!skill) {
        return {
          content: [{ type: "text" as const, text: `Skill "${params.skill}" 未找到。` }],
          details: null,
        };
      }
      return {
        content: [{ type: "text" as const, text: buildSkillActivation(skill) }],
        details: { skillName: skill.name },
      };
    },
  };
}
```

- [ ] **Step 2: 更新 `agent/index.ts` 的 tool 类型转换**

移除 `as unknown as AgentTool` 强转：

当前：
```ts
tools.push(buildUseSkillTool(autoSkills) as unknown as AgentTool);
```

改为：
```ts
tools.push(buildUseSkillTool(autoSkills));
```

- [ ] **Step 3: 运行 build**

```powershell
npm run build
```

期望：编译通过，无类型错误。

- [ ] **Step 4: Commit**

```powershell
git add src/skills/loader.ts src/agent/index.ts
git commit -m "feat: buildUseSkillTool补齐label+execute，移除unknown强转"
```

---

### Task 4: 更新 `buildSystemPrompt` — 简化 skill 列表区域

**Files:**
- Modify: `src/core/prompts.ts`

- [ ] **Step 1: 简化 skill 列表区域的模板代码**

当前代码（`prompts.ts:26-31`）：
```ts
if (autoSkillPrompt) {
    parts.push("## Available Skills");
    parts.push("You have the following skills available via the `use_skill` tool. Call use_skill(\"<name>\") to activate a skill and follow its instructions:");
    parts.push(autoSkillPrompt);
    parts.push("");
}
```

改为（因为 `autoSkillPrompt` 已经是完整的 `<available_skills>` XML 块）：
```ts
if (autoSkillPrompt) {
    parts.push(autoSkillPrompt);
    parts.push("");
    parts.push("你可以使用 `use_skill` 工具激活以上技能，激活后将获得完整指令。");
    parts.push("");
}
```

- [ ] **Step 2: 删除文件顶部的 TODO 注释**

当前 `prompts.ts:4`：
```ts
// TODO: 不同的prompt之间是否需要加上一些描述，比如应该遵循这样的mode，这样的rule，如下balabala
```

此行删除。

- [ ] **Step 3: 运行 build**

```powershell
npm run build
```

- [ ] **Step 4: Commit**

```powershell
git add src/core/prompts.ts
git commit -m "feat: buildSystemPrompt简化skill列表区域，移除旧TODO"
```

---

### Task 5: 更新 `app.ts` onSkill handler

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: 导入新函数**

在 `app.ts` 顶部，将：
```ts
import { loadSkill } from "./skills/loader.js";
```

改为：
```ts
import { loadSkill, buildSkillActivation, buildManualSkillPrompt } from "./skills/loader.js";
```

- [ ] **Step 2: 重写 `onSkill` 的 prompt 拼装逻辑**

当前（`app.ts:197-211`）：
```ts
onSkill(name: string, userText?: string) {
    const skill = loadSkill(name);
    if (!skill) {
        ctx.tui.addSystemMessage(`Skill "${name}" not found.`);
        return;
    }
    const prompt = userText
        ? `${skill.prompt}\n\n${userText}`
        : skill.prompt;
    Logger.info("skill:trigger", { sessionId: ctx.session!.id, skill: name });
    ctx.agent.prompt(prompt).catch((err: Error) => { ... });
},
```

改为：
```ts
onSkill(name: string, userText?: string) {
    const skill = loadSkill(name);
    if (!skill) {
        ctx.tui.addSystemMessage(`Skill "${name}" not found.`);
        return;
    }
    const prompt = userText
        ? buildManualSkillPrompt(skill, userText)
        : buildSkillActivation(skill);
    Logger.info("skill:trigger", { sessionId: ctx.session!.id, skill: name });
    ctx.agent.prompt(prompt).catch((err: Error) => { ... });
},
```

- [ ] **Step 3: 运行 build**

```powershell
npm run build
```

- [ ] **Step 4: Commit**

```powershell
git add src/app.ts
git commit -m "feat: onSkill改用统一skill激活格式"
```

---

### Task 6: 更新 builtin skill markdown 文件 — 添加自描述

**Files:**
- Modify: `src/skills/builtin/reflect.md`
- Modify: `src/skills/builtin/challenge.md`
- Modify: `src/skills/builtin/goal.md`

- [ ] **Step 1: 更新 `reflect.md`**

在 frontmatter 和正文之间插入自描述语句。当前 body：
```
在给出最终回复之前，先停下来自省反思：
1. 审视你的草稿答案——它是否完整回答了用户的问题？
...
```

改为在开头添加：
```
此 skill 提供了一个回答前自省反思的流程。激活后按以下步骤执行：

在给出最终回复之前，先停下来自省反思：
1. 审视你的草稿答案——它是否完整回答了用户的问题？
...
```

- [ ] **Step 2: 更新 `challenge.md`**

同理，body 开头添加：
```
此 skill 提供了一个用魔鬼代言人视角挑战答案的流程。激活后按以下步骤执行：

在给出最终回复之前，扮演魔鬼代言人挑战你的答案：
...
```

- [ ] **Step 3: 更新 `goal.md`**

body 开头添加：
```
此 skill 提供了目标分解与逐步执行的流程。激活后按以下步骤操作：

用户设定了一个目标。你的任务是帮助实现它：
...
```

- [ ] **Step 4: Commit**

```powershell
git add src/skills/builtin/reflect.md src/skills/builtin/challenge.md src/skills/builtin/goal.md
git commit -m "feat: reflect/challenge/goal skill添加自描述语句"
```

---

### Task 7: 更新 write-xxx skill markdown 文件 — 添加注入格式说明

**Files:**
- Modify: `src/skills/builtin/write-skill.md`
- Modify: `src/skills/builtin/write-rule.md`
- Modify: `src/skills/builtin/write-mode.md`

- [ ] **Step 1: 更新 `write-skill.md`**

当前 body：
```
用户想要创建一个新的 skill。按以下流程操作：

1. 与用户讨论、理解这个 skill 的用途和场景。
2. 判断 type 应该是 auto 还是 manual：
   - **auto**：通用背景技能，LLM 自行判断何时激活
   - **manual**：特定工作流或强制工具调用，用户主动 /name 调用
3. 按 YAML frontmatter 格式写出完整的 skill 内容。
4. 将文件写入 `~/.sage/skills/<name>.md`。
```

改为：
```
此 skill 用于创建新的 Sage skill 文件。

你写的 skill 内容在激活时会以如下格式注入给 LLM：

---
<activated_skill name="name">
[你的 body 内容]
</activated_skill>

请按照上述指令处理以下用户输入：

<user_query>
[用户说的话]
</user_query>
---

请在 body 开头包含自描述语句，说明此 skill 的用途。

按以下流程操作：

1. 与用户讨论、理解这个 skill 的用途和场景。
2. 判断 type 应该是 auto 还是 manual：
   - **auto**：通用背景技能，LLM 自行判断何时激活
   - **manual**：特定工作流或强制工具调用，用户主动 /name 调用
3. 按 YAML frontmatter 格式写出完整的 skill 内容。
4. 将文件写入 `~/.sage/skills/<name>.md`。
```

- [ ] **Step 2: 更新 `write-rule.md`**

当前 body：
```
用户想要创建一个新的 rule。按以下流程操作：

1. 与用户讨论、理解这个 rule 的约束内容和生效范围。
2. 写出 rule 的纯文本内容（无 frontmatter，正文直接作为 rule）。
3. 将文件写入 `~/.sage/rules/<name>.md`。
```

改为（添加注入格式说明，无需自描述）：
```
此 skill 用于创建新的 Sage rule 文件。

你写的 rule 内容最终会在 system prompt 中呈现为：

---
## Rules
[你的 body 内容]
---

标题 "## Rules" 已提供上下文，body 直接写约束内容即可。

按以下流程操作：

1. 与用户讨论、理解这个 rule 的约束内容和生效范围。
2. 写出 rule 的纯文本内容（无 frontmatter，正文直接作为 rule）。
3. 将文件写入 `~/.sage/rules/<name>.md`。
```

- [ ] **Step 3: 更新 `write-mode.md`**

当前 body：
```
用户想要创建一个新的 mode。按以下流程操作：

1. 与用户讨论、理解这个 mode 的沟通风格和适用场景。
2. 按 YAML frontmatter 格式写出完整的 mode 内容。
3. 将文件写入 `~/.sage/modes/<name>.md`。
```

改为：
```
此 skill 用于创建新的 Sage mode 文件。

你写的 mode 内容最终会在 system prompt 中呈现为：

---
You are Sage, an AI assistant.

[你的 body 内容]
---

请在 body 开头包含自描述语句，例如：
"当前处于「XX」模式。此模式决定了我的沟通风格和领域知识。具体行为如下："

按以下流程操作：

1. 与用户讨论、理解这个 mode 的沟通风格和适用场景。
2. 按 YAML frontmatter 格式写出完整的 mode 内容。
3. 将文件写入 `~/.sage/modes/<name>.md`。
```

- [ ] **Step 4: Commit**

```powershell
git add src/skills/builtin/write-skill.md src/skills/builtin/write-rule.md src/skills/builtin/write-mode.md
git commit -m "feat: write-xxx技能添加注入格式说明和自描述"
```

---

### Task 8: 更新 builtin mode markdown 文件 — 添加自描述

**Files:**
- Modify: `src/core/builtin/default.md`
- Modify: `src/core/builtin/discuss.md`

- [ ] **Step 1: 更新 `default.md`**

当前 body 为空。添加：
```
当前处于默认模式。使用模型原生行为进行对话。
```

- [ ] **Step 2: 更新 `discuss.md`**

当前 body：
```
## Communication Mode: Discussion

- Engage as a thoughtful discussion partner, not an answer machine.
...
```

在开头添加：
```
当前处于「协作讨论」模式。此模式决定了我的沟通风格为深度讨论，而非直接给答案。具体行为如下：

## Communication Mode: Discussion
...
```

- [ ] **Step 3: Commit**

```powershell
git add src/core/builtin/default.md src/core/builtin/discuss.md
git commit -m "feat: default/discuss mode添加自描述语句"
```

---

### Task 9: 添加 prompt 结构单元测试

**Files:**
- Modify: `src/test.ts`

- [ ] **Step 1: 在 test.ts 顶部的 import 中添加新函数的导入**

```ts
import { buildAutoSkillPrompt, buildSkillActivation, buildManualSkillPrompt } from "./skills/loader.js";
import type { Skill } from "./skills/loader.js";
```

- [ ] **Step 2: 将前几个 task 中的测试函数整合到 test.ts**

将 Task 1、2 中的 `testBuildAutoSkillPrompt`、`testBuildSkillActivation`、`testBuildManualSkillPrompt` 合并放入 `test.ts`。

- [ ] **Step 3: 在 test() 函数开头调用所有 prompt 测试**

```ts
async function test() {
  // --- Prompt structure unit tests (no API key needed) ---
  testBuildAutoSkillPrompt();
  testBuildSkillActivation();
  testBuildManualSkillPrompt();
  console.log();

  // --- Integration test (requires API key) ---
  console.log("Loading config...");
  const config = loadConfig();
  // ... 后续保持不变
```

- [ ] **Step 4: 运行单元测试**

```powershell
# 仅运行 prompt 测试（无 API key）
$env:DEEPSEEK_API_KEY="skip"; npx tsx src/test.ts
```

期望输出：
```
✅ buildAutoSkillPrompt passed
✅ buildSkillActivation passed
✅ buildManualSkillPrompt passed

Loading config...
ERROR: No API key configured. Set apiKey in ~/.sage/config.json
```

三个 ✅ 全部输出即 prompt 测试通过。

- [ ] **Step 5: Commit**

```powershell
git add src/test.ts
git commit -m "test: 添加prompt结构单元测试"
```

---

### Task 10: 最终验证 — build + 集成测试

- [ ] **Step 1: 运行 build**

```powershell
npm run build
```

期望：TypeScript 编译通过，无类型错误。

- [ ] **Step 2: 运行 test（需 API key）**

```powershell
npm run test
```

期望：prompt 测试 + 集成测试均通过。

- [ ] **Step 3: 抽查 system prompt 输出**

手动验证：在 `buildSystemPrompt` 核心路径中临时加一行 `console.log`，确认 `<available_skills>` XML 格式正确。

可在 `src/agent/index.ts:35` 行后临时添加：
```ts
console.log("=== SYSTEM PROMPT ===");
console.log(buildSystemPrompt(mode, autoSkillPrompt));
console.log("=== END ===");
```

然后运行 `npm run dev`，检查输出。

- [ ] **Step 4: Commit（如有临时 console.log 先删除）**

```powershell
git add -A
git commit -m "chore: 最终验证通过"
```
