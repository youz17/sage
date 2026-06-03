import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_CONFIG, type SageConfig } from "./types.js";

const SAGE_DIR = join(homedir(), ".sage");
const CONFIG_FILE = join(SAGE_DIR, "config.json");

const SUBDIRS = ["modes", "skills", "rules", "sessions", "logs"] as const;

export function getSageDir(): string {
  return SAGE_DIR;
}

export function initSageDir(): void {
  if (!existsSync(SAGE_DIR)) {
    mkdirSync(SAGE_DIR, { recursive: true });
  }
  for (const sub of SUBDIRS) {
    const dir = join(SAGE_DIR, sub);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
  }
}

export function loadConfig(): SageConfig {
  initSageDir();

  const raw = readFileSync(CONFIG_FILE, "utf-8");
  let userConfig: Partial<SageConfig>;
  try {
    userConfig = JSON.parse(raw);
  } catch {
    userConfig = {};
  }

  return {
    model: { ...DEFAULT_CONFIG.model, ...userConfig.model },
    defaultMode: userConfig.defaultMode ?? DEFAULT_CONFIG.defaultMode,
    tavilyApiKey: userConfig.tavilyApiKey ?? DEFAULT_CONFIG.tavilyApiKey,
  };
}

export function getSubdir(name: typeof SUBDIRS[number]): string {
  return join(SAGE_DIR, name);
}

export function scanMdFiles(dir: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!existsSync(dir)) return result;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    const content = readFileSync(join(dir, file), "utf-8");
    result.set(name, content);
  }
  return result;
}

export function loadRules(): string[] {
  const rulesDir = getSubdir("rules");
  const rules: string[] = [];
  const files = scanMdFiles(rulesDir);
  for (const [, content] of files) {
    rules.push(content);
  }
  return rules;
}
