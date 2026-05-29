export const BUILTIN_SKILLS: Record<string, string> = {
  reflect: `After composing your response, you MUST call the "reflect" tool to critically review your answer before presenting it to the user.
Pass your draft answer and the user's original question to the reflect tool.
If the reflection verdict is "NEEDS_FIX", revise your answer based on the suggestions and present the improved version.
If "PASS", present your answer with confidence.`,

  challenge: `After composing your response, you MUST call the "challenge" tool to stress-test your answer.
Pass your draft answer and the user's original question to the challenge tool.
The tool will return a devil's advocate critique. Carefully consider each objection:
- If the critique raises valid points, revise your answer to address them.
- If the critique is weak or wrong, explain why your original reasoning holds.
Present your final answer with the strongest objections addressed.`,

  goal: `The user has set a goal. Your job is to help achieve it:
1. Break the goal into concrete, actionable sub-tasks.
2. Work through each sub-task one by one.
3. Use available tools (web search, etc.) to gather information needed for each sub-task.
4. After completing all sub-tasks, synthesize the results into a coherent final answer.
5. Present a summary of what was accomplished.

Report your progress as you go: "Working on step X of Y: ..."`,
};
