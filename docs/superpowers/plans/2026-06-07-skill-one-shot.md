# Skill One-Shot & Auto Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto skills via `use_skill` tool + system prompt listing; manual skills one-shot via user prompt. Remove `activeSkills` toggle.

**Architecture:** 3 tasks. Agent layer gets `use_skill` tool + auto skill injection. TUI contract swaps `onSkillActivate` for `onSkill`. App.ts wires one-shot handler and removes toggle state.

---

### Task 1: Wire auto skills + `use_skill` tool in agent layer

**Files:** Modify: `src/agent/index.ts`, `src/agent/tools.ts`

- [ ] **Step 1: Remove hardcoded tools from `src/agent/tools.ts`**

Delete `createReflectTool` and `createChallengeTool` entirely. Keep `createWebSearchTool`.

- [ ] **Step 2: Update `src/agent/index.ts` to use auto skills + `use_skill`**

Replace the hardcoded tools array with dynamic auto-skill loading:

```ts
import { getAutoSkills, buildAutoSkillPrompt, buildUseSkillTool } from "../skills/loader.js";

export function createSageAgent(
  model: Model<any>,
  options: {
    mode?: string;
    tavilyApiKey?: string;
    sessionId?: string;
  } = {},
) {
  const { mode = "default", tavilyApiKey, sessionId } = options;

  const autoSkills = getAutoSkills();
  const autoSkillPrompt = buildAutoSkillPrompt(autoSkills);

  const tools: AgentTool[] = [];

  if (autoSkills.length > 0) {
    tools.push(buildUseSkillTool(autoSkills) as AgentTool);
  }

  if (tavilyApiKey) {
    tools.push(createWebSearchTool(tavilyApiKey));
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(mode, autoSkillPrompt),
      model,
      thinkingLevel: "high",
      tools,
      messages: [],
    },
    // ... rest unchanged
  });
  return agent;
}
```

Note: remove the `skillNames` import and parameter.

- [ ] **Step 3: Update `buildSystemPrompt` in `src/core/prompts.ts`**

Change signature from `buildSystemPrompt(mode: string, skillNames: string[])` to `buildSystemPrompt(mode: string, autoSkillPrompt?: string)`. Remove the `buildSkillPrompt(skillNames)` call. Replace with:

```ts
export function buildSystemPrompt(mode: string, autoSkillPrompt?: string): string {
  const parts: string[] = [];

  parts.push("You are Sage, an AI assistant.");
  parts.push("");

  const modePrompt = getModePrompt(mode);
  if (modePrompt) {
    parts.push(modePrompt);
    parts.push("");
  }

  const rules = loadRules();
  if (rules.length > 0) {
    parts.push("## Rules");
    for (const rule of rules) {
      parts.push(rule);
    }
    parts.push("");
  }

  if (autoSkillPrompt) {
    parts.push("## Available Skills");
    parts.push("You have the following skills available via the `use_skill` tool:");
    parts.push(autoSkillPrompt);
    parts.push(`To use a skill, call use_skill("<name>") and follow the returned instructions.`);
    parts.push("");
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/agent/index.ts src/agent/tools.ts src/core/prompts.ts
git commit -m "feat(skill): auto skills via use_skill tool, remove hardcoded reflect/challenge"
```

---

### Task 2: TUI contract — `onSkillActivate` → `onSkill`

**Files:** Modify: `src/tui/index.ts`

- [ ] **Step 1: Replace `onSkillActivate` with `onSkill` in `SageTUIHandlers`**

```ts
  onSkill: (name: string) => void;
```

Remove `onSkillActivate`.

- [ ] **Step 2: Update command dispatch**

Replace the `reflect`/`challenge`/`goal` cases:

```ts
        case "reflect":
        case "challenge":
        case "goal":
          handlers.onSkill(cmd);
          return;
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/tui/index.ts
git commit -m "feat(tui): replace onSkillActivate with one-shot onSkill"
```

---

### Task 3: Remove `activeSkills` + add `onSkill` handler in `src/app.ts`

**Files:** Modify: `src/app.ts`, `src/core/prompts.ts`

- [ ] **Step 1: Remove `activeSkills` from AppContext/InitSessionResult/ctx/main**

Delete the `activeSkills: string[]` field from:
- `AppContext` interface
- `InitSessionResult` interface
- `initSession()` return and local variable
- `ctx` object in `main()`

- [ ] **Step 2: Remove `onSkillActivate` handler, add `onSkill` handler**

In `createTUIHandlers`, delete the entire `onSkillActivate` handler. Add:

```ts
    onSkill(name: string) {
      const skill = loadSkill(name);
      if (!skill) {
        ctx.tui.addSystemMessage(`Skill "${name}" not found.`);
        return;
      }
      Logger.info("skill:trigger", { sessionId: ctx.session!.id, skill: name });
      ctx.agent.prompt(skill.prompt).catch((err: Error) => {
        Logger.error("error", { sessionId: ctx.session!.id, message: err.message, stack: err.stack });
        console.error("Agent error:", err);
      });
    },
```

- [ ] **Step 3: Update all `buildSystemPrompt(mode, activeSkills)` calls → `buildSystemPrompt(mode)`**

Replace everywhere (onModeChange, onSessionResume, onSkillActivate removal, initSession).

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/app.ts src/core/prompts.ts
git commit -m "refactor(skill): remove activeSkills toggle, add one-shot onSkill handler"
```
