# TODO Cleanup — Design Spec (revised)

**Date**: 2026-06-07  
**Status**: approved

Scope: 8 code changes across 7 files. Excludes: prompt, status bar, `Date type?` TODO.

---

### 1. `extractAssistantText` — reverse for loop

**File**: `src/app.ts`  
Replace `[...messages].reverse().find()` with explicit reverse for loop.

### 2. `findSessionByName` → `SessionManager` + `resume` → `load`

**Files**: `src/session/manager.ts`, `src/app.ts`  
- Add `SessionManager.findByName(name)` static method  
- Rename `SessionManager.resume()` → `SessionManager.load()`  
- Remove standalone `findSessionByName` from `app.ts`, update all callers

### 3. Compaction log

**File**: `src/agent/memory.ts`  
Call `logger.log("memory:compact", ...)` when compaction triggers.

### 4. Logger level-based methods

**File**: `src/log/logger.ts`, `src/app.ts`, `src/agent/memory.ts`  
- Add `info(label, data?)` / `warn(label, data?)` / `error(label, data?)` methods to `Logger`  
- Map to existing `log(key, data)` internally: `info("x", d)` → `log("info:x", d)`, etc.  
- Update all callers to use level-based methods where appropriate:  
  - `logger.log("session:init", ...)` → `logger.info("session:init", ...)`  
  - `logger.log("error", ...)` → `logger.error("error", ...)`  
  - `logger.log("tool:start", ...)` → keep as `log` (not a level)  
  - Rule: if key starts with `"error"` or `"warn"`, use level method; otherwise keep `log` if it's a structured event key, or use `info` for general messages

### 5. Remove `activeSkills`, always load all skills

**Files**: `src/app.ts`  
- Delete `activeSkills: string[]` state and all toggle logic in `onSkillActivate`  
- Skills are either always active (built-in) or loaded at startup (custom)  
- `buildSystemPrompt` receives empty array or all loaded skill names  
- Remove skill toggle logging (`skill:activate`/`skill:deactivate`)

### 6. Custom skills — load at startup, register as tools + commands

**Files**: `src/app.ts`, `src/agent/index.ts`, `src/skills/loader.ts`, `src/tui/index.ts`  
- `skills/loader.ts` already has the loading logic; expose loaded skill list  
- In `main()`: after startup, load all custom skills from the skills directory  
- Register each custom skill as an agent tool (via `createSageAgent` options or post-creation)  
- Register each custom skill name as a slash command (via `buildCommands()` in tui)  
- `/skillname` triggers the agent to use that skill's tool  
- No hot reload — one-time load at startup

### 7. Extract shared file-walking + YAML parsing

**Files**: `src/skills/loader.ts`, `src/core/modes.ts`, new `src/core/file-loader.ts`  
- Create `src/core/file-loader.ts` with:  
  - `walkDir(dir, ext)` — recursively list files with given extension  
  - `loadYamlFiles<T>(dir)` — load all `.yaml`/`.yml` files from dir, parse, return `T[]`  
- Refactor `loader.ts` and `modes.ts` to use these utilities

### 8. `modes.ts` hardcoded path

**File**: `src/core/modes.ts`  
Replace `__dirname`-based path resolution with `getSubdir("modes")` from config layer (consistent with how sessions/skills do it).
