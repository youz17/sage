# Skill Tool System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let skill directories provide executable tools (scripts/commands) that LLM can invoke via function calling, activated through `use_skill`.

**Architecture:** New `ToolManager` class scans `~/.sage/skills/` for `tools.json` files, converts definitions to `AgentTool` objects. `use_skill`'s execute triggers `toolManager.activate(skillName)`, which syncs the tool list to `agent.state.tools`. Session persistence uses a new `activeSkills: string[]` field.

**Tech Stack:** TypeScript (Node.js), `@earendil-works/pi-agent-core` AgentTool/Agent, `@earendil-works/pi-ai` Type, `child_process.exec`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/agent/tool-manager.ts` | **Create** | `ToolManager`, `escapeShell()`, `buildSkillTool()` |
| `src/skills/loader.ts` | Modify | `buildUseSkillTool` accepts optional `ToolManager` |
| `src/agent/index.ts` | Modify | Wire `ToolManager` into agent creation, return `{agent, toolManager}` |
| `src/app.ts` | Modify | Sync `activeSkills` before save, restore on resume |
| `src/session/manager.ts` | Modify | `Session` type + `activeSkills` field + sync methods |
| `src/test.ts` | Modify | Unit tests + integration test |

---

### Task 1: Create `src/agent/tool-manager.ts`

**Files:**
- Create: `src/agent/tool-manager.ts`

- [ ] **Step 1: Write the file**

```typescript
import { exec } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Agent } from "@earendil-works/pi-agent-core";

/**
 * Shell-escape an argument value for safe command-line interpolation.
 * Wraps in single quotes; the only special char inside single quotes
 * is the single quote itself, escaped as '\''.
 */
export function escapeShell(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/** A single tool definition from tools.json */
interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, {
    type: "string";
    required?: boolean;
    description: string;
  }>;
  command: string;
  timeout?: number;
}

/** Shape of tools.json */
interface ToolsManifest {
  tools: ToolDef[];
}

const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 300_000;

function buildSkillTool(toolDef: ToolDef, skillDir: string): AgentTool {
  // Build TypeBox schema from parameter definitions
  const schemaProps: Record<string, any> = {};
  for (const [key, param] of Object.entries(toolDef.parameters)) {
    const str = Type.String({ description: param.description });
    schemaProps[key] = param.required === false ? Type.Optional(str) : str;
  }
  const paramsSchema = Type.Object(schemaProps);

  const timeout = Math.min(toolDef.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);

  return {
    name: toolDef.name,
    label: toolDef.label,
    description: toolDef.description,
    parameters: paramsSchema,
    execute: async (_toolCallId, params, signal) => {
      // Template substitution
      let cmd = toolDef.command.replaceAll("{{skillDir}}", skillDir);
      for (const [key, value] of Object.entries(params as Record<string, string | undefined>)) {
        const needle = `{{${key}}}`;
        // If not in command template, skip
        if (!cmd.includes(needle)) continue;
        const escaped = value !== undefined ? escapeShell(value) : "";
        cmd = cmd.replaceAll(needle, escaped);
      }

      return new Promise((resolve, reject) => {
        const proc = exec(cmd, {
          cwd: skillDir,
          timeout,
          signal,
        }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            const maxLen = 100_000;
            const text = stdout.length > maxLen
              ? stdout.slice(0, maxLen) + "\n\n[输出已截断]"
              : stdout;
            resolve({
              content: [{ type: "text" as const, text }],
              details: { command: cmd, exitCode: 0 },
            });
          }
        });
      });
    },
  };
}

function scanSkillTools(skillsDir: string): Map<string, AgentTool[]> {
  const result = new Map<string, AgentTool[]>();

  if (!existsSync(skillsDir)) return result;

  for (const entry of readdirSync(skillsDir)) {
    const dirPath = join(skillsDir, entry);
    const stat = statSync(dirPath);
    if (!stat.isDirectory()) continue;

    const manifestPath = join(dirPath, "tools.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const manifest: ToolsManifest = JSON.parse(raw);

      if (!Array.isArray(manifest.tools)) {
        console.warn(`[ToolManager] ${manifestPath}: "tools" 不是数组，跳过`);
        continue;
      }

      const tools: AgentTool[] = [];
      for (const toolDef of manifest.tools) {
        if (!toolDef.name || !toolDef.command) {
          console.warn(`[ToolManager] ${manifestPath}: 工具缺少 name 或 command，跳过`);
          continue;
        }
        tools.push(buildSkillTool(toolDef, dirPath));
      }

      if (tools.length > 0) {
        result.set(entry, tools);
      }
    } catch (err) {
      console.warn(`[ToolManager] 解析 ${manifestPath} 失败:`, (err as Error).message);
    }
  }

  return result;
}

export class ToolManager {
  private baseTools: AgentTool[];
  private allTools: Map<string, AgentTool[]>;
  private activeSkillNames: Set<string> = new Set();
  private agent: Agent | null = null;

  constructor(baseTools: AgentTool[], skillsDir: string) {
    this.baseTools = baseTools;
    this.allTools = scanSkillTools(skillsDir);
  }

  /** Connect to an Agent instance. Must be called before activate() can sync tools. */
  setAgent(agent: Agent): void {
    this.agent = agent;
    this.syncToAgent();
  }

  /** Activate a skill's tools. Idempotent. */
  activate(skillName: string): void {
    if (this.activeSkillNames.has(skillName)) return;
    const tools = this.allTools.get(skillName);
    if (!tools || tools.length === 0) return;
    this.activeSkillNames.add(skillName);
    this.syncToAgent();
  }

  /** Deactivate a skill's tools. */
  deactivate(skillName: string): void {
    if (!this.activeSkillNames.has(skillName)) return;
    this.activeSkillNames.delete(skillName);
    this.syncToAgent();
  }

  /** Batch-activate from a persisted list. */
  activateFrom(skillNames: string[]): void {
    for (const name of skillNames) {
      this.activate(name);
    }
  }

  getActiveSkillNames(): string[] {
    return [...this.activeSkillNames];
  }

  getActiveTools(): AgentTool[] {
    return this.buildActiveToolList();
  }

  getSkillTools(skillName: string): AgentTool[] {
    return this.allTools.get(skillName) ?? [];
  }

  getToolDescriptions(skillName: string): string | null {
    const tools = this.allTools.get(skillName);
    if (!tools || tools.length === 0) return null;
    return tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  }

  getToolCount(skillName: string): number {
    return this.allTools.get(skillName)?.length ?? 0;
  }

  private buildActiveToolList(): AgentTool[] {
    const active: AgentTool[] = [...this.baseTools];
    for (const name of this.activeSkillNames) {
      const tools = this.allTools.get(name);
      if (tools) active.push(...tools);
    }
    return active;
  }

  private syncToAgent(): void {
    if (!this.agent) return;
    this.agent.state.tools = this.buildActiveToolList();
  }
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors related to tool-manager.ts (may have other pre-existing errors if any).

- [ ] **Step 3: Commit**

```bash
git add src/agent/tool-manager.ts
git commit -m "feat: add ToolManager + escapeShell for skill tool system"
```

---

### Task 2: Unit tests for ToolManager and escapeShell

**Files:**
- Modify: `src/test.ts`

- [ ] **Step 1: Add import and test functions**

Add this import at top of `src/test.ts`:

```typescript
import { escapeShell, ToolManager } from "./agent/tool-manager.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
```

Then add the following unit test functions before `function test()`:

```typescript
function testEscapeShell() {
  const cases: [string, string][] = [
    ["hello", "'hello'"],
    ["it's", "'it'\\''s'"],
    ["", "''"],
    ["a b", "'a b'"],
    ["$PATH", "'$PATH'"],
  ];
  const passed = cases.every(([input, expected]) => {
    const got = escapeShell(input);
    if (got !== expected) {
      console.log(`  FAIL: escapeShell(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
      return false;
    }
    return true;
  });
  console.log(passed ? "✅ escapeShell passed" : "❌ escapeShell FAILED");
}

function testToolManagerActivateIdempotent() {
  // Create a temp skill dir with tools.json
  const tmpDir = join(tmpdir(), "sage-test-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "test-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\ndescription: test\n---\n");
  writeFileSync(join(skillDir, "tools.json"), JSON.stringify({
    tools: [
      {
        name: "test_echo",
        label: "Echo",
        description: "Echoes input",
        parameters: {
          msg: { type: "string", required: true, description: "message" }
        },
        command: "node -e \"process.stdout.write('{{msg}}')\""
      }
    ]
  }));

  const baseTools: any[] = [{ name: "base", label: "Base", description: "b", parameters: {} as any, execute: async () => ({ content: [], details: null }) }];
  const mgr = new ToolManager(baseTools, tmpDir);

  // First activation
  mgr.activate("test-skill");
  const tools1 = mgr.getActiveTools();
  const match1 = tools1.length === 2; // base + test_echo

  // Second activation (idempotent)
  mgr.activate("test-skill");
  const tools2 = mgr.getActiveTools();
  const match2 = tools2.length === 2; // still 2

  // getActiveSkillNames
  const names = mgr.getActiveSkillNames();
  const match3 = names.length === 1 && names[0] === "test-skill";

  // getToolDescriptions
  const desc = mgr.getToolDescriptions("test-skill");
  const match4 = desc?.includes("test_echo") === true && desc?.includes("Echoes input") === true;

  // getSkillTools
  const st = mgr.getSkillTools("test-skill");
  const match5 = st.length === 1 && st[0].name === "test_echo";

  // getToolCount
  const count = mgr.getToolCount("test-skill");
  const match6 = count === 1;

  // getToolCount for non-existent skill
  const countNone = mgr.getToolCount("nonexistent");
  const match7 = countNone === 0;

  // deactivate
  mgr.deactivate("test-skill");
  const tools3 = mgr.getActiveTools();
  const match8 = tools3.length === 1; // only base

  const allPassed = [match1, match2, match3, match4, match5, match6, match7, match8].every(Boolean);
  console.log(allPassed ? "✅ ToolManager activate/idempotent/deactivate passed" : "❌ ToolManager activate/idempotent/deactivate FAILED");
  if (!allPassed) {
    console.log("  Results:", { match1, match2, match3, match4, match5, match6, match7, match8 });
  }

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });
}

function testToolManagerNoToolsJson() {
  const tmpDir = join(tmpdir(), "sage-test-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "no-tools-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\n---\n"); // no tools.json

  const mgr = new ToolManager([], tmpDir);
  mgr.activate("no-tools-skill");
  const tools = mgr.getActiveTools();
  const match = tools.length === 0; // no tools added

  console.log(match ? "✅ ToolManager no-tools.json passed" : "❌ ToolManager no-tools.json FAILED");
  rmSync(tmpDir, { recursive: true, force: true });
}

function testToolManagerSyncToAgent() {
  const tmpDir = join(tmpdir(), "sage-test-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "echo-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\n---\n");
  writeFileSync(join(skillDir, "tools.json"), JSON.stringify({
    tools: [{
      name: "echo",
      label: "Echo",
      description: "Echo",
      parameters: { msg: { type: "string", required: true, description: "msg" } },
      command: "node -e \"process.stdout.write('{{msg}}')\""
    }]
  }));

  const mgr = new ToolManager([], tmpDir);

  // Mock agent with a plain object that has the state shape
  let capturedTools: any[] = [];
  const mockAgent = {
    state: {
      get tools() { return capturedTools; },
      set tools(v: any[]) { capturedTools = v; },
    },
  };

  mgr.setAgent(mockAgent as any);
  // setAgent should have called syncToAgent — baseTools empty, no active skills → empty
  let match1 = capturedTools.length === 0;

  mgr.activate("echo-skill");
  let match2 = capturedTools.length === 1 && capturedTools[0].name === "echo";

  console.log(match1 && match2 ? "✅ ToolManager syncToAgent passed" : "❌ ToolManager syncToAgent FAILED");
  if (!(match1 && match2)) {
    console.log("  Results:", { match1, match2, toolCount: capturedTools.length });
  }

  rmSync(tmpDir, { recursive: true, force: true });
}
```

- [ ] **Step 2: Call the new tests in the test runner**

In `function test()`, add right after `testCreateWebFetchTool()`:

```typescript
  testEscapeShell();
  testToolManagerActivateIdempotent();
  testToolManagerNoToolsJson();
  testToolManagerSyncToAgent();
```

- [ ] **Step 3: Run tests**

```bash
npx tsx src/test.ts 2>&1 | Select-Object -First 20
```

Expected: All new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/test.ts
git commit -m "test: ToolManager unit tests (escapeShell, activate, sync)"
```

---

### Task 3: Modify `buildUseSkillTool` to accept ToolManager

**Files:**
- Modify: `src/skills/loader.ts`

- [ ] **Step 1: Change the function signature and execute body**

In `src/skills/loader.ts`, change the `buildUseSkillTool` function signature from:

```typescript
export function buildUseSkillTool(skills: Skill[]): AgentTool<typeof useSkillParams> {
```

to:

```typescript
export function buildUseSkillTool(skills: Skill[], toolManager?: import("../agent/tool-manager.js").ToolManager): AgentTool<typeof useSkillParams> {
```

Replace the execute body (currently lines 126-138) with:

```typescript
    execute: async (_toolCallId, params) => {
      const skill = loadSkill(params.skill);
      if (!skill) {
        return {
          content: [{ type: "text" as const, text: `Skill "${params.skill}" 未找到。` }],
          details: null,
        };
      }

      // Activate skill tools if available
      if (toolManager) {
        toolManager.activate(params.skill);
      }

      // Build response: skill prompt + tool list
      let responseText = buildSkillActivation(skill);

      if (toolManager) {
        const toolsDesc = toolManager.getToolDescriptions(params.skill);
        if (toolsDesc) {
          responseText += `\n\n此技能提供了以下工具：\n${toolsDesc}`;
        }
      }

      return {
        content: [{ type: "text" as const, text: responseText }],
        details: { skillName: skill.name, toolsActivated: toolManager?.getToolCount(params.skill) ?? 0 },
      };
    },
```

- [ ] **Step 2: Re-export `ToolManager` type from `src/skills/index.ts`**

In `src/skills/index.ts`, add:

```typescript
import type { ToolManager } from "../agent/tool-manager.js";
export type { ToolManager };
```

Wait — actually this isn't needed if we use inline `import()` in loader.ts. The inline import is cleaner. Skip the index.ts change.

- [ ] **Step 3: Run tests to confirm existing behavior still works**

```bash
npx tsx src/test.ts 2>&1 | Select-Object -First 15
```

Expected: `buildAutoSkillPrompt`, `buildSkillActivation`, `buildManualSkillPrompt` all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/skills/loader.ts
git commit -m "feat: buildUseSkillTool accepts optional ToolManager for tool activation"
```

---

### Task 4: Wire ToolManager in `createSageAgent`

**Files:**
- Modify: `src/agent/index.ts`

- [ ] **Step 1: Add imports and create ToolManager**

In `src/agent/index.ts`, add import at top:

```typescript
import { ToolManager } from "./tool-manager.js";
import { getSageDir } from "../config/loader.js";
import { join } from "node:path";
```

- [ ] **Step 2: Change return type to include toolManager**

Change the function signature return type. The function currently implicitly returns `Agent`. Make it explicit:

```typescript
export function createSageAgent(
  model: Model<any>,
  options: {
    mode?: string;
    tavilyApiKey?: string;
    sessionId?: string;
  } = {},
): { agent: Agent; toolManager: ToolManager } {
```

- [ ] **Step 3: Create ToolManager and wire tools**

Replace the tool creation block (currently lines 20-33):

```typescript
  const autoSkills = getAutoSkills();
  const autoSkillPrompt = buildAutoSkillPrompt(autoSkills);

  const tools: AgentTool[] = [];

  if (autoSkills.length > 0) {
    tools.push(buildUseSkillTool(autoSkills));
  }

  tools.push(createWebFetchTool());

  if (tavilyApiKey) {
    tools.push(createWebSearchTool(tavilyApiKey));
  }
```

with:

```typescript
  const autoSkills = getAutoSkills();
  const autoSkillPrompt = buildAutoSkillPrompt(autoSkills);

  const skillsDir = join(getSageDir(), "skills");
  const toolManager = new ToolManager([], skillsDir);

  const tools: AgentTool[] = [];

  if (autoSkills.length > 0) {
    tools.push(buildUseSkillTool(autoSkills, toolManager));
  }

  tools.push(createWebFetchTool());

  if (tavilyApiKey) {
    tools.push(createWebSearchTool(tavilyApiKey));
  }
```

- [ ] **Step 4: Connect ToolManager to Agent and return both**

After `const agent = new Agent({...});` block (before the closing `}` of `createSageAgent`), add:

```typescript
  // Connect ToolManager to Agent so activate() can sync tools
  toolManager.setAgent(agent);
```

Change the return statement at the end from `return agent;` to:

```typescript
  return { agent, toolManager };
}
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit 2>&1
```

Expected: errors in app.ts because it still expects `createSageAgent` to return `Agent`. We'll fix that in Task 4.5.

- [ ] **Step 6: Commit**

```bash
git add src/agent/index.ts
git commit -m "feat: wire ToolManager into createSageAgent, return {agent, toolManager}"
```

---

### Task 4.5: Sync activeSkills in app.ts before session save

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Update createOrResumeSession to destructure toolManager**

At line 280, change from:

```typescript
  const agent = createSageAgent(model, {
```

to:

```typescript
  const { agent, toolManager } = createSageAgent(model, {
```

And update the return statement at line 290 from `return { session, agent, currentMode };` to:

```typescript
  return { session, agent, toolManager, currentMode };
```

- [ ] **Step 2: Capture toolManager in wireAgentEvents**

At top of app.ts, add import:

```typescript
import type { ToolManager } from "./agent/tool-manager.js";
```

Then update the `wireAgentEvents` function signature at line 295 to accept `toolManager`:

```typescript
function wireAgentEvents(
  agent: Agent,
  ctx: AppContext,
  tui: SageTUI,
  sessionManager: SessionManager,
  toolManager: ToolManager,
  updateStatusBar: () => void,
): void {
```

- [ ] **Step 3: Sync activeSkills before each saveCurrent**

In `wireAgentEvents`, at line 353 (inside `agent_end`), add before `sessionManager.updateMessages(...)`:

```typescript
      sessionManager.syncActiveSkills(toolManager.getActiveSkillNames());
```

At line 369-370 (inside SIGINT handler), add before `sessionManager.saveCurrent()`:

```typescript
    sessionManager.syncActiveSkills(toolManager.getActiveSkillNames());
```

- [ ] **Step 4: Sync on session switch**

In the handler functions for `onSessionNew` and `onSessionResume` (around lines 114 and 137), add before `ctx.sessionManager.saveCurrent()`:

```typescript
      ctx.sessionManager.syncActiveSkills(toolManager.getActiveSkillNames());
```

There are three `saveCurrent()` calls in the handler object (lines 96, 115, 143). Add the sync line before each:

Line 96 area (session delete handler, which calls saveCurrent):
```typescript
      ctx.sessionManager.syncActiveSkills(toolManager.getActiveSkillNames());
```
Line 115 area (onSessionNew):
```typescript
      ctx.sessionManager.syncActiveSkills(toolManager.getActiveSkillNames());
```
Line 143 area (onSessionResume):
```typescript
      ctx.sessionManager.syncActiveSkills(toolManager.getActiveSkillNames());
```

- [ ] **Step 5: Pass toolManager to wireAgentEvents and registerShutdown**

Find where `wireAgentEvents` is called in `run()` (around line 400+), and add `toolManager` as argument. Similarly for `registerShutdown`.

- [ ] **Step 6: Restore activeSkills on session resume**

In `onSessionResume` handler (line 137+), after `ctx.agent.state.messages = [...resumed.messages];` (line 156), add:

```typescript
      if (resumed.activeSkills && resumed.activeSkills.length > 0) {
        toolManager.activateFrom(resumed.activeSkills);
      }
```

- [ ] **Step 7: Build check**

```bash
npx tsc 2>&1
```

Expected: no errors.

- [ ] **Step 8: Run tests**

```bash
npx tsx src/test.ts 2>&1 | Select-Object -First 25
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app.ts
git commit -m "feat: sync activeSkills to session on save, restore on resume"
```

---

### Task 5: Session persistence — `activeSkills` field

**Files:**
- Modify: `src/session/manager.ts`

- [ ] **Step 1: Add `activeSkills` to Session type**

Add the field to the `Session` interface (line 13):

```typescript
export interface Session {
  id: string;
  name: string;
  description: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  activeSkills: string[];
}
```

- [ ] **Step 2: Initialize in `newSession`**

In the `newSession` method, add after `messages: []`:

```typescript
      activeSkills: [],
```

- [ ] **Step 3: Add `setActiveSkills` and `getActiveSkills` methods**

Add these methods before the closing `}` of `SessionManager`:

```typescript
  syncActiveSkills(names: string[]): void {
    if (this.current) {
      this.current.activeSkills = names;
    }
  }

  getActiveSkills(): string[] {
    return this.current?.activeSkills ?? [];
  }
```

- [ ] **Step 4: Backward-compatible load**

In `SessionManager.load()`, the parsed JSON may not have `activeSkills`. Add a default. Change line 106-110 to:

```typescript
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        ...data,
        name: data.name ?? data.title ?? data.id,
        description: data.description ?? "",
        activeSkills: data.activeSkills ?? [],
      } as Session;
```

- [ ] **Step 5: Verify types compile**

```bash
npx tsc 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add src/session/manager.ts
git commit -m "feat: session add activeSkills field for tool persistence"
```

---

### Task 6: Integration test — full use_skill → tool call flow

**Files:**
- Modify: `src/test.ts`

- [ ] **Step 1: Add integration test function**

Add this function before `function test()`:

```typescript
async function testSkillToolIntegration() {
  // Create a temp skill dir with a simple echo tool
  const tmpDir = join(tmpdir(), "sage-int-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "echo-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\ndescription: Echo skill for testing\n---\n");
  writeFileSync(join(skillDir, "tools.json"), JSON.stringify({
    tools: [{
      name: "echo",
      label: "Echo",
      description: "Returns the input message verbatim",
      parameters: {
        msg: { type: "string", required: true, description: "The message to echo" }
      },
      command: "node -e \"process.stdout.write('{{msg}}')\""
    }]
  }));

  // Override skills dir for testing — scan this temp dir instead
  // We test ToolManager directly here, since the full agent flow requires
  // the real skills dir path. This validates the full chain: scan → activate → execute.

  const baseTools: AgentTool[] = [];
  const mgr = new ToolManager(baseTools, tmpDir);

  // verify scan found the tool
  const scanCount = mgr.getToolCount("echo-skill");
  if (scanCount !== 1) {
    console.log("❌ testSkillToolIntegration FAILED: scan found", scanCount, "tools, expected 1");
    rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // activate
  mgr.activate("echo-skill");
  const active = mgr.getActiveTools();
  if (active.length !== 1 || active[0].name !== "echo") {
    console.log("❌ testSkillToolIntegration FAILED: active tools mismatch");
    rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // execute the echo tool
  const tool = active[0];
  const result = await tool.execute("call-1", { msg: "hello world" }, undefined);
  const text = (result.content[0] as any).text;

  const match = text === "hello world";

  if (match) {
    console.log("✅ testSkillToolIntegration passed");
  } else {
    console.log("❌ testSkillToolIntegration FAILED: got", JSON.stringify(text));
  }

  rmSync(tmpDir, { recursive: true, force: true });
}
```

You also need the `AgentTool` import in test.ts. Add before the existing ones:

```typescript
import type { AgentTool } from "@earendil-works/pi-agent-core";
```

- [ ] **Step 2: Call it in the test runner**

In `function test()`, add before the config loading block:

```typescript
  await testSkillToolIntegration();
  console.log();
```

- [ ] **Step 3: Run integration test**

```bash
npx tsx src/test.ts 2>&1 | Select-Object -First 25
```

Expected: `✅ testSkillToolIntegration passed`.

- [ ] **Step 4: Commit**

```bash
git add src/test.ts
git commit -m "test: add skill tool integration test (scan → activate → execute)"
```

---

### Task 7: Full build + test

- [ ] **Step 1: Run full test suite**

```bash
npx tsx src/test.ts 2>&1
```

Expected: ALL tests pass (unit + integration + LLM integration).

- [ ] **Step 2: Run type check**

```bash
npx tsc 2>&1
```

Expected: no errors.

- [ ] **Step 3: Final review of changed files**

```bash
git diff --name-only HEAD~6..HEAD
```

Expected only the 5 files listed in the File Map.

- [ ] **Step 4: Push**

```bash
git push
```
