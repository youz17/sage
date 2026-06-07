import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { SageModelConfig } from "../config/types.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { buildSystemPrompt } from "../core/prompts.js";
import { createWebSearchTool, createWebFetchTool } from "./tools.js";
import { getAutoSkills, buildAutoSkillPrompt, buildUseSkillTool } from "../skills/loader.js";
import { compactMemory } from "./memory.js";

export function createSageAgent(
  model: Model<any>,
  options: {
    mode?: string;
    tavilyApiKey?: string;
    sessionId?: string;
  } = {},
) {
  const { mode = "default", tavilyApiKey, sessionId } = options;

  const autoSkills = getAutoSkills();
  const autoSkillPrompt = buildAutoSkillPrompt(autoSkills);

  const tools: AgentTool[] = [];

  if (autoSkills.length > 0) {
    tools.push(buildUseSkillTool(autoSkills));
  }

  tools.push(createWebFetchTool());

  if (tavilyApiKey) {
    tools.push(createWebSearchTool(tavilyApiKey));
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(mode, autoSkillPrompt),
      model,
      thinkingLevel: "high",
      tools,
      messages: [],
    },
    transformContext: async (messages, signal) => {
      const compacted = await compactMemory(messages);
      return compacted ?? messages;
    },
    convertToLlm: (messages) => {
      return messages.map((m: any) => {
        if (m.role === "memory") {
          return { role: "user", content: m.content };
        }
        return m;
      });
    },
    sessionId,
    steeringMode: "one-at-a-time",
    followUpMode: "one-at-a-time",
  });

  return agent;
}
