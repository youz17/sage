import "dotenv/config";
import * as readline from "node:readline";
import { createLLMClient } from "./llm/index.js";
import { ToolRegistry, createWebSearchTool, createReflectTool, createChallengeTool } from "./tools/index.js";
import { runAgent, getAllModeNames, isValidMode } from "./core/index.js";
import type { Message } from "./types.js";

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

const history: Message[] = [];
let currentMode = "socratic";
const ALL_MODES = getAllModeNames();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

console.log(`${BOLD}Sage (simple test)${RESET}`);
console.log(`${DIM}Modes: ${ALL_MODES.join(", ")}${RESET}`);
console.log(`${DIM}Tools: ${tools.list().join(", ") || "none"}${RESET}`);
console.log(`${CYAN}Mode: ${currentMode}${RESET}\n`);

function prompt(): void {
  rl.question(`${BOLD}You:${RESET} `, async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();

    if (trimmed === "/quit" || trimmed === "/exit") {
      console.log("Bye!");
      rl.close();
      process.exit(0);
    }

    const modeMatch = trimmed.match(/^\/mode\s+(\w+)$/);
    if (modeMatch) {
      const newMode = modeMatch[1];
      if (isValidMode(newMode)) {
        currentMode = newMode;
        console.log(`${CYAN}Mode switched to: ${currentMode}${RESET}\n`);
      } else {
        console.log(`${RED}Unknown mode: ${newMode}. Available: ${ALL_MODES.join(", ")}${RESET}\n`);
      }
      return prompt();
    }

    const skills: string[] = [];
    const cleanInput = trimmed.replace(/\/(\w+)/g, (_, name: string) => {
      if (!["mode", "session", "quit", "exit"].includes(name)) {
        skills.push(name);
      }
      return "";
    }).trim();
    if (skills.length > 0) {
      console.log(`${DIM}Active skills: ${skills.join(", ")}${RESET}`);
    }

    history.push({ role: "user", content: cleanInput });
    let currentText = "";
    process.stdout.write(`\n${BOLD}Agent${RESET} ${DIM}[${currentMode}]${RESET}${BOLD}:${RESET} `);

    try {
      for await (const event of runAgent(cleanInput, history.slice(0, -1), llm, tools, {
        mode: currentMode,
        skills,
      })) {
        switch (event.type) {
          case "thinking":
            if (event.content?.startsWith("Iteration")) {
              process.stdout.write(`\n${DIM}[${event.content}]${RESET}\n`);
            }
            break;
          case "tool_call":
            process.stdout.write(`\n${YELLOW}  ▶ ${event.toolName}(${JSON.stringify(event.toolArgs)})${RESET}\n`);
            break;
          case "tool_result": {
            const preview = event.content?.slice(0, 150)?.replace(/\n/g, " ") ?? "";
            process.stdout.write(`${GREEN}  ✓ ${event.toolName} result${RESET} ${DIM}(${preview}...)${RESET}\n`);
            break;
          }
          case "text_chunk":
            process.stdout.write(event.content ?? "");
            currentText += event.content ?? "";
            break;
          case "text_done":
            if (!currentText && event.content) process.stdout.write(event.content);
            history.push({ role: "assistant", content: event.content ?? currentText });
            break;
          case "error":
            process.stdout.write(`\n${RED}Error: ${event.content}${RESET}\n`);
            break;
          case "done":
            process.stdout.write("\n\n");
            break;
        }
      }
    } catch (err) {
      console.error(`\n${RED}Fatal error: ${(err as Error).message}${RESET}\n`);
    }
    prompt();
  });
}

prompt();
