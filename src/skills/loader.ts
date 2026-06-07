import { readFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { walkDir } from "../core/file-loader.js";
import { getSubdir } from "../config/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SkillFrontmatter {
  type: "auto" | "manual";
  description?: string;
}

export interface Skill {
  name: string;
  type: "auto" | "manual";
  description?: string;
  prompt: string;
}

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = yaml.load(match[1]) as Record<string, string> | undefined;
  if (!frontmatter) return null;

  return {
    frontmatter: {
      type: (frontmatter.type as "auto" | "manual") ?? "manual",
      description: frontmatter.description,
    },
    body: match[2].trim(),
  };
}

// TODO: 和mode相同问题
function findBuiltinDir(): string | null {
  // tsx (dev): __dirname = src/skills/ -> builtin/ = src/skills/builtin/
  const tsxPath = join(__dirname, "builtin");
  if (existsSync(tsxPath)) return tsxPath;

  // tsc compiled (prod): __dirname = dist/skills/ -> builtin/ = dist/skills/builtin/
  // Fallback: walk up from __dirname to find src/skills/builtin/
  const srcPath = join(__dirname, "..", "..", "src", "skills", "builtin");
  if (existsSync(srcPath)) return srcPath;

  return null;
}

function scanBuiltinSkills(): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  const builtinDir = findBuiltinDir();
  if (!builtinDir) return skills;

  for (const file of walkDir(builtinDir, ".md")) {
    const name = basename(file, ".md");
    const raw = readFileSync(file, "utf-8");
    const parsed = parseFrontmatter(raw);
    if (parsed) {
      skills.set(name, {
        name,
        type: parsed.frontmatter.type,
        description: parsed.frontmatter.description,
        prompt: parsed.body,
      });
    }
  }
  return skills;
}

function scanCustomSkills(): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  const customDir = getSubdir("skills");
  for (const file of walkDir(customDir, ".md")) {
    const name = basename(file, ".md");
    const content = readFileSync(file, "utf-8");
    const parsed = parseFrontmatter(content);
    if (parsed) {
      skills.set(name, {
        name,
        type: parsed.frontmatter.type,
        description: parsed.frontmatter.description,
        prompt: parsed.body,
      });
    }
  }
  return skills;
}

export function getAllSkills(): Map<string, Skill> {
  const skills = scanBuiltinSkills();
  for (const [name, skill] of scanCustomSkills()) {
    skills.set(name, skill); // custom overrides builtin
  }
  return skills;
}

export function getAutoSkills(skills?: Map<string, Skill>): Skill[] {
  const all = skills ?? getAllSkills();
  return Array.from(all.values()).filter((s) => s.type === "auto");
}

export function buildAutoSkillPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  return skills.map((s) => `- ${s.name}: ${s.description ?? "No description"}`).join("\n");
}

export function buildUseSkillTool(skills: Skill[]): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: "use_skill",
    description: "Activate a skill to get its full instructions and capabilities. Use when a skill's description suggests it would help with the current task.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          enum: skills.map((s) => s.name),
          description: "The skill to activate",
        },
      },
      required: ["skill"],
    },
  };
}

export function loadSkill(name: string): Skill | null {
  const all = getAllSkills();
  return all.get(name) ?? null;
}

// TODO: 调整 skill 组织方式
export function buildSkillPrompt(skillNames: string[]): string {
  const parts: string[] = [];
  for (const name of skillNames) {
    const skill = loadSkill(name);
    if (skill) {
      parts.push(`<skill name="${skill.name}">\n${skill.prompt}\n</skill>`);
    }
  }
  return parts.length > 0
    ? `\n\n以下 skill 已激活。请遵循它们的指令：\n\n${parts.join("\n\n")}`
    : "";
}

export function getAllSkillNames(): string[] {
  return Array.from(getAllSkills().keys());
}
