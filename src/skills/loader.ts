import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getSubdir, scanMdFiles } from "../config/loader.js";
import type { ToolManager } from "../agent/tool-manager.js";

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

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) frontmatter[kv[1].trim()] = kv[2].trim();
  }

  return {
    frontmatter: {
      type: (frontmatter.type as "auto" | "manual") ?? "manual",
      description: frontmatter.description,
    },
    body: match[2].trim(),
  };
}

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

  for (const file of readdirSync(builtinDir)) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    const raw = readFileSync(join(builtinDir, file), "utf-8");
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
  const raw = scanMdFiles(customDir);
  for (const [name, content] of raw) {
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
  const items = skills.map(
    (s) => `<skill>\n  <name>${s.name}</name>\n  <description>${s.description ?? "No description"}</description>\n</skill>`
  );
  return `<available_skills>\n${items.join("\n")}\n</available_skills>`;
}

const useSkillParams = Type.Object({
  skill: Type.String({ description: "要激活的 skill 名称" }),
});

export function buildUseSkillTool(skills: Skill[], toolManager?: ToolManager): AgentTool<typeof useSkillParams> {
  return {
    name: "use_skill",
    label: "Use Skill",
    description:
      "激活一个 skill 以获取其完整指令和能力。当某个 skill 的描述表明它对当前任务有帮助时使用。",
    parameters: useSkillParams,
    execute: async (_toolCallId, params) => {
      const skill = loadSkill(params.skill);
      if (!skill) {
        return {
          content: [{ type: "text" as const, text: `Skill "${params.skill}" 未找到。` }],
          details: null,
        };
      }

      // Activate skill tools if available
      if (toolManager) {
        toolManager.activate(params.skill);
      }

      // Build response: skill prompt + tool list
      let responseText = buildSkillActivation(skill);

      if (toolManager) {
        const toolsDesc = toolManager.getToolDescriptions(params.skill);
        if (toolsDesc) {
          responseText += `\n\n此技能提供了以下工具：\n${toolsDesc}`;
        }
      }

      return {
        content: [{ type: "text" as const, text: responseText }],
        details: { skillName: skill.name, toolsActivated: toolManager?.getToolCount(params.skill) ?? 0 },
      };
    },
  };
}

export function loadSkill(name: string): Skill | null {
  const all = getAllSkills();
  return all.get(name) ?? null;
}

export function buildSkillActivation(skill: Skill): string {
  return `<activated_skill name="${skill.name}">\n${skill.prompt}\n</activated_skill>`;
}

export function buildManualSkillPrompt(skill: Skill, userText: string): string {
  return [
    `<activated_skill name="${skill.name}">`,
    skill.prompt,
    `</activated_skill>`,
    ``,
    `请按照上述指令处理以下用户输入：`,
    ``,
    `<user_query>`,
    userText,
    `</user_query>`,
  ].join("\n");
}

export function getAllSkillNames(): string[] {
  return Array.from(getAllSkills().keys());
}
