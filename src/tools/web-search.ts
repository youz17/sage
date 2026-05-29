import type { ToolDefinition } from "../types.js";

export function createWebSearchTool(apiKey: string): ToolDefinition {
  return {
    name: "web_search",
    description:
      "Search the web for real-time information. Use when you need current facts, news, data, or anything that may not be in your training data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
    execute: async (args) => {
      const query = args.query as string;
      if (!query) return "Error: query is required";

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: 5,
          include_answer: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return `Search failed (${response.status}): ${text}`;
      }

      const data = (await response.json()) as {
        answer?: string;
        results?: Array<{ title: string; url: string; content: string }>;
      };

      let output = "";
      if (data.answer) {
        output += `Summary: ${data.answer}\n\n`;
      }
      if (data.results) {
        output += "Sources:\n";
        for (const r of data.results) {
          output += `- [${r.title}](${r.url})\n  ${r.content.slice(0, 300)}\n\n`;
        }
      }
      return output || "No results found";
    },
  };
}
