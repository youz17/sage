# TODO Cleanup — Implementation Plan (revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 8 code improvements cleaned up from TODO comments across 7 files.

**Architecture:** 6 independent tasks. Task 5 creates a new shared utility, Task 6 integrates custom skills at startup.

---

### Task 1: Reverse for loop + `findSessionByName` → `SessionManager.load` rename

**Files:** Modify: `src/app.ts`, `src/session/manager.ts`

- [ ] **Step 1: Reverse for loop in `extractAssistantText`**

In `src/app.ts`, replace lines 51-57:
```ts
function extractAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (typeof m.content === "string") return m.content;
    return JSON.stringify(m.content).slice(0, 1000);
  }
  return "";
}
```

- [ ] **Step 2: Rename `resume` → `load` in `src/session/manager.ts`**

Change method name `static resume` → `static load` (line ~93). No signature change.

- [ ] **Step 3: Add `SessionManager.findByName` static method**

Insert after `load()` in `src/session/manager.ts`:
```ts
  static findByName(name: string): Session | null {
    const sessions = SessionManager.list();
    const match = sessions.find(
      (s) =>
        s.id === name ||
        s.id.startsWith(name) ||
        (s.name && s.name.toLowerCase().includes(name.toLowerCase())),
    );
    if (match) {
      return SessionManager.load(match.id);
    }
    return null;
  }
```

- [ ] **Step 4: Update `app.ts` — remove standalone function, update callers**

Delete `findSessionByName` function (lines 59-68). Replace all references:
- `findSessionByName(x)` → `SessionManager.findByName(x)` (in `onSessionResume` and `initSession`)
- `SessionManager.resume(x)` → `SessionManager.load(x)` (in `initSession`)

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add src/app.ts src/session/manager.ts
git commit -m "perf: reverse for loop, move findByName to SessionManager, rename resume→load"
```

---

### Task 2: Compaction log

**Files:** Modify: `src/agent/memory.ts`

- [ ] **Step 1: Add log call**

After `splitPoint` calculation (after line 42), insert:
```ts
  logger?.log("memory:compact", { inputCount: messages.length, splitPoint });
```

Remove the TODO comment on line 41.

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/agent/memory.ts
git commit -m "feat(agent): log when memory compaction triggers"
```

---

### Task 3: Logger level-based methods

**Files:** Modify: `src/log/logger.ts`, `src/app.ts`, `src/agent/memory.ts`

- [ ] **Step 1: Add `info`/`warn`/`error` methods to Logger**

In `src/log/logger.ts`, add to the Logger class:
```ts
  info(key: string, data?: Record<string, unknown>): void {
    this.log(`info:${key}`, data ?? {});
  }
  warn(key: string, data?: Record<string, unknown>): void {
    this.log(`warn:${key}`, data ?? {});
  }
  error(key: string, data?: Record<string, unknown>): void {
    this.log(`error:${key}`, data ?? {});
  }
```

- [ ] **Step 2: Update callers in `src/app.ts`**

Replace:
- `logger.log("session:init", ...)` → `logger.info("session:init", ...)`
- `logger.log("error", ...)` → `logger.error("error", ...)`
- `logger.log("agent:error", ...)` → `logger.error("agent:error", ...)`
- `logger.log("session:new", ...)` → `logger.info("session:new", ...)`
- `logger.log("session:resume", ...)` → `logger.info("session:resume", ...)`
- `logger.log("session:rename", ...)` → `logger.info("session:rename", ...)`
- `logger.log("session:save", ...)` → `logger.info("session:save", ...)`
- `logger.log("mode:change", ...)` → `logger.info("mode:change", ...)`
- `logger.log("agent:prompt", ...)` → `logger.info("agent:prompt", ...)`
- `logger.log("agent:response", ...)` → `logger.info("agent:response", ...)`
- `logger.log("skill:activate", ...)` → `logger.info("skill:activate", ...)`
- `logger.log("skill:deactivate", ...)` → `logger.info("skill:deactivate", ...)`
- `logger.log("tool:start", ...)` → keep as `log` (structured tool log)
- `logger.log("tool:end", ...)` → keep as `log`
- `logger.log("agent:empty_response", ...)` → `logger.warn("agent:empty_response", ...)` 

- [ ] **Step 3: Update caller in `src/agent/memory.ts`**

Replace `logger?.log("memory:compact", ...)` (added in Task 2) → `logger?.info("memory:compact", ...)`

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/log/logger.ts src/app.ts src/agent/memory.ts
git commit -m "feat(log): add info/warn/error level methods to Logger"
```

---

### Task 4: Remove `activeSkills`, load all skills always

**Files:** Modify: `src/app.ts`

- [ ] **Step 1: Remove `activeSkills` array and toggle logic**

In `createTUIHandlers`:
- Delete `activeSkills: string[]` from AppContext and all references
- Replace `onSkillActivate` handler to directly toggle the skill in agent's state (or if all skills are always active, make it a no-op or remove)

In `main()`:
- Delete `let activeSkills: string[] = []`
- Pass all loaded skill names to `initSession` (or just pass `[]` since skills are always active)

In `buildSystemPrompt` calls: pass `[]` (all skills active by default, no filtering)

- [ ] **Step 2: Clean up logging**

Remove `skill:activate`/`skill:deactivate` log calls (or replace with skill-triggered logs).

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app.ts
git commit -m "refactor(app): remove activeSkills toggle, all skills always active"
```

---

### Task 5: Extract shared file-walking + YAML utility

**Files:** Create: `src/core/file-loader.ts`; Modify: `src/skills/loader.ts`, `src/core/modes.ts`

- [ ] **Step 1: Create `src/core/file-loader.ts`**

```ts
import * as fs from "node:fs";
import * as path from "node:path";

export function walkDir(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function loadYamlFiles<T>(dir: string): T[] {
  // Use existing YAML parsing approach from loader.ts/modes.ts
  const yaml = require("js-yaml");  // or import, follow existing pattern
  const files = walkDir(dir, ".yaml").concat(walkDir(dir, ".yml"));
  return files.map((f) => yaml.load(fs.readFileSync(f, "utf-8")) as T);
}
```

- [ ] **Step 2: Refactor `src/skills/loader.ts` to use `file-loader`**

Replace file-walking + YAML parsing with calls to the new utilities.

- [ ] **Step 3: Refactor `src/core/modes.ts` to use `file-loader`**

Same — replace file-walking + YAML parsing. Also fix hardcoded path: use `getSubdir("modes")` from config instead of `__dirname`.

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/core/file-loader.ts src/skills/loader.ts src/core/modes.ts
git commit -m "refactor(core): extract shared file-walking and YAML utility"
```

---

### Task 6: Custom skills at startup

**Files:** Modify: `src/app.ts`, `src/skills/loader.ts`, `src/tui/index.ts`

- [ ] **Step 1: Expose skill list from loader**

Ensure `src/skills/loader.ts` exports a function that returns all loaded custom skill names (e.g., `listCustomSkills()`).

- [ ] **Step 2: Register custom skills as agent tools in `main()`**

After agent creation, load custom skills and register each as an agent tool. Use the agent's tool registration API (check `createSageAgent` source for how tools are added).

- [ ] **Step 3: Register custom skill names as slash commands in `buildCommands()`**

In `src/tui/index.ts`, dynamically add a command entry for each custom skill name. The command triggers the corresponding tool via the agent.

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/app.ts src/skills/loader.ts src/tui/index.ts
git commit -m "feat: load custom skills at startup, register as tools and commands"
```
