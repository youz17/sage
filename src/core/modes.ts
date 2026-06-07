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

// TODO: 通用能力, 考虑抽取
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

// TODO: 这种路径没有更合理的处理吗？
// 至少抽出一个统一的 dir 管理 util
function findBuiltinDir(): string | null {
  const tsxPath = join(__dirname, "builtin");
  if (existsSync(tsxPath)) return tsxPath;

  const srcPath = join(__dirname, "..", "..", "src", "core", "builtin");
  if (existsSync(srcPath)) return srcPath;

  return null;
}

function scanModes(dir: string | null): Map<string, Mode> {
  const modes = new Map<string, Mode>();
  if (!dir) return modes;

  const raw = scanMdFiles(dir);
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

function scanBuiltinModes(): Map<string, Mode> {
  return scanModes(findBuiltinDir());
}

function scanCustomModes(): Map<string, Mode> {
  return scanModes(getSubdir("modes"));
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
