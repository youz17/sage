# Session Model Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `title` with `name` + `description` on `Session`, unify session picker display to `name: description`, add `/session-rename`.

**Architecture:** Three-file change — model layer (`Session` + `SessionManager`), TUI contract (`SageTUIHandlers`), and wiring (`app.ts`). Backward compat in `resume()` handles old `title` field.

**Tech Stack:** TypeScript, Node.js fs, `@earendil-works/pi-agent-core` types.

---

### Task 1: Session model rework in `src/session/manager.ts`

**Files:**
- Modify: `src/session/manager.ts`

- [ ] **Step 1: Update `Session` interface — `title` → `name` + `description`**

Replace the `Session` interface (lines 6-13):

```ts
export interface Session {
  id: string;
  name: string;
  description: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}
```

- [ ] **Step 2: Rename `generateTitle` → `generateDescription`, bump to 50 chars, handle compound content**

Replace the `generateTitle` function (lines 35-40):

```ts
function generateDescription(messages: AgentMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "";
  const content = (firstUser as { content: unknown }).content;
  if (typeof content === "string") return content.slice(0, 50);
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { text?: string } => typeof c === "object" && c !== null && "text" in c)
      .map((c) => c.text || "")
      .join(" ")
      .slice(0, 50);
  }
  return "";
}
```

- [ ] **Step 3: Update `newSession()` default — `name = id`, `description = ""`**

Replace the `newSession` method body (lines 45-57):

```ts
  newSession(mode: string = "default"): Session {
    const id = generateId();
    const session: Session = {
      id,
      name: id,
      description: "",
      mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.current = session;
    return session;
  }
```

- [ ] **Step 4: Update `saveCurrent()` — use `description` instead of `title`**

Replace the `saveCurrent` method (lines 63-72):

```ts
  saveCurrent(): void {
    if (!this.current || this.current.messages.length === 0) return;
    this.current.updatedAt = new Date().toISOString();

    if (!this.current.description) {
      this.current.description = generateDescription(this.current.messages);
    }

    fs.writeFileSync(sessionPath(this.current.id), JSON.stringify(this.current, null, 2), "utf-8");
  }
```

- [ ] **Step 5: Backward compat in `resume()` — fallback `name = data.title ?? data.id`**

Replace the `resume` static method (lines 93-101):

```ts
  static resume(sessionId: string): Session | null {
    const filePath = sessionPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        ...data,
        name: data.name ?? data.title ?? data.id,
        description: data.description ?? "",
      } as Session;
    } catch {
      return null;
    }
  }
```

- [ ] **Step 6: Add `setName(name)` method with uniqueness check**

Insert after `setMode` (end of class, before closing `}`):

```ts
  setName(name: string): boolean {
    if (!this.current) return false;
    const sessions = SessionManager.list();
    const conflict = sessions.find((s) => s.name === name && s.id !== this.current!.id);
    if (conflict) return false;
    this.current.name = name;
    this.current.updatedAt = new Date().toISOString();
    return true;
  }
```

- [ ] **Step 7: Run type check**

```bash
npm run build
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/session/manager.ts
git commit -m "refactor(session): rename title→name, add description, add setName"
```

---

### Task 2: Add `onSessionRename` to TUI contract and command parsing

**Files:**
- Modify: `src/tui/index.ts`

- [ ] **Step 1: Add `onSessionRename` to `SageTUIHandlers` interface**

In `SageTUIHandlers` (after `onSkillActivate`, around line 233):

```ts
  onSkillActivate: (skill: string) => void;
  onSessionRename: (name: string) => void;
```

- [ ] **Step 2: Add `session-rename` command parsing**

In the command dispatch switch (after the `"reflect"/"challenge"/"goal"` case, around line 297):

```ts
        case "session-rename":
          handlers.onSessionRename(args);
          return;
```

- [ ] **Step 3: Run type check**

```bash
npm run build
```
Expected: PASS (will fail until Task 3 adds the handler, but the interface + parser are correct)

- [ ] **Step 4: Commit**

```bash
git add src/tui/index.ts
git commit -m "feat(tui): add onSessionRename to handlers and command parsing"
```

---

### Task 3: Wire session model changes in `src/app.ts`

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Fix all `session.title` references to `session.name`**

In `src/app.ts`, find and replace every reference. The specific lines:

a) `onSessionNew` log (line 131): `title: name || "(auto)"` → `name`
```ts
      ctx.logger.log("session:new", { id: s.id, name: name || "(auto)" });
```

b) `onSessionResume` log (line 168): `title: s.title || s.id` → `name: s.name`
```ts
      ctx.logger.log("session:resume", { id: s.id, name: s.name });
```

c) `onSessionResume` system message (line ~160): `resumed.title` → `resumed.name`
```ts
      ctx.tui.addSystemMessage(
        `Resumed: ${resumed.name} (${resumed.mode}, ${resumed.messages.length} messages)`,
      );
```

d) `initSession` --new name (line 264): `session.title = newName;` → `session.name = newName;`
```ts
      session.name = newName;
```

e) Status bar (line 401): `sessionName: ctx.session?.title,` → `sessionName: ctx.session?.name,`
```ts
      sessionName: ctx.session?.name,
```

f) `onSessionNew` handler (line 124): `if (name) s.title = name;` → `if (name) s.name = name;`
```ts
      if (name) s.name = name;
```

- [ ] **Step 2: Update `onSessionList` display format to `name: description`**

Replace the `onSessionList` display (lines ~139-144):

```ts
      const lines = sessions.map((s, i) => {
        return `  ${i + 1}. ${s.name}: ${s.description || "(no messages)"}`;
      });
      ctx.tui.addSystemMessage(`Sessions (${sessions.length}):\n${lines.join("\n")}`);
```

- [ ] **Step 3: Update autocomplete provider format to `name: description`**

Replace the sessions autocomplete (line ~408):

```ts
    sessions: () => SessionManager.list().map((s) => `${s.name}: ${s.description}`),
```

- [ ] **Step 4: Add `onSessionRename` handler**

Insert after `onSessionDelete` handler, before `onSkillActivate`:

```ts
    onSessionRename(name: string) {
      if (!name) {
        ctx.tui.addSystemMessage("Usage: /session-rename <name>");
        return;
      }
      if (!ctx.session) {
        ctx.tui.addSystemMessage("No active session.");
        return;
      }
      const ok = ctx.sessionManager.setName(name);
      if (!ok) {
        ctx.tui.addSystemMessage(`Session "${name}" already exists.`);
        return;
      }
      ctx.logger.log("session:rename", { id: ctx.session.id, name });
      ctx.tui.addSystemMessage(`Session renamed to "${name}".`);
      ctx.updateStatusBar();
    },
```

- [ ] **Step 5: Run type check**

```bash
npm run build
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app.ts
git commit -m "feat(app): wire session name/description, add /session-rename, unify picker format"
```
