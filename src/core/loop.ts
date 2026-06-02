import type { AgentConfig, AgentEvent, Message, ToolCall } from "../types.js";
import type { LLMClient } from "../llm/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildSkillPrompt, loadSkill } from "../skills/loader.js";

const DEFAULT_CONFIG: AgentConfig = {
  maxIterations: 20,
  mode: "socratic",
  skills: [],
};

export async function* runAgent(
  userMessage: string,
  history: Message[],
  llm: LLMClient,
  tools: ToolRegistry,
  config: Partial<AgentConfig> = {},
): AsyncGenerator<AgentEvent> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const skillPrompt = buildSkillPrompt(cfg.skills);
  const systemPrompt = buildSystemPrompt(cfg.mode, skillPrompt, cfg.autoSkillPrompt);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const toolSchemas = tools.getSchemas();
  let iteration = 0;
  let lastToolCall = "";
  const activatedSkills = new Set<string>();

  while (iteration < cfg.maxIterations) {
    iteration++;

    yield { type: "thinking", content: `Iteration ${iteration}...`, iteration };

    let fullContent = "";
    let allToolCalls: ToolCall[] = [];
    let thinkingContent: string | null = null;

    for await (const chunk of llm.stream(messages, toolSchemas)) {
      if (chunk.thinking) {
        thinkingContent = chunk.thinking;
        yield { type: "thinking", content: chunk.thinking, iteration };
      }
      if (chunk.content) {
        fullContent += chunk.content;
        yield { type: "text_chunk", content: chunk.content, iteration };
      }
      if (chunk.toolCalls.length > 0) {
        allToolCalls = chunk.toolCalls;
      }
    }

    if (allToolCalls.length === 0) {
      messages.push({ role: "assistant", content: fullContent });
      yield { type: "text_done", content: fullContent, iteration };
      yield { type: "done", iteration };
      return;
    }

    // Duplicate tool call detection
    const currentCallSig = JSON.stringify(
      allToolCalls.map((tc) => ({ name: tc.function.name, args: tc.function.arguments })),
    );
    if (currentCallSig === lastToolCall) {
      yield {
        type: "error",
        content: "Detected repeated tool call — stopping to prevent infinite loop.",
        iteration,
      };
      if (fullContent) {
        yield { type: "text_done", content: fullContent, iteration };
      }
      yield { type: "done", iteration };
      return;
    }
    lastToolCall = currentCallSig;

    messages.push({
      role: "assistant",
      content: fullContent || null as unknown as string,
      tool_calls: allToolCalls,
    });

    for (const tc of allToolCalls) {
      const toolName = tc.function.name;
      let toolArgs: Record<string, unknown>;
      try {
        toolArgs = JSON.parse(tc.function.arguments);
      } catch {
        toolArgs = {};
      }

      yield {
        type: "tool_call",
        toolName,
        toolArgs,
        toolCallId: tc.id,
        iteration,
      };

      let result: string;

      if (toolName === "use_skill") {
        const skillName = toolArgs.skill as string;
        if (activatedSkills.has(skillName)) {
          result = `Skill "${skillName}" is already active.`;
        } else {
          const skill = loadSkill(skillName);
          if (skill) {
            activatedSkills.add(skillName);
            result = `Skill "${skillName}" activated. Instructions:\n${skill.prompt}`;
          } else {
            result = `Skill "${skillName}" not found.`;
          }
        }
      } else {
        result = await tools.execute(toolName, toolArgs);
      }

      yield {
        type: "tool_result",
        toolName,
        toolCallId: tc.id,
        content: result,
        iteration,
      };

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
    }
  }

  yield {
    type: "error",
    content: `Reached maximum iterations (${cfg.maxIterations}). Stopping.`,
    iteration,
  };
  yield { type: "done", iteration };
}
