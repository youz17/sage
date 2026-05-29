# Sage: Configuration, Extensibility & Session Management

## Overview

Rename project to `sage`. Add a `~/.sage/` config directory for customizable modes, skills, rules, model config, and persistent sessions.

## Config Directory: `~/.sage/`

```
~/.sage/
  config.json           ← Model, API keys, default mode
  modes/                ← Custom mode .md files (filename = mode name)
  skills/               ← Custom skill .md files (filename = skill name)
  rules/                ← Global rules .md files (always injected into system prompt)
  sessions/             ← Persistent session JSON files
```

On first run, auto-create this directory with a default `config.json`.

## config.json

```json
{
  "model": {
    "provider": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "apiKey": ""
  },
  "defaultMode": "socratic",
  "tavilyApiKey": ""
}
```

`provider` is any OpenAI-compatible base URL. Only `provider`, `model`, and `apiKey` are needed to switch to any LLM.

## Custom Modes

- Place `.md` files in `~/.sage/modes/`.
- Filename (without extension) becomes the mode name.
- File content is the mode prompt (injected when mode is active).
- Custom modes appear in Tab cycling and `/mode` completion.
- Same-name custom mode overrides builtin.

Example: `~/.sage/modes/coder.md`

## Custom Skills

- Place `.md` files in `~/.sage/skills/`.
- Filename becomes the skill command name.
- File content is the skill prompt.
- Custom skills appear in `/` autocomplete.
- Same-name custom skill overrides builtin.

## Rules

- Place `.md` files in `~/.sage/rules/`.
- ALL rule files are always loaded and injected into the system prompt.
- No activation needed — just place the file.
- Use case: "always respond in Chinese", "I'm a PM, consider business viability".

## Session Management

### Storage

Each session is a JSON file in `~/.sage/sessions/`:

```json
{
  "id": "2026-05-29-a1b2c3",
  "title": "First 30 chars of first message",
  "mode": "deep",
  "createdAt": "2026-05-29T17:00:00Z",
  "updatedAt": "2026-05-29T17:30:00Z",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Commands

- `/session new` — Save current, start fresh session
- `/session list` — List all saved sessions (id, title, date)
- `/session resume <id|number>` — Restore a session
- `/session delete <id|number>` — Delete a session

### Behavior

- On startup: auto-resume last active session (unless `--new` flag).
- Auto-save after every message exchange (no data loss on crash).
- Title auto-generated from first user message (first 30 chars).

## Ctrl+D Exit

Ctrl+D triggers the same exit flow as Ctrl+C: save current session, then exit.

## LLM Provider

`model.provider` in config.json is the base URL. The client appends `/chat/completions`. Any OpenAI-compatible API works:

- DeepSeek: `https://api.deepseek.com/v1`
- OpenAI: `https://api.openai.com/v1`
- Local: `http://localhost:8080/v1`

## Changes Required

| Action | File |
|--------|------|
| New | `src/config/loader.ts` — Load/init `~/.sage/`, read config.json |
| New | `src/config/types.ts` — Config type definitions |
| New | `src/session/manager.ts` — Session CRUD + file I/O |
| Modify | `src/core/modes.ts` — Dynamic load: builtin + `~/.sage/modes/` |
| Modify | `src/skills/loader.ts` — Dynamic load: builtin + `~/.sage/skills/` |
| Modify | `src/core/prompts.ts` — Inject rules from `~/.sage/rules/` |
| Modify | `src/tui/index.ts` — Config-driven init, session integration |
| Modify | `src/tui/input.ts` — Ctrl+D, session commands, dynamic completions |
| Modify | `src/tui/completer.ts` — Dynamic items from scanned directories |
| Modify | `package.json` — Rename to sage |
