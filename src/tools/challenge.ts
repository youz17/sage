import type { ToolDefinition } from "../types.js";
import type { LLMClient } from "../llm/client.js";

export function createChallengeTool(llm: LLMClient): ToolDefinition {
  return {
    name: "challenge",
    description:
      "Challenge a draft answer as a devil's advocate. Finds weak points, unsupported assumptions, alternative conclusions, and blind spots. Use when you want to stress-test your reasoning before presenting it.",
    parameters: {
      type: "object",
      properties: {
        draft: {
          type: "string",
          description: "The draft answer to challenge",
        },
        original_question: {
          type: "string",
          description: "The user's original question",
        },
      },
      required: ["draft", "original_question"],
    },
    execute: async (args) => {
      const { draft, original_question } = args as {
        draft: string;
        original_question: string;
      };

      const result = await llm.generate([
        {
          role: "system",
          content: `You are a sharp, incisive devil's advocate. Your job is to find every weakness in the given answer.

Your approach:
1. **Attack assumptions.** What is the answer taking for granted that might not be true?
2. **Find blind spots.** What important aspects does the answer completely ignore?
3. **Challenge conclusions.** Could the same evidence support a different or even opposite conclusion?
4. **Check for bias.** Is the answer biased toward a particular viewpoint without acknowledging alternatives?
5. **Identify the strongest counter-argument.** What would the smartest critic say?

Be genuinely adversarial — not rude, but relentless. Don't let weak reasoning slide.

Respond in this JSON format:
{
  "overall_strength": "weak" | "moderate" | "strong",
  "objections": [
    { "point": "...", "severity": "critical" | "significant" | "minor", "counter_argument": "..." }
  ],
  "blind_spots": ["..."],
  "alternative_conclusion": "A plausible alternative interpretation of the same evidence, if any."
}`,
        },
        {
          role: "user",
          content: `Original question: ${original_question}\n\nDraft answer to challenge:\n${draft}`,
        },
      ]);

      return result.content ?? "Challenge failed: no response";
    },
  };
}
