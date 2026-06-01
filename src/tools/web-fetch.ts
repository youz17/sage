import type { ToolDefinition } from "../types.js";

export function createWebFetchTool(): ToolDefinition {
  return {
    name: "web_fetch",
    description:
      "Fetch and extract the text content of a web page at a given URL. Use to read pages discovered via web_search.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch",
        },
      },
      required: ["url"],
    },
    execute: async (args) => {
      const url = args.url as string;
      if (!url) return "Error: url is required";

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; SageBot/0.1)",
          },
        });
      } catch (err) {
        return `Fetch failed: ${(err as Error).message}`;
      }

      if (!response.ok) {
        return `Fetch failed (${response.status}): ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/html")) {
        const html = await response.text();
        const text = stripHtml(html);
        if (text.length > 8000) {
          return text.slice(0, 8000) + `\n\n[truncated, ${text.length} chars total]`;
        }
        return text;
      }

      if (contentType.includes("text/")) {
        const text = await response.text();
        if (text.length > 8000) {
          return text.slice(0, 8000) + `\n\n[truncated, ${text.length} chars total]`;
        }
        return text;
      }

      return `Unsupported content type: ${contentType}. Content length: ${response.headers.get("content-length") ?? "unknown"}`;
    },
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
