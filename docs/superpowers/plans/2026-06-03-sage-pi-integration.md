# Sage Pi Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Sage's hand-rolled agent loop, LLM client, and TUI with Pi's `@pi-ai`, `@pi-agent-core`, and `@pi-tui` packages while preserving Sage's modes, skills, config, and session.

**Architecture:** Three Pi packages as npm dependencies. `src/app.ts` assembles TUI + Agent + Config. Sage's custom layers (modes, skills, session, tools) sit on top of Pi's engine, registered via Agent hooks, extension mechanisms, and event subscriptions.

**Tech Stack:** TypeScript 5.8, Node 16 ESM, `@pi-ai`, `@pi-agent-core`, `@pi-tui`, `marked` + `marked-terminal`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `src/app.ts` | Entry point: load config, create model, create agent, create TUI, wire events |
| `src/tui/index.ts` | TUI assembly: components, theme, shortcuts, command handler |
| `src/agent/index.ts` | Agent factory: build system prompt, register tools, configure hooks |
| `src/agent/tools.ts` | Sage custom tools as `AgentTool[]` |
| `src/agent/memory.ts` | `compactMemory()` for `transformContext` |

### Modified Files

| File | Change |
|---|---|
| `src/config/loader.ts` | Adapt to Pi config format (provider name mapping) |
| `src/config/types.ts` | Simplify — remove old LLMConfig |
| `src/session/manager.ts` | Adapt to Agent's `state.messages` + event-driven save |
| `src/skills/loader.ts` | Keep loading, change to export prompt strings for Agent use |
| `src/core/modes.ts` | No change |
| `src/core/prompts.ts` | Adapt `buildSystemPrompt()` return format |
| `src/tools/web-search.ts` | Rewrite to `AgentTool` |
| `src/tools/reflect.ts` | Rewrite to `AgentTool` |
| `src/tools/challenge.ts` | Rewrite to `AgentTool` |
| `package.json` | Update deps, scripts entry point |
| `tsconfig.json` | May need `paths` or `moduleResolution` adjustment |

### Deleted Files

```
src/core/loop.ts
src/llm/client.ts
src/llm/index.ts
src/tools/registry.ts
src/tools/index.ts
src/tui/index.ts
src/tui/input.ts
src/tui/renderer.ts
src/tui/completer.ts
src/types.ts
src/index.ts
```

---

### Task 1: Create branch + install Pi dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Create new branch**

```bash
git checkout -b feat/pi-integration
```

- [ ] **Step 2: Install Pi packages**

```bash
npm install @earendil-works/pi-ai @earendil-works/pi-agent-core @earendil-works/pi-tui
```

- [ ] **Step 3: Verify packages exist**

```bash
node -e "import('@earendil-works/pi-ai').then(m => console.log(Object.keys(m).slice(0, 5)))"
```

Expected: prints Pi API exports like `[ 'getModel', 'getModels', 'getProviders', 'stream', 'complete' ]`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pi-ai, pi-agent-core, pi-tui dependencies"
```

---

### Task 2: Adapt config layer

**Files:**
- Modify: `src/config/types.ts`
- Modify: `src/config/loader.ts`

- [ ] **Step 1: Update config types (`src/config/types.ts`)**

```typescript
export interface SageModelConfig {
  provider: string;   // Pi provider name: "deepseek" | "openai" | "anthropic" | ...
  model: string;      // Pi model id: "deepseek-chat" | "gpt-4o" | ...
  apiKey: string;
}

export interface SageConfig {
  model: SageModelConfig;
  defaultMode: string;
  tavilyApiKey: string;
}
```

- [ ] **Step 2: Update loader (`src/config/loader.ts`) — replace content**

Read the current file first, then apply these specific changes:
- Change the import of `SageConfig` to use the new type
- Change `loadConfig()` to return `SageConfig` from the new types
- Change `getConfigPath()` to remain `~/.sage/config.json` (unchanged path logic)

In `loadConfig()`, the config.json parsing stays the same. Only the type signature changes.

- [ ] **Step 3: Verify config still loads**

```bash
npx tsx -e "
import { loadConfig } from './src/config/loader.js';
const config = loadConfig();
console.log('model:', config.model.provider, config.model.model);
console.log('defaultMode:', config.defaultMode);
"
```

Expected: prints your current config values from `~/.sage/config.json`.

- [ ] **Step 4: Commit**

```bash
git add src/config/types.ts src/config/loader.ts
git commit -m "refactor(config): simplify types for Pi integration"
```

---

### Task 3: Migrate custom tools to AgentTool format

**Files:**
- Create: `src/agent/tools.ts`
- Create: `src/agent/index.ts` (empty shell for later tasks)

- [ ] **Step 1: Read existing tool files to understand current API**

Read `src/tools/web-search.ts` to understand tavily API call pattern.

- [ ] **Step 2: Create `src/agent/tools.ts`**

```typescript
import { Type } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";

export function createWebSearchTool(tavilyApiKey: string): AgentTool {
  return {
    name: "web_search",
    label: "Search Web",
    description: "Search the web for real-time information using Tavily",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
    }),
    execute: async (_toolCallId, params, signal) => {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: params.query,
          search_depth: "basic",
          max_results: 5,
        }),
        signal,
      });
      const data = await res.json();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data.results ?? data, null, 2) }],
        details: { query: params.query, resultCount: data.results?.length ?? 0 },
      };
    },
  };
}

export function createReflectTool(): AgentTool {
  return {
    name: "reflect",
    label: "Reflect",
    description: "Pause and reflect on the conversation so far before answering. Think deeply about what has been discussed, what the user really needs, and whether you're on the right track.",
    parameters: Type.Object({
      topic: Type.String({ description: "What to reflect on" }),
    }),
    execute: async (_toolCallId, params, _signal) => {
      return {
        content: [{
          type: "text" as const,
          text: `Reflection complete on: "${params.topic}". Consider the above analysis before responding.`,
        }],
      };
    },
  };
}

export function createChallengeTool(): AgentTool {
  return {
    name: "challenge",
    label: "Devil's Advocate",
    description: "Challenge your own assumptions and reasoning before answering. Find flaws, counterarguments, and blind spots.",
    parameters: Type.Object({
      claim: Type.String({ description: "The claim or assumption to challenge" }),
    }),
    execute: async (_toolCallId, params, _signal) => {
      return {
        content: [{
          type: "text" as const,
          text: `Challenge complete for: "${params.claim}". Consider counterarguments and strengthen your response.`,
        }],
      };
    },
  };
}
```

- [ ] **Step 3: Create shell `src/agent/index.ts`**

```typescript
// Placeholder — filled in Task 4
export {};
```

- [ ] **Step 4: Create `src/agent/` directory**

```bash
mkdir -p src/agent; if ($?) { New-Item -ItemType Directory -Path src/agent/tools.ts -Force }
```

Actually no, we use the Write tool. Just verify directory structure.

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools.ts src/agent/index.ts
git commit -m "feat: migrate custom tools to Pi AgentTool format"
```

---

### Task 4: Agent factory + system prompt builder

**Files:**
- Modify: `src/core/prompts.ts`
- Modify: `src/agent/index.ts`

- [ ] **Step 1: Update `src/core/prompts.ts`**

Read the current file first.

Rewrite `buildSystemPrompt`:

```typescript
import { getModePrompt } from "./modes.js";
import { buildSkillPrompt } from "../skills/loader.js";
import { loadRules } from "../config/loader.js";

export function buildSystemPrompt(mode: string, skillNames: string[]): string {
  const parts: string[] = [];

  parts.push("You are Sage, an AI assistant.");
  parts.push("");

  const modePrompt = getModePrompt(mode);
  if (modePrompt) {
    parts.push(modePrompt);
    parts.push("");
  }

  const rules = loadRules();
  if (rules.length > 0) {
    parts.push("## Rules");
    for (const rule of rules) {
      parts.push(rule);
    }
    parts.push("");
  }

  const skillPrompt = buildSkillPrompt(skillNames);
  if (skillPrompt) {
    parts.push(skillPrompt);
  }

  return parts.join("\n");
}
```

- [ ] **Step 2: Write `src/agent/index.ts` — Agent factory**

Replace the shell:

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { SageModelConfig } from "../config/types.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { buildSystemPrompt } from "../core/prompts.js";
import { createWebSearchTool, createReflectTool, createChallengeTool } from "./tools.js";
import { compactMemory } from "./memory.js";

export function createSageAgent(
  model: Model<any>,
  config: SageModelConfig,
  options: {
    mode?: string;
    skillNames?: string[];
    tavilyApiKey?: string;
    sessionId?: string;
  } = {},
) {
  const { mode = "socratic", skillNames = [], tavilyApiKey, sessionId } = options;

  const tools: AgentTool[] = [
    createReflectTool(),
    createChallengeTool(),
  ];

  if (tavilyApiKey) {
    tools.push(createWebSearchTool(tavilyApiKey));
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(mode, skillNames),
      model,
      thinkingLevel: "medium",
      tools,
      messages: [],
    },
    transformContext: async (messages, signal) => {
      const compacted = await compactMemory(messages, model, signal);
      return compacted ?? messages;
    },
    convertToLlm: (messages) => {
      return messages.map((m: any) => {
        if (m.role === "memory") {
          return { role: "user", content: m.content };
        }
        return m;
      });
    },
    sessionId,
    steeringMode: "one-at-a-time",
    followUpMode: "one-at-a-time",
  });

  return agent;
}
```

- [ ] **Step 3: Create memory placeholder (`src/agent/memory.ts`)**

```typescript
import type { Model } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

// Token estimation: ~4 chars per token, rough heuristic
// Pi's AgentMessage has string content, we estimate from that
function estimateTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const m of messages) {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    total += Math.ceil(content.length / 4);
  }
  return total;
}

// Context window: 128K for deepseek, 200K for claude. Use model info if available.
function getContextWindow(_model: Model<any>): number {
  return 128000; // Default to DeepSeek's context window
}

export async function compactMemory(
  messages: AgentMessage[],
  _model: Model<any>,
  _signal?: AbortSignal,
): Promise<AgentMessage[] | null> {
  const contextWindow = getContextWindow(_model);
  const estimatedTokens = estimateTokens(messages);

  if (estimatedTokens < contextWindow * 0.7) return null;
  if (messages.length < 6) return null; // Not enough to compact

  const splitPoint = Math.max(2, Math.floor(messages.length * 0.4));
  const toCompact = messages.slice(0, splitPoint);
  const recent = messages.slice(splitPoint);

  // Build summary from old messages
  const summaryLines: string[] = [];
  for (const m of toCompact) {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const preview = content.slice(0, 200);
    const role = m.role === "assistant" ? "Assistant" : "User";
    summaryLines.push(`- ${role}: ${preview}${content.length > 200 ? "..." : ""}`);
  }

  const summary = summaryLines.join("\n");

  return [
    {
      role: "memory" as any,
      content: `<conversation_memory>\nEarlier conversation summary:\n${summary}\n</conversation_memory>`,
      timestamp: Date.now(),
    } as AgentMessage,
    ...recent,
  ];
}
```

- [ ] **Step 4: Verify agent creation compiles**

```bash
npx tsc --noEmit
```

Expected: may show unrelated errors from old files, but no errors in new files. Acceptable if only old-file errors.

- [ ] **Step 5: Commit**

```bash
git add src/agent/index.ts src/agent/memory.ts src/core/prompts.ts
git commit -m "feat: agent factory with system prompt, tools, and memory compaction"
```

---

### Task 5: TUI layer setup

**Files:**
- Create: `src/tui/index.ts`

- [ ] **Step 1: Create `src/tui/index.ts`**

```typescript
import chalk from "chalk";
import {
  TUI,
  ProcessTerminal,
  Container,
  Editor,
  Markdown,
  Text,
  Spacer,
  Loader,
  CombinedAutocompleteProvider,
  Key,
  matchesKey,
} from "@earendil-works/pi-tui";
import type { Component, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";
import type { Agent } from "@earendil-works/pi-agent-core";

// --- Themes ---

const sageMarkdownTheme: MarkdownTheme = {
  heading: (text: string) => chalk.bold.blue(text),
  link: (text: string) => chalk.underline.cyan(text),
  linkUrl: (text: string) => chalk.dim(text),
  code: (text: string) => chalk.yellow(text),
  codeBlock: (text: string) => chalk.yellow(text),
  codeBlockBorder: (text: string) => chalk.dim(text),
  quote: (text: string) => chalk.italic.dim(text),
  quoteBorder: (text: string) => chalk.dim("│"),
  hr: (text: string) => chalk.dim(text),
  listBullet: (text: string) => chalk.cyan(text),
  bold: (text: string) => chalk.bold(text),
  italic: (text: string) => chalk.italic(text),
  strikethrough: (text: string) => chalk.strikethrough.dim(text),
  underline: (text: string) => chalk.underline(text),
};

// --- Commands ---

const SLASH_COMMANDS = [
  { name: "mode", description: "Switch communication mode (socratic|direct|discuss|deep|perspectives)" },
  { name: "session", description: "Session management: new|list|resume|delete" },
  { name: "skills", description: "List available skills" },
  { name: "reflect", description: "Activate reflect skill" },
  { name: "challenge", description: "Activate challenge skill" },
  { name: "goal", description: "Activate goal skill" },
  { name: "quit", description: "Exit Sage" },
  { name: "exit", description: "Exit Sage" },
];

// --- Message Rendering ---

class SageMessages extends Container {
  private children: Component[] = [];
  private _streamingMarkdown: Markdown | null = null;
  private _streamingContent = "";

  addUserMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.green("You:")} ${text}`));
  }

  startAssistantMessage(): Markdown {
    this.addChild(new Spacer(1));
    const header = new Text(`  ${chalk.bold.blue("Sage:")}`);
    this.addChild(header);
    this._streamingMarkdown = new Markdown("", 2, 0, sageMarkdownTheme);
    this.addChild(this._streamingMarkdown);
    this._streamingContent = "";
    return this._streamingMarkdown;
  }

  appendDelta(delta: string): void {
    if (this._streamingMarkdown) {
      this._streamingContent += delta;
      this._streamingMarkdown.setText(this._streamingContent);
    }
  }

  finishAssistantMessage(): void {
    this._streamingMarkdown = null;
    this._streamingContent = "";
  }

  addToolCall(name: string, callId: string): void {
    const label = new Text(`  ${chalk.dim("[tool]")} ${chalk.cyan(name)}`);
    this.addChild(label);
  }
}

// --- TUI Factory ---

export interface SageTUI {
  tui: TUI;
  shutdown: () => Promise<void>;
  // Stream API — called by app layer when agent events arrive
  onStreamDelta: (delta: string) => void;
  onToolCallStart: (name: string, args: Record<string, unknown>, callId: string) => void;
  onToolCallEnd: (callId: string) => void;
}

interface SageTUIHandlers {
  onInput: (text: string) => Promise<void>;
  onQuit: () => Promise<void>;
  onModeChange: (mode: string) => void;
  onSessionCommand: (args: string) => void;
  onSkillActivate: (skill: string) => void;
}

export function createSageTUI(handlers: SageTUIHandlers): SageTUI {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const messages = new SageMessages();
  tui.addChild(messages);

  const editor = new Editor(tui, {
    borderColor: (s) => chalk.cyan(s),
    selectList: {
      selectedPrefix: (s) => chalk.cyan(`> ${s}`),
      selectedText: (s) => chalk.bold(s),
      description: (s) => chalk.dim(s),
      scrollInfo: (s) => chalk.dim(s),
      noMatch: (s) => chalk.red(s),
    },
  });

  const autocomplete = new CombinedAutocompleteProvider(SLASH_COMMANDS, process.cwd());
  editor.setAutocompleteProvider(autocomplete);

  editor.onSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Slash command handling
    if (trimmed.startsWith("/")) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1).join(" ");

      switch (cmd) {
        case "quit":
        case "exit":
          await handlers.onQuit();
          return;
        case "mode":
          handlers.onModeChange(args);
          return;
        case "session":
          handlers.onSessionCommand(args);
          return;
        case "reflect":
        case "challenge":
        case "goal":
          handlers.onSkillActivate(cmd);
          return;
        default:
          // Unknown slash command — send as-is to agent
          break;
      }
    }

    // Display user message
    messages.addUserMessage(trimmed);

    // Start assistant streaming placeholder
    const md = messages.startAssistantMessage();

    // Call handler
    await handlers.onInput(trimmed);
  };

  const spacer = new Spacer(1);
  tui.addChild(spacer);
  tui.addChild(editor);
  tui.setFocus(editor);

  // Global keyboard shortcuts
  tui.addInputListener((data: string) => {
    if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
      handlers.onQuit().then(() => {
        tui.stop();
        process.exit(0);
      });
    }
  });

  tui.start();

  return {
    tui,
    shutdown() {
      tui.stop();
    },
    onStreamDelta(delta: string) {
      messages.appendDelta(delta);
    },
    onToolCallStart(name: string, _args: Record<string, unknown>, callId: string) {
      messages.addToolCall(name, callId);
    },
    onToolCallEnd(_callId: string) {
      // Tool labels stay visible — no UI removal needed
    },
  };
}
```

- [ ] **Step 2: Install chalk dependency (if not present)**

```bash
npm install chalk
```

Pi TUI examples use chalk for styling. Check if already in deps; if not, install.

- [ ] **Step 3: Verify TUI module compiles**

```bash
npx tsc --noEmit src/tui/index.ts
```

Expected: successful compilation or expected old-file errors only.

- [ ] **Step 4: Commit**

```bash
git add src/tui/index.ts package.json package-lock.json
git commit -m "feat: TUI layer with Pi components, themes, slash commands"
```

---

### Task 6: Session management adaptation

**Files:**
- Modify: `src/session/manager.ts`

- [ ] **Step 1: Read current `src/session/manager.ts`**

- [ ] **Step 2: Rewrite `src/session/manager.ts`**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { getSubdir } from "../config/loader.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface Session {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

function sessionsDir(): string {
  const dir = getSubdir("sessions");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

function generateId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${dateStr}-${rand}`;
}

function generateTitle(messages: AgentMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New Session";
  const content = typeof firstUser.content === "string" ? firstUser.content : "";
  return content.slice(0, 30) || "New Session";
}

export class SessionManager {
  private current: Session | null = null;

  newSession(mode: string = "socratic"): Session {
    const id = generateId();
    const session: Session = {
      id,
      title: "New Session",
      mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.current = session;
    return session;
  }

  getCurrent(): Session | null {
    return this.current;
  }

  saveCurrent(): void {
    if (!this.current || this.current.messages.length === 0) return;
    this.current.updatedAt = new Date().toISOString();

    // Auto-title from first user message
    if (this.current.title === "New Session") {
      this.current.title = generateTitle(this.current.messages);
    }

    fs.writeFileSync(sessionPath(this.current.id), JSON.stringify(this.current, null, 2), "utf-8");
  }

  static list(): Session[] {
    const dir = sessionsDir();
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
          return { ...data, messages: [] } as Session; // Don't load full messages for listing
        } catch {
          return null;
        }
      })
      .filter((s): s is Session => s !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  static resume(sessionId: string): Session | null {
    const filePath = sessionPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  static delete(sessionId: string): boolean {
    const filePath = sessionPath(sessionId);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  updateMessages(messages: AgentMessage[]): void {
    if (this.current) {
      this.current.messages = messages;
    }
  }

  setMode(mode: string): void {
    if (this.current) {
      this.current.mode = mode;
    }
  }
}
```

- [ ] **Step 3: Verify session module compiles**

```bash
npx tsc --noEmit src/session/manager.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/session/manager.ts
git commit -m "refactor(session): adapt SessionManager to AgentMessage format"
```

---

### Task 7: Skills loader adaptation

**Files:**
- Modify: `src/skills/loader.ts`

- [ ] **Step 1: Read current `src/skills/loader.ts`**

- [ ] **Step 2: Update `src/skills/loader.ts`**

The loader structure (scanMdFiles, getAllSkills, loadSkill, buildSkillPrompt) stays the same. Only change: remove the `parseSkillsFromInput` function (slash commands are now handled in TUI). Keep bucket:

```typescript
import { getSubdir, scanMdFiles } from "../config/loader.js";
import { BUILTIN_SKILLS } from "./builtin.js";

export interface Skill {
  name: string;
  prompt: string;
}

export function getAllSkills(): Map<string, string> {
  const skills = new Map<string, string>(Object.entries(BUILTIN_SKILLS));

  const customSkills = scanMdFiles(getSubdir("skills"));
  for (const [name, content] of customSkills) {
    skills.set(name, content);
  }

  return skills;
}

export function getAllSkillNames(): string[] {
  return Array.from(getAllSkills().keys());
}

export function loadSkill(name: string): Skill | null {
  const all = getAllSkills();
  const prompt = all.get(name);
  if (prompt) return { name, prompt };
  return null;
}

export function buildSkillPrompt(skillNames: string[]): string {
  const parts: string[] = [];
  for (const name of skillNames) {
    const skill = loadSkill(name);
    if (skill) {
      parts.push(`<skill name="${skill.name}">\n${skill.prompt}\n</skill>`);
    }
  }
  return parts.length > 0
    ? `\n\nThe following skills are active. Follow their instructions:\n\n${parts.join("\n\n")}`
    : "";
}
```

- [ ] **Step 3: Update `src/skills/index.ts` to remove `parseSkillsFromInput` export**

Remove the line: `export { loadSkill, buildSkillPrompt, parseSkillsFromInput, getAllSkillNames } from "./loader.js";`
Change to: `export { loadSkill, buildSkillPrompt, getAllSkillNames } from "./loader.js";`

- [ ] **Step 4: Verify compiles**

```bash
npx tsc --noEmit src/skills/loader.ts src/skills/index.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/skills/loader.ts src/skills/index.ts
git commit -m "refactor(skills): simplify loader, remove parseSkillsFromInput"
```

---

### Task 8: App entry point — wire everything together

**Files:**
- Create: `src/app.ts`

- [ ] **Step 1: Create `src/app.ts`**

```typescript
import { getModel } from "@earendil-works/pi-ai";
import { loadConfig } from "./config/loader.js";
import { createSageAgent } from "./agent/index.js";
import { SessionManager } from "./session/manager.js";
import { getAllModeNames, isValidMode } from "./core/modes.js";
import { buildSystemPrompt } from "./core/prompts.js";
import type { SageTUI } from "./tui/index.js";

async function main() {
  const { createSageTUI } = await import("./tui/index.js");

  const config = loadConfig();
  const model = getModel(config.model.provider as any, config.model.model);

  // Session setup
  const sessionManager = new SessionManager();
  const args = process.argv.slice(2);
  const isNewSession = args.includes("--new");
  let session = isNewSession ? null : SessionManager.list()[0]; // Last session

  if (session && !isNewSession) {
    const resumed = SessionManager.resume(session.id);
    if (resumed) {
      sessionManager.newSession(resumed.mode); // Sets current
      sessionManager.getCurrent()!.id = resumed.id;
      sessionManager.getCurrent()!.messages = resumed.messages;
    }
  }

  if (!sessionManager.getCurrent()) {
    sessionManager.newSession(config.defaultMode);
  }
  session = sessionManager.getCurrent()!;

  // Agent setup
  let activeSkills: string[] = [];
  let currentMode = session.mode;

  const agent = createSageAgent(model, config.model, {
    mode: currentMode,
    skillNames: activeSkills,
    tavilyApiKey: config.tavilyApiKey,
    sessionId: session.id,
  });

  // Restore messages
  if (session.messages.length > 0) {
    agent.state.messages = [...session.messages] as any;
  }

  // Auto-save on agent end
  agent.subscribe(async (event) => {
    if (event.type === "agent_end") {
      sessionManager.updateMessages(agent.state.messages as any[]);
      sessionManager.saveCurrent();
    }
  });

  // TUI setup
  const tui = createSageTUI({
    async onInput(text: string) {
      try {
        await agent.prompt(text);
      } catch (err) {
        console.error("Agent error:", err);
      }
    },

    async onQuit() {
      sessionManager.updateMessages(agent.state.messages as any[]);
      sessionManager.saveCurrent();
    },

    onModeChange(mode: string) {
      if (!isValidMode(mode)) {
        console.log(`Unknown mode: "${mode}". Available: ${getAllModeNames().join(", ")}`);
        return;
      }
      currentMode = mode;
      sessionManager.setMode(mode);
      agent.state.systemPrompt = buildSystemPrompt(mode, activeSkills);
    },

    onSessionCommand(args: string) {
      const parts = args.split(/\s+/);
      const subCmd = parts[0];
      const subArgs = parts.slice(1).join(" ");

      switch (subCmd) {
        case "new": {
          sessionManager.saveCurrent();
          const s = sessionManager.newSession(currentMode);
          agent.state.messages = [] as any;
          break;
        }
        case "list": {
          const sessions = SessionManager.list();
          console.log("\nSessions:");
          sessions.forEach((s, i) => {
            console.log(`  ${i + 1}. [${s.id}] ${s.title} (${s.mode}) — ${s.updatedAt.slice(0, 10)}`);
          });
          break;
        }
        case "resume": {
          const id = subArgs;
          const resumed = SessionManager.resume(id);
          if (!resumed) {
            console.log(`Session "${id}" not found.`);
            return;
          }
          sessionManager.saveCurrent();
          const s = sessionManager.newSession(resumed.mode);
          s.id = resumed.id;
          s.messages = resumed.messages;
          agent.state.messages = [...resumed.messages] as any;
          currentMode = resumed.mode;
          agent.state.systemPrompt = buildSystemPrompt(resumed.mode, activeSkills);
          break;
        }
        case "delete": {
          const id = subArgs;
          if (SessionManager.delete(id)) {
            console.log(`Session "${id}" deleted.`);
          } else {
            console.log(`Session "${id}" not found.`);
          }
          break;
        }
        default:
          console.log(`Unknown session command: "${subCmd}". Use: new|list|resume|delete`);
      }
    },

    onSkillActivate(skill: string) {
      if (activeSkills.includes(skill)) {
        activeSkills = activeSkills.filter((s) => s !== skill);
        console.log(`Skill "${skill}" deactivated.`);
      } else {
        activeSkills.push(skill);
        console.log(`Skill "${skill}" activated.`);
      }
      agent.state.systemPrompt = buildSystemPrompt(currentMode, activeSkills);
    },
  });

  // Stream agent events to TUI messages area
  // (hook into agent subscribe for real-time streaming — implemented after TUI exposes streaming API)

  // Graceful shutdown
  process.on("SIGINT", async () => {
    sessionManager.updateMessages(agent.state.messages as any[]);
    sessionManager.saveCurrent();
    tui.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Update `package.json` scripts**

```json
{
  "scripts": {
    "start": "tsx src/app.ts",
    "dev": "tsx src/app.ts",
    "build": "tsc"
  }
}
```

- [ ] **Step 3: Verify app compiles**

```bash
npx tsc --noEmit
```

Expected: compilation may fail on old deleted-file references. Acceptable for now — old files will be deleted in next task.

- [ ] **Step 4: Commit**

```bash
git add src/app.ts package.json
git commit -m "feat: app entry point wiring agent, TUI, session, skills"
```

---

### Task 9: Cleanup — delete old files

**Files:**
- Delete: `src/core/loop.ts`
- Delete: `src/llm/client.ts`
- Delete: `src/llm/index.ts`
- Delete: `src/tools/registry.ts`
- Delete: `src/tools/index.ts`
- Delete: `src/tui/index.ts` (old)
- Delete: `src/tui/input.ts`
- Delete: `src/tui/renderer.ts`
- Delete: `src/tui/completer.ts`
- Delete: `src/types.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Delete old files**

```bash
Remove-Item -LiteralPath "src\core\loop.ts" -Force
Remove-Item -LiteralPath "src\llm\client.ts" -Force
Remove-Item -LiteralPath "src\llm\index.ts" -Force
Remove-Item -LiteralPath "src\tools\registry.ts" -Force
Remove-Item -LiteralPath "src\tools\index.ts" -Force
Remove-Item -LiteralPath "src\tui\index.ts" -Force
Remove-Item -LiteralPath "src\tui\input.ts" -Force
Remove-Item -LiteralPath "src\tui\renderer.ts" -Force
Remove-Item -LiteralPath "src\tui\completer.ts" -Force
Remove-Item -LiteralPath "src\types.ts" -Force
```

- [ ] **Step 2: Update `src/index.ts` — remove old exports**

Replace with:

```typescript
// Sage barrel export for SDK usage
export { createSageAgent } from "./agent/index.js";
export { SessionManager } from "./session/manager.js";
export { loadConfig, initSageDir } from "./config/index.js";
export { getAllModeNames, isValidMode } from "./core/index.js";
export { loadSkill, buildSkillPrompt, getAllSkillNames } from "./skills/index.js";
```

- [ ] **Step 3: Verify full compilation**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old agent core, LLM client, TUI, and types"
```

---

### Task 10: Wiring stream events from Agent to TUI

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Add agent event subscription for streaming in `src/app.ts`**

Replace the `agent.subscribe` call in `main()` with:

```typescript
agent.subscribe(async (event) => {
  if (event.type === "message_update" && (event as any).assistantMessageEvent?.type === "text_delta") {
    tui.onStreamDelta((event as any).assistantMessageEvent.delta);
  }
  if (event.type === "tool_execution_start") {
    tui.onToolCallStart(
      (event as any).toolName,
      (event as any).args ?? {},
      (event as any).toolCallId,
    );
  }
  if (event.type === "agent_end") {
    sessionManager.updateMessages(agent.state.messages as any[]);
    sessionManager.saveCurrent();
  }
});
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat: wire agent stream events to TUI rendering"
```

---

### Task 11: Integration test — verify the app runs

**Files:**
- None (test-only)

- [ ] **Step 1: Start the app with a quick prompt**

```bash
echo "/quit" | timeout 15 npx tsx src/app.ts 2>&1 || true
```

Expected: TUI starts, processes `/quit` command, exits cleanly.

- [ ] **Step 2: Check for any remaining import errors**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero TypeScript compilation errors.

- [ ] **Step 3: Fix any issues found**

If errors exist, fix them inline and re-run step 2 until clean.

- [ ] **Step 4: Commit final fixes**

```bash
git add -A
git commit -m "chore: integration fixes"
```
