import { getModePrompt } from "./modes.js";
import { loadRules } from "../config/loader.js";
export function buildSystemPrompt(mode: string, autoSkillPrompt?: string): string {
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

  if (autoSkillPrompt) {
    parts.push(autoSkillPrompt);
    parts.push("");
    parts.push("你可以使用 `use_skill` 工具激活以上技能，激活后将获得完整指令。");
    parts.push("");
  }

  return parts.join("\n");
}
