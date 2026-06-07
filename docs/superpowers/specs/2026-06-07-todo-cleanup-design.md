# TODO Cleanup — Design Spec

**Date**: 2026-06-07  
**Status**: approved

## Scope

Fix or rewrite actionable TODOs across `src/`. Excludes: prompt adjustments, status bar compression, `agent/index.ts:20`, `session/manager.ts:10`.

---

### 1. `app.ts:52` — reverse for loop in `extractAssistantText`

**Change**: `[...messages].reverse().find()` → explicit reverse for loop.
Saves one full-array copy and one reverse allocation.

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

### 2. `app.ts:60` — move `findSessionByName` into `SessionManager`

**Change**: `findSessionByName(name)` → `SessionManager.findByName(name)` (static).
Remove the standalone function from `app.ts`, add it as a static method on `SessionManager`.
Callers: `onSessionResume` handler, `initSession`, `findSessionByName` references.

### 3. `session/manager.ts:101` — rename `resume()` → `load()`

**Change**: `SessionManager.resume(id)` → `SessionManager.load(id)`.
Update all callers in `app.ts` (several in `initSession`, `onSessionResume`).

### 4. `agent/memory.ts:41` — compaction log

**Change**: add a log line when compaction triggers.
The `compactMemory` function receives a `logger` parameter from the SageAgent config. Use it:
```ts
logger?.log("memory:compact", { inputCount: messages.length, splitPoint });
```

### 5–10. TODO rewrites (text-only, no logic change)

| # | File | Current | Rewrite |
|---|------|---------|---------|
| 6 | `log/logger.ts:36` | "log用对象的形式暴露接口往往有点过度设计" | `// IMPROVE: Logger should expose level-based methods (info/warn/error) instead of a generic log(key, data)` |
| 6 | `log/logger.ts:37` | "log需要简单区分级别" | (merged into above) |
| 7 | `app.ts:289` | "需要active skill的概念吗" | `// CONSIDER: should active skills be tracked explicitly, or derived from mode context?` |
| 8 | `tui/index.ts:82` | "custom skills" | `// TODO: support user-defined custom skills in addition to built-in ones` |
| 9 | `skills/loader.ts` (4处) | scattered "和mode逻辑相似" / "提取公共逻辑" | consolidate into 1: `// IMPROVE: extract shared file-walking + YAML parsing logic used by both skill loader and mode loader` |
| 10 | `core/modes.ts` (2处) | "通用能力, 考虑抽取" / "这种路径没有更合理的处理吗" | `// IMPROVE: extract shared file-walking + YAML parsing logic into a common utility (see also skills/loader.ts)` |

### Non-goals

- `agent/index.ts:20` (kept as-is)
- `session/manager.ts:10` (kept as-is)
- `core/prompts.ts:5` (prompt — excluded)
- `tui/index.ts:112` (status bar — excluded)
