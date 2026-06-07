import { Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const webSearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
});

export function createWebSearchTool(tavilyApiKey: string): AgentTool<typeof webSearchParams, { query: string; resultCount: number }> {
  return {
    name: "web_search",
    label: "Search Web",
    description: "Search the web for real-time information using Tavily",
    parameters: webSearchParams,
    execute: async (_toolCallId, params, signal) => {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: params.query,
          search_depth: "basic",
          max_results: 5,
        }),
        signal,
      });
      const data = await res.json();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data.results ?? data, null, 2) }],
        details: { query: params.query, resultCount: data.results?.length ?? 0 },
      };
    },
  };
}

