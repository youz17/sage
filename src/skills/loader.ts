import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILTIN_SKILLS } from "./builtin.js";

export interface Skill {
  name: string;
  prompt: string;
}

const SKILLS_DIR = resolve("skills");

export function loadSkill(name: string): Skill | null {
  const builtin = BUILTIN_SKILLS[name];
  if (builtin) return { name, prompt: builtin };

  const filePath = join(SKILLS_DIR, `${name}.md`);
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8");
    return { name, prompt: content };
  }

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

export function parseSkillsFromInput(input: string): {
  skills: string[];
  cleanInput: string;
} {
  const skills: string[] = [];
  const cleanInput = input.replace(/\/(\w+)/g, (_, name: string) => {
    skills.push(name);
    return "";
  }).trim();

  return { skills, cleanInput: cleanInput || input };
}
