import "dotenv/config";
import { createLLMClient } from "../llm/index.js";
import {
  ToolRegistry,
  createWebSearchTool,
  createReflectTool,
  createChallengeTool,
} from "../tools/index.js";
import { runAgent } from "../core/index.js";
import type { Message } from "../types.js";
import { Renderer } from "./renderer.js";
import { InputEditor } from "./input.js";
import type { CompletionItem } from "./completer.js";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

if (!DEEPSEEK_API_KEY) {
  console.error("Error: DEEPSEEK_API_KEY is required. Set it in .env file.");
  process.exit(1);
}

const llm = createLLMClient({
  apiKey: DEEPSEEK_API_KEY,
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
});

const tools = new ToolRegistry();
if (TAVILY_API_KEY) {
  tools.register(createWebSearchTool(TAVILY_API_KEY));
}
tools.register(createReflectTool(llm));
tools.register(createChallengeTool(llm));

const completionItems: CompletionItem[] = [
  { command: "/reflect", description: "Review answer for accuracy" },
  { command: "/challenge", description: "Devil's advocate stress test" },
  { command: "/goal", description: "Break down and execute a goal" },
  { command: "/mode", description: "Switch mode (+ name)" },
  { command: "/quit", description: "Exit" },
];

const renderer = new Renderer();
const input = new InputEditor("socratic", completionItems);
const history: Message[] = [];

renderer.renderWelcome(input.mode, tools.list());

async function mainLoop(): Promise<void> {
  while (true) {
    const result = await input.prompt();

    if (result.type === "quit") {
      console.log("\n  Bye!\n");
      process.exit(0);
    }

    if (result.type === "mode_switch") {
      if (result.mode) {
        input.setMode(result.mode);
        renderer.renderModeSwitch(result.mode);
      }
      continue;
    }

    if (result.type === "message" && result.text) {
      renderer.renderUserMessage(result.text);
      renderer.renderAgentHeader(input.mode);
      renderer.startSpinner();

      history.push({ role: "user", content: result.text });
      let fullText = "";
      let spinnerStopped = false;

      try {
        for await (const event of runAgent(
          result.text,
          history.slice(0, -1),
          llm,
          tools,
          { mode: input.mode, skills: result.skills ?? [] },
        )) {
          switch (event.type) {
            case "thinking":
              break;

            case "tool_call":
              if (!spinnerStopped) {
                renderer.stopSpinner();
                spinnerStopped = true;
              }
              renderer.renderToolCall(
                event.toolName ?? "unknown",
                event.toolArgs ?? {},
              );
              renderer.startSpinner();
              break;

            case "tool_result":
              renderer.stopSpinner();
              spinnerStopped = true;
              renderer.renderToolResult(
                event.toolName ?? "unknown",
                event.content ?? "",
              );
              renderer.startSpinner();
              spinnerStopped = false;
              break;

            case "text_chunk":
              if (!spinnerStopped) {
                renderer.stopSpinner();
                spinnerStopped = true;
              }
              renderer.renderTextChunk(event.content ?? "");
              fullText += event.content ?? "";
              break;

            case "text_done":
              renderer.stopSpinner();
              spinnerStopped = true;
              renderer.renderTextDone();
              history.push({
                role: "assistant",
                content: event.content ?? fullText,
              });
              break;

            case "error":
              renderer.stopSpinner();
              spinnerStopped = true;
              renderer.renderError(event.content ?? "Unknown error");
              break;

            case "done":
              renderer.stopSpinner();
              renderer.renderDone();
              break;
          }
        }
      } catch (err) {
        renderer.stopSpinner();
        renderer.renderError((err as Error).message);
      }
    }
  }
}

mainLoop();
