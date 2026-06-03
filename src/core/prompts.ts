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
