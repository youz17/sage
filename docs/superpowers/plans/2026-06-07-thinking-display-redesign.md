# Thinking Display Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thinking blocks rendered before message text, each `thinking_start`/`delta`/`end` cycle as separate block, `Ctrl+T` global collapse/expand.

**Architecture:** Refactor `SageMessages` to insert a thinking container between "Sage:" label and streaming markdown. Track all thinking blocks globally in a `_thinkingBlocks` array for toggle. Wire `thinking_start`/`thinking_end` events and `Ctrl+T` keybind.

**Tech Stack:** TypeScript, Pi TUI (Container, Text, Markdown), chalk

---

### Task 1: Refactor `SageMessages` — thinking container, blocks, toggle

**Files:**
- Modify: `src/tui/index.ts`

- [ ] **Step 1: Replace old thinking state with new fields**

In `SageMessages` class, replace:
```ts
  private _thinkingLabel: Text | null = null;
  private _thinkingContentText: Text | null = null;
  private _thinkingContent = "";
```
With:
```ts
  private _thinkingContainer: Container | null = null;
  private _currentThinkingBlock: { label: Text; text: Text; fullText: string } | null = null;
  private _thinkingBlocks: { label: Text; text: Text; fullText: string }[] = [];
  private _thinkingExpanded = true;
```

- [ ] **Step 2: Add `startThinking` and `endThinking` methods**

After `startAssistantMessage`, add:

```ts
  startThinking(): void {
    if (!this._thinkingContainer) return;
    const block = {
      label: new Text(`  ${chalk.gray.italic("[thinking]")}`),
      text: new Text("", 4, 0),
      fullText: "",
    };
    this._thinkingContainer.addChild(block.label);
    this._thinkingContainer.addChild(block.text);
    this._currentThinkingBlock = block;
    this._thinkingBlocks.push(block);
  }

  endThinking(): void {
    this._currentThinkingBlock = null;
  }
```

- [ ] **Step 3: Rewrite `appendThinking` to use separate blocks**

Replace old `appendThinking`:

```ts
  appendThinking(delta: string): void {
    if (!this._currentThinkingBlock) return;
    this._currentThinkingBlock.fullText += delta;
    if (this._thinkingExpanded) {
      this._currentThinkingBlock.text.setText(chalk.gray.italic(this._currentThinkingBlock.fullText));
    }
  }
```

- [ ] **Step 4: Rewrite `startAssistantMessage` to insert thinking container before markdown**

Replace old `startAssistantMessage`:

```ts
  startAssistantMessage(): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.blue("Sage:")}`));
    this._thinkingContainer = new Container();
    this.addChild(this._thinkingContainer);
    this._currentThinkingBlock = null;
    this._streamingMarkdown = new Markdown("", 2, 0, sageMarkdownTheme);
    this.addChild(this._streamingMarkdown);
    this._streamingContent = "";
  }
```

- [ ] **Step 5: Rewrite `finishAssistantMessage` — don't clear `_thinkingBlocks`**

Replace old `finishAssistantMessage`:

```ts
  finishAssistantMessage(): void {
    this._streamingMarkdown = null;
    this._streamingContent = "";
    this._thinkingContainer = null;
    this._currentThinkingBlock = null;
  }
```

- [ ] **Step 6: Add `toggleThinking` method**

```ts
  toggleThinking(): void {
    this._thinkingExpanded = !this._thinkingExpanded;
    for (const block of this._thinkingBlocks) {
      if (this._thinkingExpanded) {
        block.text.setText(chalk.gray.italic(block.fullText));
      } else {
        block.text.setText("");
      }
    }
  }
```

- [ ] **Step 7: Update `resetState` — only clear per-message state**

```ts
  resetState(): void {
    this._streamingMarkdown = null;
    this._streamingContent = "";
    this._thinkingContainer = null;
    this._currentThinkingBlock = null;
    // _thinkingBlocks and _thinkingExpanded persist across messages (cleared only in clearMessages)
  }
```

- [ ] **Step 8: Update `clearMessages` — clear everything**

```ts
  clearMessages(): void {
    this.clear();
    this.resetState();
    this._thinkingBlocks = [];
    this._thinkingExpanded = true;
  }
```

- [ ] **Step 9: Expose `toggleThinking` on `SageTUI` interface and factory**

In `SageTUI` interface (after `restoreMessages`):

```ts
  restoreMessages: (messages: AgentMessage[]) => void;
  toggleThinking: () => void;
```

In `createSageTUI` return object (after `restoreMessages` block):

```ts
    restoreMessages(msgs: AgentMessage[]) {
      messages.restoreMessages(msgs);
      tui.requestRender();
    },
    toggleThinking() {
      messages.toggleThinking();
      tui.requestRender();
    },
```

- [ ] **Step 10: Run type check**

```bash
npm run build
```
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/tui/index.ts
git commit -m "feat(tui): thinking blocks before text, separate blocks, Ctrl+T toggle"
```

---

### Task 2: Wire `thinking_start`/`thinking_end` + `Ctrl+T` keybind in `app.ts`

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Handle `thinking_start` and `thinking_end` in `wireAgentEvents`**

In the `message_update` handler (inside `agent.subscribe`), replace:
```ts
      if (ae.type === "thinking_delta") {
        tui.onThinkingDelta(ae.delta);
      }
```
With:
```ts
      if (ae.type === "thinking_start") {
        tui.onThinkingStart();
      }
      if (ae.type === "thinking_delta") {
        tui.onThinkingDelta(ae.delta);
      }
      if (ae.type === "thinking_end") {
        tui.onThinkingEnd();
      }
```

- [ ] **Step 2: Add `onThinkingStart` and `onThinkingEnd` to `SageTUI` and factory**

In `SageTUI` interface:
```ts
  onThinkingStart: () => void;
  onThinkingDelta: (delta: string) => void;
  onThinkingEnd: () => void;
```

In `createSageTUI` return object:
```ts
    onThinkingStart() {
      messages.startThinking();
      tui.requestRender();
    },
    onThinkingDelta(delta: string) {
      messages.appendThinking(delta);
      tui.requestRender();
    },
    onThinkingEnd() {
      messages.endThinking();
      tui.requestRender();
    },
```

- [ ] **Step 3: Wire `Ctrl+T` keybind**

In `createSageTUI`, after the existing `tui.addInputListener` for Ctrl+C/D (around line 350), add:

```ts
  tui.addInputListener((data: string) => {
    if (matchesKey(data, Key.ctrl("t"))) {
      tui.toggleThinking();
      return { consume: true };
    }
    return undefined;
  });
```

- [ ] **Step 4: Run type check**

```bash
npm run build
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/tui/index.ts
git commit -m "feat(app): wire thinking_start/end events, Ctrl+T keybind"
```
