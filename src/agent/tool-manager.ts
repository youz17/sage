import { exec } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Agent } from "@earendil-works/pi-agent-core";

export function escapeShell(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, {
    type: "string";
    required?: boolean;
    description: string;
  }>;
  command: string;
  timeout?: number;
}

interface ToolsManifest {
  tools: ToolDef[];
}

const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 300_000;

function buildSkillTool(toolDef: ToolDef, skillDir: string): AgentTool {
  const schemaProps: Record<string, any> = {};
  for (const [key, param] of Object.entries(toolDef.parameters)) {
    const str = Type.String({ description: param.description });
    schemaProps[key] = param.required === false ? Type.Optional(str) : str;
  }
  const paramsSchema = Type.Object(schemaProps);

  const timeout = Math.min(toolDef.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);

  return {
    name: toolDef.name,
    label: toolDef.label,
    description: toolDef.description,
    parameters: paramsSchema,
    execute: async (_toolCallId, params, signal) => {
      let cmd = toolDef.command.replaceAll("{{skillDir}}", escapeShell(skillDir));
      for (const [key, value] of Object.entries(params as Record<string, string | undefined>)) {
        const needle = `{{${key}}}`;
        if (!cmd.includes(needle)) continue;
        const escaped = value !== undefined ? escapeShell(value) : "";
        cmd = cmd.replaceAll(needle, escaped);
      }

      return new Promise((resolve, reject) => {
        const proc = exec(cmd, {
          cwd: skillDir,
          timeout,
          signal,
        }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            const maxLen = 100_000;
            const text = stdout.length > maxLen
              ? stdout.slice(0, maxLen) + "\n\n[输出已截断]"
              : stdout;
            resolve({
              content: [{ type: "text" as const, text }],
              details: { command: cmd, exitCode: 0 },
            });
          }
        });
      });
    },
  };
}

function scanSkillTools(skillsDir: string): Map<string, AgentTool[]> {
  const result = new Map<string, AgentTool[]>();

  if (!existsSync(skillsDir)) return result;

  for (const entry of readdirSync(skillsDir)) {
    const dirPath = join(skillsDir, entry);
    const stat = statSync(dirPath);
    if (!stat.isDirectory()) continue;

    const manifestPath = join(dirPath, "tools.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const manifest: ToolsManifest = JSON.parse(raw);

      if (!Array.isArray(manifest.tools)) {
        console.warn(`[ToolManager] ${manifestPath}: "tools" 不是数组，跳过`);
        continue;
      }

      const tools: AgentTool[] = [];
      for (const toolDef of manifest.tools) {
        if (!toolDef.name || !toolDef.command) {
          console.warn(`[ToolManager] ${manifestPath}: 工具缺少 name 或 command，跳过`);
          continue;
        }
        tools.push(buildSkillTool(toolDef, dirPath));
      }

      if (tools.length > 0) {
        result.set(entry, tools);
      }
    } catch (err) {
      console.warn(`[ToolManager] 解析 ${manifestPath} 失败:`, (err as Error).message);
    }
  }

  return result;
}

export class ToolManager {
  private baseTools: AgentTool[];
  private allTools: Map<string, AgentTool[]>;
  private activeSkillNames: Set<string> = new Set();
  private agent: Agent | null = null;

  constructor(baseTools: AgentTool[], skillsDir: string) {
    this.baseTools = baseTools;
    this.allTools = scanSkillTools(skillsDir);
  }

  setAgent(agent: Agent): void {
    this.agent = agent;
    this.syncToAgent();
  }

  activate(skillName: string): void {
    if (this.activeSkillNames.has(skillName)) return;
    const tools = this.allTools.get(skillName);
    if (!tools || tools.length === 0) return;
    this.activeSkillNames.add(skillName);
    this.syncToAgent();
  }

  deactivate(skillName: string): void {
    if (!this.activeSkillNames.has(skillName)) return;
    this.activeSkillNames.delete(skillName);
    this.syncToAgent();
  }

  activateFrom(skillNames: string[]): void {
    for (const name of skillNames) {
      this.activate(name);
    }
  }

  getActiveSkillNames(): string[] {
    return [...this.activeSkillNames];
  }

  getActiveTools(): AgentTool[] {
    return this.buildActiveToolList();
  }

  getSkillTools(skillName: string): AgentTool[] {
    return this.allTools.get(skillName) ?? [];
  }

  getToolDescriptions(skillName: string): string | null {
    const tools = this.allTools.get(skillName);
    if (!tools || tools.length === 0) return null;
    return tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  }

  getToolCount(skillName: string): number {
    return this.allTools.get(skillName)?.length ?? 0;
  }

  private buildActiveToolList(): AgentTool[] {
    const active: AgentTool[] = [...this.baseTools];
    for (const name of this.activeSkillNames) {
      const tools = this.allTools.get(name);
      if (tools) active.push(...tools);
    }
    return active;
  }

  private syncToAgent(): void {
    if (!this.agent) return;
    this.agent.state.tools = this.buildActiveToolList();
  }
}
