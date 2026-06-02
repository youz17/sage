import "dotenv/config";
import { loadConfig } from "../config/index.js";
import { createLLMClient } from "../llm/index.js";
import {
  ToolRegistry,
  createWebSearchTool,
  createReflectTool,
  createChallengeTool,
  createWebFetchTool,
} from "../tools/index.js";
import { runAgent } from "../core/index.js";
import { getAllModes } from "../core/modes.js";
import {
  getAllSkills,
  getAutoSkills,
  buildAutoSkillPrompt,
  buildUseSkillTool,
} from "../skills/loader.js";
import type { ToolDefinition } from "../types.js";
import { SessionManager } from "../session/index.js";
import type { CompletionItem } from "./completer.js";
import { Renderer } from "./renderer.js";
import { InputEditor } from "./input.js";

const config = loadConfig();

if (!config.model.apiKey) {
  console.error("Error: model.apiKey is required in ~/.sage/config.json");
  process.exit(1);
}

const llm = createLLMClient({
  apiKey: config.model.apiKey,
  baseUrl: config.model.provider,
  model: config.model.model,
});

const tools = new ToolRegistry();
if (config.tavilyApiKey) {
  tools.register(createWebSearchTool(config.tavilyApiKey));
}
tools.register(createReflectTool(llm));
tools.register(createChallengeTool(llm));
tools.register(createWebFetchTool());

const allSkills = getAllSkills();
const allModes = getAllModes();
const autoSkills = getAutoSkills(allSkills);
const autoSkillPrompt = buildAutoSkillPrompt(autoSkills);

if (autoSkills.length > 0) {
  const useSkillTool = buildUseSkillTool(autoSkills);
  tools.register({
    ...useSkillTool,
    execute: async () => "", // dummy — intercepted by agent loop
  } as ToolDefinition);
}

const sessionManager = new SessionManager();

const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function buildCompletions(input: string): CompletionItem[] {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);

  // Two-level: /mode <modename>
  if (parts[0] === "/mode" && parts.length >= 2) {
    const query = parts.slice(1).join(" ").toLowerCase();
    const modeItems: CompletionItem[] = [];
    for (const [name, mode] of allModes) {
      if (name.startsWith(query)) {
        modeItems.push({ label: name, description: mode.description || "mode" });
      }
    }
    return modeItems;
  }

  // Two-level: /session <subcommand>
  if (parts[0] === "/session") {
    if (parts.length === 2) {
      const query = parts[1].toLowerCase();
      return [
        { label: "new", description: "Start new session" },
        { label: "list", description: "List all sessions" },
        { label: "resume", description: "Resume a session" },
        { label: "delete", description: "Delete a session" },
      ].filter((item) => item.label.startsWith(query));
    }
    if (parts.length >= 3 && (parts[1] === "resume" || parts[1] === "delete")) {
      const query = parts.slice(2).join(" ").toLowerCase();
      return sessionManager
        .list()
        .filter((s) => s.id.includes(query) || s.title.toLowerCase().includes(query))
        .map((s, i) => ({ label: String(i + 1), description: `${s.title} (${s.id})` }));
    }
    if (parts.length < 2) {
      return [
        { label: "new", description: "Start new session" },
        { label: "list", description: "List all sessions" },
        { label: "resume", description: "Resume a session" },
        { label: "delete", description: "Delete a session" },
      ];
    }
    return [];
  }

  // Top-level: /command
  const query = trimmed.startsWith("/") ? trimmed.slice(1).toLowerCase() : "";
  const items: CompletionItem[] = [];

  // Skills
  for (const [name, skill] of allSkills) {
    items.push({ label: `/${name}`, description: skill.description ?? "skill" });
  }

  // Commands
  items.push({ label: "/mode", description: "Switch mode" });
  items.push({ label: "/session", description: "Manage sessions" });
  items.push({ label: "/quit", description: "Exit" });

  return items.filter((item) => item.label.slice(1).startsWith(query));
}

const renderer = new Renderer();
const input = new InputEditor(config.defaultMode, buildCompletions);

// Startup: resume latest session or create new
const isNewFlag = process.argv.includes("--new");
if (!isNewFlag) {
  const resumed = sessionManager.resumeLatest();
  if (resumed) {
    renderer.renderWelcome(input.mode, tools.list());
    console.log(`  ${DIM}Resumed session: ${resumed.title} (${resumed.id})${RESET}`);
    console.log(`  ${DIM}${resumed.messages.length} messages loaded${RESET}\n`);
    input.setMode(resumed.mode);
  } else {
    sessionManager.createSession(input.mode);
    renderer.renderWelcome(input.mode, tools.list());
  }
} else {
  sessionManager.createSession(input.mode);
  renderer.renderWelcome(input.mode, tools.list());
}

function handleSessionCommand(args: string[]): void {
  const sub = args[0];

  if (sub === "new") {
    const session = sessionManager.createSession(input.mode);
    console.log(`  ${GREEN}New session: ${session.id}${RESET}\n`);
    return;
  }

  if (sub === "list") {
    const sessions = sessionManager.list();
    if (sessions.length === 0) {
      console.log(`  ${DIM}No saved sessions${RESET}\n`);
      return;
    }
    console.log();
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const current = sessionManager.getCurrent()?.id === s.id ? " ←" : "";
      console.log(`  ${CYAN}${i + 1}.${RESET} ${s.title} ${DIM}(${s.id}, ${s.messageCount} msgs)${current}${RESET}`);
    }
    console.log();
    return;
  }

  if (sub === "resume" && args[1]) {
    const session = sessionManager.resume(args[1]);
    if (session) {
      input.setMode(session.mode);
      console.log(`  ${GREEN}Resumed: ${session.title} (${session.messages.length} messages)${RESET}\n`);
    } else {
      console.log(`  ${RED}Session not found: ${args[1]}${RESET}\n`);
    }
    return;
  }

  if (sub === "delete" && args[1]) {
    const ok = sessionManager.delete(args[1]);
    if (ok) {
      console.log(`  ${GREEN}Deleted session${RESET}\n`);
    } else {
      console.log(`  ${RED}Session not found: ${args[1]}${RESET}\n`);
    }
    return;
  }

  console.log(`  ${DIM}Usage: /session new|list|resume <id>|delete <id>${RESET}\n`);
}

async function mainLoop(): Promise<void> {
  while (true) {
    const result = await input.prompt();

    if (result.type === "quit") {
      sessionManager.save();
      console.log("\n  Bye!\n");
      process.exit(0);
    }

    if (result.type === "mode_switch") {
      if (result.mode) {
        input.setMode(result.mode);
        sessionManager.setMode(result.mode);
        renderer.renderModeSwitch(result.mode);
      }
      continue;
    }

    if (result.type === "session_command") {
      handleSessionCommand(result.sessionArgs ?? []);
      continue;
    }

    if (result.type === "message" && result.text) {
      renderer.renderUserMessage(result.text);
      renderer.renderAgentHeader(input.mode);
      renderer.startSpinner();

      const userMsg = { role: "user" as const, content: result.text };
      sessionManager.addMessage(userMsg);

      const history = sessionManager.getMessages().slice(0, -1);
      let fullText = "";
      let spinnerStopped = false;

      try {
        for await (const event of runAgent(
          result.text,
          history,
          llm,
          tools,
          { mode: input.mode, skills: result.skills ?? [], autoSkillPrompt },
        )) {
          switch (event.type) {
            case "thinking":
              break;

            case "tool_call":
              if (!spinnerStopped) { renderer.stopSpinner(); spinnerStopped = true; }
              renderer.renderToolCall(event.toolName ?? "unknown", event.toolArgs ?? {});
              renderer.startSpinner();
              break;

            case "tool_result":
              renderer.stopSpinner();
              spinnerStopped = true;
              renderer.renderToolResult(event.toolName ?? "unknown", event.content ?? "");
              renderer.startSpinner();
              spinnerStopped = false;
              break;

            case "text_chunk":
              if (!spinnerStopped) { renderer.stopSpinner(); spinnerStopped = true; }
              renderer.renderTextChunk(event.content ?? "");
              fullText += event.content ?? "";
              break;

            case "text_done":
              renderer.stopSpinner();
              spinnerStopped = true;
              renderer.renderTextDone();
              sessionManager.addMessage({
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
