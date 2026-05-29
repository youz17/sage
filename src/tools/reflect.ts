import type { ToolDefinition } from "../types.js";
import type { LLMClient } from "../llm/client.js";

export function createReflectTool(llm: LLMClient): ToolDefinition {
  return {
    name: "reflect",
    description:
      "Critically review a draft answer for accuracy, logic, completeness, and hallucinations. Use when dealing with complex questions, factual claims, or numerical analysis. Returns a structured checklist of issues found.",
    parameters: {
      type: "object",
      properties: {
        draft: {
          type: "string",
          description: "The draft answer to review",
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
          content: `You are a critical reviewer. Analyze the given draft answer against the original question.

Check these dimensions:
1. **Factual accuracy** — Are claims supported by evidence? Any potential hallucinations?
2. **Numerical accuracy** — Are numbers, calculations, dates correct?
3. **Logical consistency** — Does the reasoning flow? Any contradictions?
4. **Completeness** — Does it fully answer the question? Anything missing?

Respond in this JSON format:
{
  "verdict": "PASS" | "NEEDS_FIX",
  "issues": [
    { "dimension": "...", "description": "...", "severity": "high" | "medium" | "low" }
  ],
  "suggestions": "concise fix suggestions if NEEDS_FIX, empty string if PASS"
}`,
        },
        {
          role: "user",
          content: `Original question: ${original_question}\n\nDraft answer:\n${draft}`,
        },
      ]);

      return result.content ?? "Reflection failed: no response";
    },
  };
}
