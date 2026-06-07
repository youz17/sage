import { readFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { walkDir } from "./file-loader.js";
import { getSubdir } from "../config/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Mode {
  name: string;
  description: string;
  prompt: string;
}

function parseFrontmatter(content: string): { description: string; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = yaml.load(match[1]) as Record<string, string> | undefined;
  if (!frontmatter) return null;

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

function scanModes(dir: string | null): Map<string, Mode> {
  const modes = new Map<string, Mode>();
  if (!dir) return modes;

  for (const file of walkDir(dir, ".md")) {
    const name = basename(file, ".md");
    const content = readFileSync(file, "utf-8");
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
