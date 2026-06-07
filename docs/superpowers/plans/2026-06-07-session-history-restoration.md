# Session History Restoration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore historical session messages as styled chat bubbles (user green, assistant blue with markdown) on both CLI startup and interactive session resume.

**Architecture:** Add `restoreMessages(messages: AgentMessage[])` to `SageTUI`. Implement internally via two new methods on the `SageMessages` class: `addAssistantMessage` (non-streaming assistant bubble) and `restoreMessages` (dispatches per role). Wire in `createSageTUI`. Call from `main()` startup and `onSessionResume`.

**Tech Stack:** TypeScript, Pi TUI (`Markdown`, `Text`, `Spacer`, `Container`), `@earendil-works/pi-agent-core` types.

---

### Task 1: Add `addAssistantMessage` and `restoreMessages` to `SageMessages`

**Files:**
- Modify: `src/tui/index.ts:1-18` (add import), `src/tui/index.ts:131-208` (add methods)

- [ ] **Step 1: Add `AgentMessage` type import**

Add after the existing imports in `src/tui/index.ts`:

```ts
import type { AgentMessage } from "@earendil-works/pi-agent-core";
```

- [ ] **Step 2: Add `addAssistantMessage` method to `SageMessages` class**

Insert after the existing `addToolCall` method (`src/tui/index.ts` line ~202):

```ts
  addAssistantMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.blue("Sage:")}`));
    const md = new Markdown(text, 2, 0, sageMarkdownTheme);
    this.addChild(md);
  }
```

- [ ] **Step 3: Add `restoreMessages` method to `SageMessages` class**

Insert after `addAssistantMessage`:

```ts
  restoreMessages(messages: AgentMessage[]): void {
    this.clearMessages();
    for (const msg of messages) {
      if (msg.role === "user") {
        const text = getMessageText(msg);
        this.addUserMessage(text);
      } else if (msg.role === "assistant") {
        const text = getMessageText(msg);
        this.addAssistantMessage(text);
      } else if (msg.role === "toolResult") {
        const label = (msg as { isError?: boolean; toolName?: string }).isError
          ? `[tool error: ${(msg as { toolName: string }).toolName}]`
          : `[tool: ${(msg as { toolName: string }).toolName}]`;
        this.addSystemMessage(label);
      }
    }
  }
```

- [ ] **Step 4: Add `getMessageText` helper function**

Insert before `restoreMessages` (private module-level helper in `src/tui/index.ts`, above the `SageMessages` class around line 129):

```ts
function getMessageText(msg: AgentMessage): string {
  const content = (msg as { content: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { text?: string } => typeof c === "object" && c !== null && "text" in c)
      .map((c) => c.text || "")
      .join("\n");
  }
  return "";
}
```

- [ ] **Step 5: Run type check**

```bash
npm run build
```
Expected: PASS (no errors)

- [ ] **Step 6: Commit**

```bash
git add src/tui/index.ts
git commit -m "feat(tui): add restoreMessages for session history rendering"
```

---

### Task 2: Wire `restoreMessages` into `SageTUI` interface and `createSageTUI`

**Files:**
- Modify: `src/tui/index.ts:212-223` (SageTUI interface), `src/tui/index.ts:322-355` (factory return)

- [ ] **Step 1: Add `restoreMessages` to `SageTUI` interface**

In `SageTUI` interface (line ~220, after `clearMessages`):

```ts
  clearMessages: () => void;
  restoreMessages: (messages: AgentMessage[]) => void;
  addErrorMessage: (text: string) => void;
```

- [ ] **Step 2: Wire `restoreMessages` in `createSageTUI` return object**

In the returned object (line ~349, after `clearMessages`):

```ts
    clearMessages() {
      messages.clearMessages();
      tui.requestRender();
    },
    restoreMessages(msgs: AgentMessage[]) {
      messages.restoreMessages(msgs);
      tui.requestRender();
    },
    addErrorMessage(text: string) {
```

- [ ] **Step 3: Run type check**

```bash
npm run build
```
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add src/tui/index.ts
git commit -m "feat(tui): expose restoreMessages on SageTUI public API"
```

---

### Task 3: Call `restoreMessages` at startup and on interactive resume

**Files:**
- Modify: `src/app.ts:437-438` (main startup), `src/app.ts:157-203` (onSessionResume handler), `src/app.ts:26-34` (remove dead ContentBlock type)

- [ ] **Step 1: Call `restoreMessages` after TUI creation in `main()`**

In `src/app.ts`, after `ctx.tui = tui;` (line ~438) and before `updateStatusBar();`:

```ts
  ctx.tui = tui;

  if (session.messages.length > 0) {
    tui.restoreMessages(session.messages);
  }

  updateStatusBar();
```

- [ ] **Step 2: Replace preview block in `onSessionResume` with `restoreMessages`**

Replace the existing preview block in `onSessionResume` (lines ~165-192 in the current `onSessionResume`):

**Old** (remove this):
```ts
      ctx.tui.clearMessages();
      ctx.tui.addSystemMessage(`Resumed: ${resumed.title || resumed.id}`);
      ctx.tui.addSystemMessage(
        `Mode: ${resumed.mode} | Messages: ${resumed.messages.length} | ${resumed.createdAt.slice(0, 10)}`,
      );

      const preview = resumed.messages.slice(0, 6);
      for (const msg of preview) {
        const roleLabel =
          msg.role === "user" ? "You" : msg.role === "assistant" ? "Sage" : msg.role;
        const rawContent: unknown = (msg as { content: unknown }).content;
        const content =
          typeof rawContent === "string"
            ? rawContent
            : Array.isArray(rawContent)
              ? (rawContent as ContentBlock[])
                  .map((c) => c.text || c.thinking || c.type || "")
                  .filter(Boolean)
                  .join(" ")
                  .slice(0, 80)
              : "";
        ctx.tui.addSystemMessage(
          `[${roleLabel}] ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`,
        );
      }
      if (resumed.messages.length > 6) {
        ctx.tui.addSystemMessage(`... and ${resumed.messages.length - 6} more messages`);
      }
```

**New** (replace with):
```ts
      ctx.tui.restoreMessages(resumed.messages);
      ctx.tui.addSystemMessage(
        `Resumed: ${resumed.title || resumed.id} (${resumed.mode}, ${resumed.messages.length} messages)`,
      );
```

- [ ] **Step 3: Remove dead `ContentBlock` interface from `src/app.ts`**

Remove lines 26-34 (the `ContentBlock` interface and its comment block):

```ts
/** Lightweight content block for extracting display text. */
interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}
```

It's no longer referenced after removing the preview code.

- [ ] **Step 4: Run type check**

```bash
npm run build
```
Expected: PASS (no errors)

- [ ] **Step 5: Manual verification**

```bash
# Start fresh session and have a conversation
npm run dev

# Exit (Ctrl+C), then start again — history should be rendered
npm run dev
```
Expected: Previous conversation appears as styled chat bubbles (green "You:", blue "Sage:" with markdown).

- [ ] **Step 6: Handoff**

Push all remaining commits:

```bash
git push
```
