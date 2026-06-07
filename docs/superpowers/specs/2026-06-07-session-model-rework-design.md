# Session Model Rework — Design Spec

**Date**: 2026-06-07  
**Status**: approved

## Problem

1. Session `title` auto-fills from first user message on save — couples display name to content
2. Session picker (list/resume/delete) shows only `title`, no context about what the session contains
3. No way to rename a session after creation

## Goal

Decouple session identity (`name`) from content preview (`description`), add rename, and unify the session picker display format.

## Design

### Session Model Changes

| Field | Old | New |
|---|---|---|
| `title: string` | first user message (auto on save) | **removed** |
| `name: string` | — | **new**, defaults to `id` |
| `description: string` | — | **new**, first user message (max 50 chars), auto on save |

`Session` interface after:

```ts
export interface Session {
  id: string;
  name: string;       // user-settable short label, default = id
  description: string; // first user message preview, auto-set on save
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}
```

**Backward compat**: loading old sessions — if `name` missing, fall back to `title ?? id`.

### Unified Picker Format

`session-list`, `session-resume` autocomplete, `session-delete` autocomplete all render:

```
<name>: <description>
```

Example:

```
my-project: 帮我写一个 Python 的 HTTP server 框架...
```

Autocomplete provider for sessions returns `name: description` as each option string.

### `generateTitle` → `generateDescription`

Current `generateTitle(messages)` → first user message, 30 chars.  
Changed to `generateDescription(messages)` → first user message, 50 chars.  
Called in `saveCurrent()` when `description` is empty.

### `/session-rename <name>`

- Sets current session's `name`
- **Uniqueness check**: scans all saved sessions; if another session (different `id`) already has `name`, rejects with `Session "xxx" already exists.`
- Updates `updatedAt`
- Refreshes status bar (which shows `sessionName`)

### Non-goals

- No fuzzy search on session names
- No session `name` migration prompt — just handle missing `name` gracefully on load
- No session rename via `--new` flag — only via TUI command

### Files Touched

| File | Changes |
|---|---|
| `src/session/manager.ts` | `Session.title` → `name` + `description`; `generateTitle` → `generateDescription`; add `setName()`; backward-compat in `resume()` |
| `src/app.ts` | `onSessionNew` default name; `onSessionList` format; autocomplete format; add `onSessionRename` handler; status bar |
| `src/tui/index.ts` | `SageTUIHandlers` + `onSessionRename` |

### Error Handling

- `/session-rename` with no session active → "No active session."
- `/session-rename` with duplicate name → "Session 'xxx' already exists."
- Old session files without `name` field → `resume()` sets `name = data.title ?? data.id`
