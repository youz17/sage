# Thinking Display Redesign — Design Spec

**Date**: 2026-06-07  
**Status**: approved

## Problem

1. Thinking blocks appear **after** assistant message text (wrong visual order)
2. Multiple thinking blocks in one response merge into a single undifferentiated block
3. No way to collapse/expand thinking

## Goal

- Thinking always rendered **before** the assistant's response text
- Each `thinking_start`/`delta`/`end` cycle produces a separate block
- `Ctrl+T` toggles global collapse/expand of all thinking blocks

## Design

### Event Handling

Currently only `thinking_delta` is handled. Add handling for:

| Event | Behavior |
|---|---|
| `thinking_start` | Start a new block: add `[thinking]` label + empty text widget |
| `thinking_delta` | Append to current block's text |
| `thinking_end` | Finalize current block |

### Layout

`SageMessages` restructured so `startAssistantMessage` inserts a **thinking container** between the "Sage:" label and the streaming Markdown:

```
[Sage:]
  [thinking container]          ← all thinking blocks go here
    [thinking] block 1 text
    [thinking] block 2 text
  [streaming markdown]          ← response text
```

The `appendThinking` method writes into this container. `appendDelta` writes into the streaming markdown below it.

### Collapse/Expand

`SageMessages` holds a `_thinkingExpanded: boolean` (default `true`).

- `Ctrl+T` → toggles `_thinkingExpanded`, re-renders all thinking text widgets:
  - **Expanded**: `chalk.gray.italic(fullText)`
  - **Collapsed**: `chalk.gray.italic("[thinking]")`
- Toggle affects ALL visible thinking blocks (current and previous responses)
- State persists across message turns (only reset on `clearMessages`)

### Files

| File | Changes |
|---|---|
| `src/tui/index.ts` | `SageMessages`: add `_thinkingContainer`, `_thinkingExpanded`; refactor `startAssistantMessage`/`appendThinking`/`finishAssistantMessage`; add `toggleThinking()`; handle `thinking_start`/`_end` deltas |
| `src/app.ts` | `wireAgentEvents`: handle `thinking_start`/`thinking_end` event types; wire `Ctrl+T` key |

### Non-goals

- No per-block individual collapse (all-or-nothing toggle is sufficient)
- No thinking preserved in `restoreMessages` (complex content extraction)
