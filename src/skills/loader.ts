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

export function parseSkillsFromInput(input: string): {
  skills: string[];
  cleanInput: string;
} {
  const skills: string[] = [];
  const cleanInput = input.replace(/\/(\w+)/g, (_, name: string) => {
    if (name !== "mode" && name !== "session" && name !== "quit" && name !== "exit") {
      skills.push(name);
    }
    return "";
  }).trim();

  return { skills, cleanInput: cleanInput || input };
}
