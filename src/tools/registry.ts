import type { ToolDefinition, ToolSchema } from "../types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return `Error: tool "${name}" not found`;
    try {
      return await tool.execute(args);
    } catch (err) {
      return `Error executing tool "${name}": ${(err as Error).message}`;
    }
  }

  getSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }
}
