import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";

export function walkDir(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function loadYamlFiles<T>(dir: string): T[] {
  const files = walkDir(dir, ".yaml").concat(walkDir(dir, ".yml"));
  return files.map((f) => yaml.load(fs.readFileSync(f, "utf-8")) as T);
}
