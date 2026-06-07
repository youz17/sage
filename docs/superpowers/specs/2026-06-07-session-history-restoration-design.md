# Session History Restoration — Design Spec

**Date**: 2026-06-07  
**Status**: approved

## Problem

1. **CLI startup**: `npm run start` (no `--new`) auto-resumes the last session's `agent.state.messages`, but the TUI renders blank — messages exist in agent state but are invisible to the user.
2. **Interactive resume**: `/session-resume` shows a 6-message text preview via `addSystemMessage()` (gray lines like `[You] ...` / `[Sage] ...`), not as real chat bubbles.

## Goal

Restore historical messages as properly styled chat bubbles (user green, assistant blue with markdown) on both CLI startup and interactive session resume.

## Design

### API Addition

`SageTUI` interface (`src/tui/index.ts`) gains one method:

```ts
restoreMessages(messages: AgentMessage[]): void;
```

- Clears current display
- Renders each message according to its role

### Message Rendering (by role)

| Role | Rendering |
|------|-----------|
| `user` | `addUserMessage(text)` — bold green "You:" label + plain text |
| `assistant` | `addAssistantMessage(text)` — bold blue "Sage:" label + markdown block **(new non-streaming method)** |
| `toolResult` | `addSystemMessage("[tool: <name>]")` — compact gray line; prefix `[tool error:]` if `isError` |

Content extraction: `string` content is used directly; array content joins `text` fields across all blocks.

### Implementation (3 files)

**1. `src/tui/index.ts` — `SageMessages` internal class**

- New method `addAssistantMessage(text: string)`: creates spacer + blue "Sage:" label + an `addChild()`-based non-streaming Markdown component. Does not touch `_streamingMarkdown` / `_streamingContent` state.
- New method `restoreMessages(messages: AgentMessage[])`: calls `clearMessages()`, then iterates messages, dispatching to `addUserMessage` / `addAssistantMessage` / `addSystemMessage` per role.
- Add import of `AgentMessage` from `@earendil-works/pi-agent-core`.

**2. `src/tui/index.ts` — `createSageTUI` factory**

- Wire `restoreMessages` in the returned `SageTUI` object: delegates to `messages.restoreMessages()`.

**3. `src/app.ts` — wiring**

- In `main()`: after `ctx.tui = tui`, if `session.messages.length > 0`, call `tui.restoreMessages(session.messages)`.
- In `onSessionResume` handler (`createTUIHandlers`): replace the 12-line system-message preview block (lines 165–192) with a single `ctx.tui.restoreMessages(resumed.messages)` call (which internally calls `clearMessages()`).

### Non-goals

- No lazy/partial loading — all messages restored at once. Pi TUI does viewport clipping; message count doesn't impact rendering performance.
- No message diff/merge — restoring always replaces the full display.
- No tool result detail expansion — compact one-line display only.

### Error handling

- `restoreMessages` is fire-and-forget. If any single message fails to extract text, the offending message is silently skipped (renders empty). Does not block subsequent messages.
