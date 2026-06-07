# TODO Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 code-level TODOs and rewrite 5 comment-level TODOs to be more actionable.

**Architecture:** 8 independent changes across 7 files. Grouped into 4 tasks.

---

### Task 1: `extractAssistantText` reverse for loop

**Files:** Modify: `src/app.ts`

- [ ] **Step 1: Replace the function**

Replace lines 51-57:
```ts
function extractAssistantText(messages: AgentMessage[]): string {
    // TODO: 直接反向for循环效率更高
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return JSON.stringify(last.content).slice(0, 1000);
}
```
With:
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

- [ ] **Step 2: Run type check**
```bash
npm run build
```
Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add src/app.ts
git commit -m "perf(app): use reverse for loop in extractAssistantText"
```

---

### Task 2: Move `findSessionByName` → `SessionManager.findByName` + rename `resume` → `load`

**Files:** Modify: `src/session/manager.ts`, `src/app.ts`

- [ ] **Step 1: Rename `resume` → `load` and add `findByName` in `SessionManager`**

In `src/session/manager.ts`:

a) Rename `static resume(sessionId)` → `static load(sessionId)` (line ~93):
```ts
  static load(sessionId: string): Session | null {
```

b) Add new static method `findByName` (before `load`):
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

- [ ] **Step 2: Update `app.ts` — remove standalone `findSessionByName`, update all callers**

In `src/app.ts`:

a) Delete the `findSessionByName` function (lines 59-68)

b) Replace all `findSessionByName(x)` with `SessionManager.findByName(x)`:
   - In `onSessionResume` handler
   - In `initSession` (CLI `--resume` path)

c) Replace all `SessionManager.resume(x)` with `SessionManager.load(x)`:
   - In `initSession` (auto-resume paths)

- [ ] **Step 3: Run type check**
```bash
npm run build
```
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add src/session/manager.ts src/app.ts
git commit -m "refactor(session): move findSessionByName into SessionManager.findByName, rename resume→load"
```

---

### Task 3: Compaction log

**Files:** Modify: `src/agent/memory.ts`

- [ ] **Step 1: Add logger call when compaction triggers**

Replace line 41:
```ts
  // TODO: 需要触发压缩的时候日志
```
With:
```ts
  logger?.log("memory:compact", { inputCount: messages.length, splitPoint });
```

Move this line right after the `splitPoint` calculation (after line 42) so it logs before doing the actual compaction work.

- [ ] **Step 2: Run type check**
```bash
npm run build
```
Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add src/agent/memory.ts
git commit -m "feat(agent): log when memory compaction triggers"
```

---

### Task 4: Rewrite TODOs (text-only changes)

**Files:** Modify: `src/log/logger.ts`, `src/app.ts`, `src/tui/index.ts`, `src/skills/loader.ts`, `src/core/modes.ts`

- [ ] **Step 1: `src/log/logger.ts` lines 36-37**

Replace both TODO lines:
```ts
// TODO: log用对象的形式暴露接口往往有点过度设计
// TODO: log需要简单区分级别
```
With:
```ts
// IMPROVE: Logger should expose level-based methods (info/warn/error) instead of a generic log(key, data)
```

- [ ] **Step 2: `src/app.ts` line ~289**

Replace:
```ts
  const activeSkills: string[] = [];// TODO: 需要active skill的概念吗？虽然可以考虑在 mode 上抽一层，但暂时应该不需要
```
With:
```ts
  const activeSkills: string[] = [];// CONSIDER: should active skills be tracked explicitly, or derived from mode context?
```

- [ ] **Step 3: `src/tui/index.ts` line ~82**

Replace:
```ts
    // TODO: custom skills
```
With:
```ts
    // TODO: support user-defined custom skills in addition to built-in ones
```

- [ ] **Step 4: `src/skills/loader.ts` — consolidate 4 scattered TODOs**

Find the 4 TODO lines (lines ~20, ~40, ~76, ~140) and consolidate the first 3 into one at ~20, remove the others:

At line ~20, replace:
```ts
// TODO: 和 mode 逻辑相似
```
With:
```ts
// IMPROVE: extract shared file-walking + YAML parsing logic used by both skill loader and mode loader
```

Remove the duplicate TODO lines at ~40 and ~76. Keep line ~140 unchanged (it's about skill organization, a different concern).

- [ ] **Step 5: `src/core/modes.ts` lines ~14, ~31**

Replace the two TODO lines:
```ts
// TODO: 通用能力, 考虑抽取
```
With:
```ts
// IMPROVE: extract shared file-walking + YAML parsing logic into a common utility (see also skills/loader.ts)
```

```ts
// TODO: 这种路径没有更合理的处理吗？
```
With:
```ts
// IMPROVE: use a configurable base path instead of hardcoded __dirname resolution
```

- [ ] **Step 6: Run type check**
```bash
npm run build
```
Expected: PASS (text-only changes, no logic affected)

- [ ] **Step 7: Commit**
```bash
git add src/log/logger.ts src/app.ts src/tui/index.ts src/skills/loader.ts src/core/modes.ts
git commit -m "docs: rewrite TODOs to be more actionable"
```
