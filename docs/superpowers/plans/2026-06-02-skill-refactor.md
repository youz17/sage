# Skill 机制重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 skill 机制重构为支持 auto/manual 分类、统一 .md 文件格式、use_skill 工具调度的架构。

**Architecture:** 内置 skill 从硬编码字符串迁移为 `src/skills/builtin/*.md` 文件（YAML frontmatter）。loader.ts 重写以支持 frontmatter 解析、auto/manual 分类。auto skill 注册 `use_skill` 工具，LLM 自主激活。agent loop 拦截 `use_skill` 调用并注入完整 prompt。

**Tech Stack:** TypeScript 5.8, Node.js ESM, Node.js fs/path

**Files changed:** `src/skills/` (builtin.ts deleted, 3 .md created, loader.ts rewritten, index.ts updated), `src/core/prompts.ts` (auto skill prompt param), `src/core/loop.ts` (use_skill interception), `src/tui/index.ts` (startup skill loading, use_skill registration), `src/tui/completer.ts` (description display), `src/types.ts` (AgentConfig new field)

---

### Task 1: Create builtin skill .md files

**Files:**
- Create: `src/skills/builtin/reflect.md`
- Create: `src/skills/builtin/challenge.md`
- Create: `src/skills/builtin/goal.md`

- [ ] **Step 1: Write reflect.md**

```markdown
---
type: manual
description: 回答前先自省反思，审视答案的正确性、完整性和逻辑一致性
---

在给出最终回复之前，你必须调用 `reflect` 工具审视你的回答是否存在问题。将草稿答案和用户的原始问题传递给 reflect 工具。如果反思结果为 NEEDS_FIX，根据建议修正答案；如果为 PASS，自信地呈现你的答案。
```

- [ ] **Step 2: Write challenge.md**

```markdown
---
type: manual
description: 用魔鬼代言人视角挑战你的答案，发现薄弱点和盲区
---

在给出最终回复之前，你必须调用 `challenge` 工具对你的答案进行魔鬼代言人式的挑战。将草稿答案和用户的原始问题传递给 challenge 工具。仔细考虑每个反对意见：如果批评有其合理性，修正答案以回应它们；如果批评不成立，解释为什么你的原始推理站得住脚。在最终回答中处理最有力的反对意见。
```

- [ ] **Step 3: Write goal.md**

```markdown
---
type: manual
description: 将复杂目标分解为可执行的子任务，逐步推进并合成结果
---

用户设定了一个目标。你的任务是帮助实现它：
1. 将目标分解为具体、可操作的子任务。
2. 逐个完成每个子任务。
3. 使用可用工具（web search 等）收集每个子任务所需的信息。
4. 完成所有子任务后，将结果合成为连贯的最终答案。
5. 展示完成内容的总结。

在推进过程中报告进度："正在进行步骤 X / Y：..."
```

- [ ] **Step 4: Commit**

```bash
git add src/skills/builtin/
git commit -m "feat: add builtin skill .md files (reflect, challenge, goal)"
```

---

### Task 2: Rewrite loader.ts and update build for .md assets

**Files:**
- Modify: `src/skills/loader.ts` (complete rewrite)
- Modify: `package.json` (add postbuild script)

- [ ] **Step 1: Write new loader.ts with frontmatter parsing, scanning, classification (dual-path for tsx & tsc)**

```typescript
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getSubdir, scanMdFiles } from "../config/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SkillFrontmatter {
  type: "auto" | "manual";
  description?: string;
}

export interface Skill {
  name: string;
  type: "auto" | "manual";
  description?: string;
  prompt: string;
}

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) frontmatter[kv[1].trim()] = kv[2].trim();
  }

  return {
    frontmatter: {
      type: (frontmatter.type as "auto" | "manual") ?? "manual",
      description: frontmatter.description,
    },
    body: match[2].trim(),
  };
}

function findBuiltinDir(): string | null {
  // tsx (dev): __dirname = src/skills/ → builtin/ = src/skills/builtin/
  const tsxPath = join(__dirname, "builtin");
  if (existsSync(tsxPath)) return tsxPath;

  // tsc compiled (prod): __dirname = dist/skills/ → builtin/ = dist/skills/builtin/
  // Fallback: walk up from __dirname to find src/skills/builtin/
  const srcPath = join(__dirname, "..", "..", "src", "skills", "builtin");
  if (existsSync(srcPath)) return srcPath;

  return null;
}

function scanBuiltinSkills(): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  const builtinDir = findBuiltinDir();
  if (!builtinDir) return skills;

  for (const file of readdirSync(builtinDir)) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    const raw = readFileSync(join(builtinDir, file), "utf-8");
    const parsed = parseFrontmatter(raw);
    if (parsed) {
      skills.set(name, {
        name,
        type: parsed.frontmatter.type,
        description: parsed.frontmatter.description,
        prompt: parsed.body,
      });
    }
  }
  return skills;
}

function scanCustomSkills(): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  const customDir = getSubdir("skills");
  const raw = scanMdFiles(customDir);
  for (const [name, content] of raw) {
    const parsed = parseFrontmatter(content);
    if (parsed) {
      skills.set(name, {
        name,
        type: parsed.frontmatter.type,
        description: parsed.frontmatter.description,
        prompt: parsed.body,
      });
    }
  }
  return skills;
}

export function getAllSkills(): Map<string, Skill> {
  const skills = scanBuiltinSkills();
  for (const [name, skill] of scanCustomSkills()) {
    skills.set(name, skill); // custom overrides builtin
  }
  return skills;
}

export function getAutoSkills(skills?: Map<string, Skill>): Skill[] {
  const all = skills ?? getAllSkills();
  return Array.from(all.values()).filter((s) => s.type === "auto");
}

export function buildAutoSkillPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  return skills.map((s) => `- ${s.name}: ${s.description ?? "No description"}`).join("\n");
}

export function buildUseSkillTool(skills: Skill[]): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: "use_skill",
    description: "Activate a skill to get its full instructions and capabilities. Use when a skill's description suggests it would help with the current task.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          enum: skills.map((s) => s.name),
          description: "The skill to activate",
        },
      },
      required: ["skill"],
    },
  };
}

export function loadSkill(name: string): Skill | null {
  const all = getAllSkills();
  return all.get(name) ?? null;
}

export function buildSkillPrompt(skillNames: string[]): string {
  const parts: string[] = [];
  for (const name of skillNames) {
    const skill = loadSkill(name);
    if (skill) {
      parts.push(`<skill name="${skill.name}">\n${skill.prompt}\n</skill>`);
    }
  }
  return parts.length > 0
    ? `\n\n以下 skill 已激活。请遵循它们的指令：\n\n${parts.join("\n\n")}`
    : "";
}

export function getAllSkillNames(): string[] {
  return Array.from(getAllSkills().keys());
}
```

- [ ] **Step 2: Add asset copy step to package.json build script**

In `package.json`, change the build script:
```json
"build": "tsc && node -e \"const{cpSync}=require('fs');cpSync('src/skills/builtin','dist/skills/builtin',{recursive:true})\""
```

This copies the `.md` files from `src/skills/builtin/` to `dist/skills/builtin/` after tsc compiles.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors from loader.ts

- [ ] **Step 4: Verify build + asset copy works**

Run: `npm run build`
Expected: Build succeeds; `dist/skills/builtin/` directory exists with 3 .md files

- [ ] **Step 5: Commit**

```bash
git add src/skills/loader.ts package.json
git commit -m "refactor: rewrite loader.ts with frontmatter parsing and auto/manual support"
```

---

### Task 3: Update skills/index.ts exports

**Files:**
- Modify: `src/skills/index.ts`

- [ ] **Step 1: Update exports to match new loader.ts API**

```typescript
export {
  loadSkill,
  buildSkillPrompt,
  getAllSkillNames,
  getAllSkills,
  getAutoSkills,
  buildAutoSkillPrompt,
  buildUseSkillTool,
} from "./loader.js";
export type { Skill, SkillFrontmatter } from "./loader.js";
```

- [ ] **Step 2: Commit**

```bash
git add src/skills/index.ts
git commit -m "refactor: update skills/index.ts exports for new API"
```

---

### Task 4: Delete builtin.ts

**Files:**
- Delete: `src/skills/builtin.ts`

- [ ] **Step 1: Delete the file**

```bash
git rm src/skills/builtin.ts
```

- [ ] **Step 2: Verify nothing imports it anymore**

Run: `npx tsc --noEmit`
Expected: No errors about missing builtin module

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: remove hardcoded builtin.ts, replaced by .md files"
```

---

### Task 5: Add autoSkillPrompt field to AgentConfig and update core/prompts.ts

**Files:**
- Modify: `src/types.ts`
- Modify: `src/core/prompts.ts`

- [ ] **Step 1: Add autoSkillPrompt to AgentConfig**

In `src/types.ts`, add field after `skills`:

```typescript
export interface AgentConfig {
  maxIterations: number;
  mode: string;
  skills: string[];
  autoSkillPrompt?: string;
  onEvent?: (event: AgentEvent) => void;
}
```

- [ ] **Step 2: Update buildSystemPrompt to accept autoSkillPrompt**

Replace the function signature and body in `src/core/prompts.ts`:

```typescript
export function buildSystemPrompt(
  mode: string,
  skillPrompt: string,
  autoSkillPrompt?: string,
): string {
  const modePrompt = getModePrompt(mode);
  const rules = loadRules();
  const rulesBlock = rules.length > 0
    ? `\n\n## User Rules\n\nThe following rules are always active:\n\n${rules.join("\n\n")}`
    : "";

  const autoBlock = autoSkillPrompt
    ? `\n\n## Available Skills\n\nYou can call the \`use_skill\` tool to activate any of these skills when relevant:\n\n${autoSkillPrompt}\n`
    : "";

  return `You are a thoughtful conversational agent that adapts its thinking and communication style based on the active mode.

## Core Principles

1. **Think before answering.** On complex questions, reason step by step internally before responding.
2. **Use tools proactively.** When you need current information, facts, data, or verification — use web_search. Don't guess when you can look it up.
3. **Adapt to question type:**
   - Factual / objective questions → search first, answer with sources.
   - Subjective / open-ended questions → follow mode instructions for how to engage.
   - Complex multi-step questions → break down into parts, work through them systematically.
4. **When information is insufficient:**
   - For objective gaps: use web_search to find the answer.
   - For subjective gaps (preferences, context only the user has): ask the user directly.
5. **Be honest about uncertainty.** If you're not sure, say so.

## Tool Usage

You have access to tools. Use them whenever they would improve your answer:
- **web_search**: Search the web for real-time information. Use for current events, facts, data, or anything that may have changed since your training.
- **reflect**: Critically review your draft answer. Use on complex questions where accuracy matters.
- **challenge**: Get your answer challenged by a devil's advocate. Use when you want to stress-test your reasoning.

When you call a tool, you will receive its result and can continue reasoning with that information.

${modePrompt}

## Response Format

- Use concrete examples to illustrate abstract points.
- Keep responses focused — quality over quantity.
- Format with markdown when it aids readability.${rulesBlock}${autoBlock}${skillPrompt}`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/core/prompts.ts
git commit -m "feat: add autoSkillPrompt to AgentConfig and system prompt"
```

---

### Task 6: Update core/loop.ts for use_skill interception

**Files:**
- Modify: `src/core/loop.ts`

- [ ] **Step 1: Rewrite loop.ts with use_skill interception and autoSkillPrompt integration**

```typescript
import type { AgentConfig, AgentEvent, Message, ToolCall } from "../types.js";
import type { LLMClient } from "../llm/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildSkillPrompt, loadSkill } from "../skills/loader.js";

const DEFAULT_CONFIG: AgentConfig = {
  maxIterations: 20,
  mode: "socratic",
  skills: [],
};

export async function* runAgent(
  userMessage: string,
  history: Message[],
  llm: LLMClient,
  tools: ToolRegistry,
  config: Partial<AgentConfig> = {},
): AsyncGenerator<AgentEvent> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const skillPrompt = buildSkillPrompt(cfg.skills);
  const systemPrompt = buildSystemPrompt(cfg.mode, skillPrompt, cfg.autoSkillPrompt);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const toolSchemas = tools.getSchemas();
  let iteration = 0;
  let lastToolCall = "";
  const activatedSkills = new Set<string>();

  while (iteration < cfg.maxIterations) {
    iteration++;

    yield { type: "thinking", content: `Iteration ${iteration}...`, iteration };

    let fullContent = "";
    let allToolCalls: ToolCall[] = [];
    let thinkingContent: string | null = null;

    for await (const chunk of llm.stream(messages, toolSchemas)) {
      if (chunk.thinking) {
        thinkingContent = chunk.thinking;
        yield { type: "thinking", content: chunk.thinking, iteration };
      }
      if (chunk.content) {
        fullContent += chunk.content;
        yield { type: "text_chunk", content: chunk.content, iteration };
      }
      if (chunk.toolCalls.length > 0) {
        allToolCalls = chunk.toolCalls;
      }
    }

    if (allToolCalls.length === 0) {
      messages.push({ role: "assistant", content: fullContent });
      yield { type: "text_done", content: fullContent, iteration };
      yield { type: "done", iteration };
      return;
    }

    const currentCallSig = JSON.stringify(
      allToolCalls.map((tc) => ({ name: tc.function.name, args: tc.function.arguments })),
    );
    if (currentCallSig === lastToolCall) {
      yield {
        type: "error",
        content: "Detected repeated tool call — stopping to prevent infinite loop.",
        iteration,
      };
      if (fullContent) {
        yield { type: "text_done", content: fullContent, iteration };
      }
      yield { type: "done", iteration };
      return;
    }
    lastToolCall = currentCallSig;

    messages.push({
      role: "assistant",
      content: fullContent || null as unknown as string,
      tool_calls: allToolCalls,
    });

    for (const tc of allToolCalls) {
      const toolName = tc.function.name;
      let toolArgs: Record<string, unknown>;
      try {
        toolArgs = JSON.parse(tc.function.arguments);
      } catch {
        toolArgs = {};
      }

      yield {
        type: "tool_call",
        toolName,
        toolArgs,
        toolCallId: tc.id,
        iteration,
      };

      let result: string;

      if (toolName === "use_skill") {
        const skillName = toolArgs.skill as string;
        if (activatedSkills.has(skillName)) {
          result = `Skill "${skillName}" is already active.`;
        } else {
          const skill = loadSkill(skillName);
          if (skill) {
            activatedSkills.add(skillName);
            result = `Skill "${skillName}" activated. Instructions:\n${skill.prompt}`;
          } else {
            result = `Skill "${skillName}" not found.`;
          }
        }
      } else {
        result = await tools.execute(toolName, toolArgs);
      }

      yield {
        type: "tool_result",
        toolName,
        toolCallId: tc.id,
        content: result,
        iteration,
      };

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
    }
  }

  yield {
    type: "error",
    content: `Reached maximum iterations (${cfg.maxIterations}). Stopping.`,
    iteration,
  };
  yield { type: "done", iteration };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/core/loop.ts
git commit -m "feat: intercept use_skill in agent loop, inject skill prompt"
```

---

### Task 7: Update tui/index.ts for startup skill loading and use_skill registration

**Files:**
- Modify: `src/tui/index.ts`

- [ ] **Step 1: Add imports and startup skill loading**

In `src/tui/index.ts`, replace the skill import line 13:

Old:
```typescript
import { getAllSkillNames } from "../skills/loader.js";
```

New:
```typescript
import {
  getAllSkillNames,
  getAllSkills,
  getAutoSkills,
  buildAutoSkillPrompt,
  buildUseSkillTool,
} from "../skills/loader.js";
import type { ToolDefinition } from "../types.js";
```

After the tool registrations (line 38), add:

```typescript
const allSkills = getAllSkills();
const autoSkills = getAutoSkills(allSkills);
const autoSkillPrompt = buildAutoSkillPrompt(autoSkills);

if (autoSkills.length > 0) {
  const useSkillTool = buildUseSkillTool(autoSkills);
  tools.register({
    ...useSkillTool,
    execute: async () => "", // dummy — intercepted by agent loop
  } as ToolDefinition);
}
```

- [ ] **Step 2: Pass autoSkillPrompt to runAgent**

In the `runAgent` call (line 213-219), add `autoSkillPrompt`:

Old:
```typescript
for await (const event of runAgent(
  result.text,
  history,
  llm,
  tools,
  { mode: input.mode, skills: result.skills ?? [] },
)) {
```

New:
```typescript
for await (const event of runAgent(
  result.text,
  history,
  llm,
  tools,
  { mode: input.mode, skills: result.skills ?? [], autoSkillPrompt },
)) {
```

- [ ] **Step 3: Update completions to show skill description**

In the `buildCompletions` function, update the skill completion loop (line 94-96):

Old:
```typescript
for (const skill of getAllSkillNames()) {
  items.push({ label: `/${skill}`, description: "skill" });
}
```

New:
```typescript
for (const [name, skill] of allSkills) {
  items.push({ label: `/${name}`, description: skill.description ?? "skill" });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/tui/index.ts
git commit -m "feat: load skills at startup, register use_skill, pass autoSkillPrompt"
```

---

### Task 8: Smoke test

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Verify startup works (--new flag to skip session resume)**

Run: `npm start -- --new`
Expected: TUI starts, welcome message shows. Press Ctrl+C to exit.

- [ ] **Step 3: Verify /skill completions work**

Type `/` in TUI, verify:
- `/reflect` shows with description "回答前先自省反思..."
- `/challenge` shows with description
- `/goal` shows with description
- `/mode`, `/session`, `/quit` still appear

- [ ] **Step 4: Verify manual skill input parsing still works**

Type `/reflect hello` and check that the input is parsed correctly (clean text = "hello", skills = ["reflect"])

- [ ] **Step 5: Commit**

```bash
git commit -m "test: manual smoke test passed"
```

