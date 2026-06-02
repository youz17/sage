# Mode 文件化 & Meta-Skill 新增实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mode 改为 .md 文件（和 skill 统一），精简为 default+discuss，新增 write-skill/write-mode/write-rule 三个 meta-skill。

**Architecture:** 复用 skill 的 .md + YAML frontmatter 模式。`modes.ts` 重写为扫描 `src/core/builtin/*.md` + `~/.sage/modes/*.md`，同名覆盖。default mode 空正文表示不注入。新增 meta-skill 均为 `type: manual`。

**Tech Stack:** TypeScript 5.8, Node.js ESM

---

### Task 1: Create mode .md files

**Files:**
- Create: `src/core/builtin/default.md`
- Create: `src/core/builtin/discuss.md`

- [ ] **Step 1: Write default.md**

```markdown
---
description: 默认模式，使用模型原生行为
---


```

(empty body, two trailing newlines after frontmatter closing `---`)

- [ ] **Step 2: Write discuss.md**

```markdown
---
description: 协作讨论模式，多元视角、权衡分析
---

## Communication Mode: Discussion

- Engage as a thoughtful discussion partner, not an answer machine.
- Ask probing questions to understand the user's perspective and constraints.
- Present multiple viewpoints and trade-offs before settling on a position.
- Help the user think through the problem rather than just giving an answer.
- Challenge assumptions constructively when you spot them.
```

- [ ] **Step 3: Commit**

```bash
git add src/core/builtin/
git commit -m "feat: add mode .md files (default, discuss)"
```

---

### Task 2: Create meta-skill .md files

**Files:**
- Create: `src/skills/builtin/write-skill.md`
- Create: `src/skills/builtin/write-mode.md`
- Create: `src/skills/builtin/write-rule.md`

- [ ] **Step 1: Write write-skill.md**

```markdown
---
type: manual
description: 按规范创建新的 skill 文件（YAML frontmatter 格式）
---

用户想要创建一个新的 skill。按以下流程操作：

1. 与用户讨论、理解这个 skill 的用途和场景。
2. 判断 type 应该是 auto 还是 manual：
   - **auto**：通用背景技能，LLM 自行判断何时激活
   - **manual**：特定工作流或强制工具调用，用户主动 /name 调用
3. 按 YAML frontmatter 格式写出完整的 skill 内容。
4. 将文件写入 `~/.sage/skills/<name>.md`。
```

- [ ] **Step 2: Write write-mode.md**

```markdown
---
type: manual
description: 按规范创建新的 mode 文件
---

用户想要创建一个新的 mode。按以下流程操作：

1. 与用户讨论、理解这个 mode 的沟通风格和适用场景。
2. 按 YAML frontmatter 格式写出完整的 mode 内容。
3. 将文件写入 `~/.sage/modes/<name>.md`。
```

- [ ] **Step 3: Write write-rule.md**

```markdown
---
type: manual
description: 按规范创建新的 rule 文件
---

用户想要创建一个新的 rule。按以下流程操作：

1. 与用户讨论、理解这个 rule 的约束内容和生效范围。
2. 写出 rule 的纯文本内容（无 frontmatter，正文直接作为 rule）。
3. 将文件写入 `~/.sage/rules/<name>.md`。
```

- [ ] **Step 4: Commit**

```bash
git add src/skills/builtin/write-skill.md src/skills/builtin/write-mode.md src/skills/builtin/write-rule.md
git commit -m "feat: add meta-skills (write-skill, write-mode, write-rule)"
```

---

### Task 3: Rewrite modes.ts

**Files:**
- Modify: `src/core/modes.ts` (complete rewrite)

- [ ] **Step 1: Rewrite modes.ts with .md scanning and frontmatter parsing**

```typescript
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getSubdir, scanMdFiles } from "../config/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Mode {
  name: string;
  description: string;
  prompt: string;
}

function parseFrontmatter(content: string): { description: string; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) frontmatter[kv[1].trim()] = kv[2].trim();
  }

  return {
    description: frontmatter.description ?? "",
    body: match[2].trim(),
  };
}

function findBuiltinDir(): string | null {
  const tsxPath = join(__dirname, "builtin");
  if (existsSync(tsxPath)) return tsxPath;

  const srcPath = join(__dirname, "..", "..", "src", "core", "builtin");
  if (existsSync(srcPath)) return srcPath;

  return null;
}

function scanBuiltinModes(): Map<string, Mode> {
  const modes = new Map<string, Mode>();
  const builtinDir = findBuiltinDir();
  if (!builtinDir) return modes;

  for (const file of readdirSync(builtinDir)) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    const raw = readFileSync(join(builtinDir, file), "utf-8");
    const parsed = parseFrontmatter(raw);
    if (parsed) {
      modes.set(name, {
        name,
        description: parsed.description,
        prompt: parsed.body,
      });
    }
  }
  return modes;
}

function scanCustomModes(): Map<string, Mode> {
  const modes = new Map<string, Mode>();
  const customDir = getSubdir("modes");
  const raw = scanMdFiles(customDir);
  for (const [name, content] of raw) {
    const parsed = parseFrontmatter(content);
    if (parsed) {
      modes.set(name, {
        name,
        description: parsed.description,
        prompt: parsed.body,
      });
    }
  }
  return modes;
}

export function getAllModes(): Map<string, Mode> {
  const modes = scanBuiltinModes();
  for (const [name, mode] of scanCustomModes()) {
    modes.set(name, mode);
  }
  return modes;
}

export function getAllModeNames(): string[] {
  return Array.from(getAllModes().keys());
}

export function isValidMode(mode: string): boolean {
  return getAllModes().has(mode);
}

export function getModePrompt(mode: string): string {
  const all = getAllModes();
  const found = all.get(mode);
  if (found) return found.prompt;
  return all.get("default")?.prompt ?? "";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/core/modes.ts
git commit -m "refactor: rewrite modes.ts with .md file loading"
```

---

### Task 4: Update package.json build script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add core/builtin copy to build**

Change the build script from:
```json
"build": "tsc && node -e \"const{cpSync}=require('fs');cpSync('src/skills/builtin','dist/skills/builtin',{recursive:true})\""
```
To:
```json
"build": "tsc && node -e \"const{cpSync}=require('fs');cpSync('src/skills/builtin','dist/skills/builtin',{recursive:true})\" && node -e \"const{cpSync}=require('fs');cpSync('src/core/builtin','dist/core/builtin',{recursive:true})\""
```

- [ ] **Step 2: Verify build + copy**

Run: `npm run build`
Expected: Build succeeds; `dist/core/builtin/` directory exists with `default.md` and `discuss.md`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: copy core/builtin .md files to dist"
```

---

### Task 5: Update tui/index.ts for mode description completions

**Files:**
- Modify: `src/tui/index.ts`

- [ ] **Step 1: Import getAllModes to get mode descriptions**

Change line 12 from:
```typescript
import { getAllModeNames } from "../core/modes.js";
```
To:
```typescript
import { getAllModeNames, getAllModes } from "../core/modes.js";
```

- [ ] **Step 2: Load allModes at startup and use descriptions in completions**

After `const allSkills = getAllSkills();` (line 46), add:
```typescript
const allModes = getAllModes();
```

In the `buildCompletions` function, update the mode completion section (line 73-76):

Old:
```typescript
  if (parts[0] === "/mode" && parts.length >= 2) {
    const query = parts.slice(1).join(" ").toLowerCase();
    return getAllModeNames()
      .filter((m) => m.startsWith(query))
      .map((m) => ({ label: m, description: "mode" }));
  }
```

New:
```typescript
  if (parts[0] === "/mode" && parts.length >= 2) {
    const query = parts.slice(1).join(" ").toLowerCase();
    const modeItems: CompletionItem[] = [];
    for (const [name, mode] of allModes) {
      if (name.startsWith(query)) {
        modeItems.push({ label: name, description: mode.description || "mode" });
      }
    }
    return modeItems;
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/tui/index.ts
git commit -m "feat: show mode descriptions in completions"
```

---

### Task 6: Smoke test

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Build succeeds, `dist/core/builtin/` and `dist/skills/builtin/` both have .md files

- [ ] **Step 2: Verify mode loading**

Run:
```
npx tsx -e "import { getAllModes, getAllModeNames } from './src/core/modes.js'; const names = getAllModeNames(); console.log('Modes:', names); const d = getAllModes().get('default'); console.log('default desc:', d?.description); console.log('default prompt:', JSON.stringify(d?.prompt));"
```
Expected: `Modes: [ 'default', 'discuss' ]`, default prompt is empty string, discuss prompt is non-empty

- [ ] **Step 3: Verify skill loading includes new meta-skills**

Run:
```
npx tsx -e "import { getAllSkillNames } from './src/skills/loader.js'; console.log('Skills:', getAllSkillNames());"
```
Expected: Skills includes `write-skill`, `write-mode`, `write-rule` alongside existing `reflect`, `challenge`, `goal`

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "test: manual smoke test passed"
```
