import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

const webSearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
});

const webFetchParams = Type.Object({
  url: Type.String({ description: "The URL to fetch content from" }),
  format: Type.Optional(Type.Union([
    Type.Literal("markdown"),
    Type.Literal("text"),
    Type.Literal("html"),
  ])),
});

const _turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export function htmlToMarkdown(html: string): string {
  const dom = new JSDOM(html);
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const contentHtml = article?.content || html;
  return _turndown.turndown(contentHtml);
}

export function createWebFetchTool(): AgentTool<typeof webFetchParams, { url: string; format: string; contentLength: number }> {
  return {
    name: "webfetch",
    label: "Fetch Web",
    description: "Fetches content from a specified URL and returns it in the requested format (markdown, text, or html)",
    parameters: webFetchParams,
    execute: async (_toolCallId, params, signal) => {
      const format = params.format ?? "markdown";
      const res = await fetch(params.url, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      let text: string;

      if (contentType.includes("application/json")) {
        text = JSON.stringify(await res.json(), null, 2);
      } else {
        text = await res.text();
      }

      if (format === "markdown") {
        text = htmlToMarkdown(text);
      } else if (format === "text") {
        // simple HTML strip for plain text (keep readability for structure)
        const dom = new JSDOM(text);
        text = dom.window.document.body?.textContent ?? text;
        text = text.replace(/\s+/g, " ").trim();
      }

      const maxLength = 100000;
      if (text.length > maxLength) {
        text = text.slice(0, maxLength) + "\n\n[Content truncated at 100,000 characters]";
      }

      return {
        content: [{ type: "text" as const, text }],
        details: { url: params.url, format, contentLength: text.length },
      };
    },
  };
}

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

