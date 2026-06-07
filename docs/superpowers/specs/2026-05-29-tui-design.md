# TUI Design Spec

## Overview

A Claude-Code-style terminal interface for Better Chat Agent. Scrolling conversation flow, no split panels. Pure ANSI + raw mode, no UI framework.

## Layout

```
┌──────────────────────────────────────────────┐
│  Better Chat Agent                           │
│                                              │
│  You: message...                             │
│                                              │
│  Agent [mode]:                               │
│    ▶ tool_name({args})          (yellow)      │
│    ✓ tool_name result (...)     (green, dim)  │
│                                              │
│    Markdown-rendered response...             │
│                                              │
├──────────────────────────────────────────────┤
│  [deep] > /ch█                               │
│  ┌──────────────┐                            │
│  │ /challenge   │  ← autocomplete menu       │
│  └──────────────┘                            │
└──────────────────────────────────────────────┘
```

## Features

### 1. Markdown Rendering
- Use `marked` + `marked-terminal` to convert agent markdown output to ANSI-colored terminal text.
- Applied to final agent responses (not intermediate chunks — render after `text_done`).

### 2. Streaming Output
- Agent response text appears character-by-character as chunks arrive.
- Raw chunks during streaming, markdown-rendered on completion.

### 3. Tool Call Display
- Tool call: yellow text `▶ tool_name({args})`
- Tool result: green text `✓ tool_name result`, content truncated to 150 chars, dim.

### 4. Mode Display & Tab Switching
- Input prompt shows current mode: `[socratic] > `
- Tab key cycles through modes: socratic → direct → discuss → deep → perspectives.
- Mode change displayed inline.

### 5. Slash Command Autocomplete
- Typing `/` shows a popup menu of available commands (skills + /mode + /quit).
- Continued typing filters the list.
- Tab selects the highlighted item and inserts it.
- Up/Down arrows navigate the menu.
- Escape or backspace past `/` dismisses the menu.
- Completable items: `/reflect`, `/challenge`, `/goal`, `/mode`, `/quit`.

### 6. Input History
- Up/Down arrow keys (when autocomplete menu is not showing) browse previously sent messages.
- History is in-memory only, not persisted.

### 7. Multi-line Input
- Enter sends the message.
- Shift+Enter inserts a newline.
- Multi-line buffer displayed correctly with line wrapping.

### 8. Loading Spinner
- While agent is processing, show a braille spinner animation: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`
- Spinner clears when first output chunk arrives.

## Technical Design

### Input Handling (raw mode)
- `process.stdin.setRawMode(true)` to capture individual keystrokes.
- Custom `InputEditor` class manages:
  - Character buffer (multi-line)
  - Cursor position (row, col)
  - History stack
  - Autocomplete state

### Key Bindings
| Key | Action |
|-----|--------|
| Printable char | Insert at cursor |
| Enter | Send message |
| Shift+Enter | Insert newline |
| Backspace | Delete char before cursor |
| Left/Right | Move cursor |
| Up/Down (no menu) | History navigation |
| Up/Down (menu open) | Navigate autocomplete |
| Tab (no menu) | Cycle mode |
| Tab (menu open) | Accept autocomplete selection |
| `/` | Insert `/` and open autocomplete menu |
| Escape | Dismiss autocomplete / clear input |
| Ctrl+C | Exit |

### File Structure
```
src/tui/
  index.ts      — Entry point: init agent, start TUI loop
  input.ts      — InputEditor: raw mode, keypress, multi-line, history, cursor
  completer.ts  — Autocomplete: menu rendering, filtering, selection
  renderer.ts   — Output: markdown rendering, tool calls, spinner
```

### Dependencies
- `marked` — markdown parser
- `marked-terminal` — markdown to ANSI terminal renderer

### Out of Scope
- Split panels / sidebar
- Thinking content display
- Mouse support
- Persistent history
- Syntax highlighting in code blocks (beyond what marked-terminal provides)
