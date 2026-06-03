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

const reflectParams = Type.Object({
  topic: Type.String({ description: "What to reflect on" }),
});

export function createReflectTool(): AgentTool<typeof reflectParams, string> {
  return {
    name: "reflect",
    label: "Reflect",
    description: "Pause and reflect on the conversation so far before answering. Think deeply about what has been discussed, what the user really needs, and whether you're on the right track.",
    parameters: reflectParams,
    execute: async (_toolCallId, params, _signal) => {
      return {
        content: [{
          type: "text" as const,
          text: `Reflection complete on: "${params.topic}". Consider the above analysis before responding.`,
        }],
        details: `Reflection complete on: "${params.topic}"`,
      };
    },
  };
}

const challengeParams = Type.Object({
  claim: Type.String({ description: "The claim or assumption to challenge" }),
});

export function createChallengeTool(): AgentTool<typeof challengeParams, string> {
  return {
    name: "challenge",
    label: "Devil's Advocate",
    description: "Challenge your own assumptions and reasoning before answering. Find flaws, counterarguments, and blind spots.",
    parameters: challengeParams,
    execute: async (_toolCallId, params, _signal) => {
      return {
        content: [{
          type: "text" as const,
          text: `Challenge complete for: "${params.claim}". Consider counterarguments and strengthen your response.`,
        }],
        details: `Challenge complete for: "${params.claim}"`,
      };
    },
  };
}
