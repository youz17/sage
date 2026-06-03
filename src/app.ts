import { getModel } from "@earendil-works/pi-ai";
import { loadConfig } from "./config/loader.js";
import { createSageAgent } from "./agent/index.js";
import { SessionManager } from "./session/manager.js";
import { getAllModeNames, isValidMode } from "./core/modes.js";
import { buildSystemPrompt } from "./core/prompts.js";

function setApiKeyEnv(provider: string, apiKey: string): void {
  const envVarMap: Record<string, string> = {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    vertex: "GOOGLE_API_KEY",
    bedrock: "AWS_ACCESS_KEY_ID",
  };
  const envVar = envVarMap[provider.toLowerCase()];
  if (envVar) {
    process.env[envVar] = apiKey;
  }
}

async function main() {
  const { createSageTUI } = await import("./tui/index.js");

  const config = loadConfig();
  setApiKeyEnv(config.model.provider, config.model.apiKey);
  const model = getModel(config.model.provider as any, config.model.model);

  // Session setup
  const sessionManager = new SessionManager();
  const args = process.argv.slice(2);
  const isNewSession = args.includes("--new");

  let session = sessionManager.getCurrent();
  if (!isNewSession) {
    const sessions = SessionManager.list();
    if (sessions.length > 0) {
      const resumed = SessionManager.resume(sessions[0].id);
      if (resumed) {
        const s = sessionManager.newSession(resumed.mode);
        s.id = resumed.id;
        s.messages = resumed.messages;
        session = s;
      }
    }
  }

  if (!session) {
    session = sessionManager.newSession(config.defaultMode);
  }

  // Agent setup
  let activeSkills: string[] = [];
  let currentMode = session.mode;

  const agent = createSageAgent(model, {
    mode: currentMode,
    skillNames: activeSkills,
    tavilyApiKey: config.tavilyApiKey,
    sessionId: session.id,
  });

  // Restore messages
  if (session.messages.length > 0) {
    agent.state.messages = [...session.messages] as any;
  }

  // TUI setup
  const tui = createSageTUI({
    onInput(text: string) {
      agent.prompt(text).catch((err: Error) => {
        console.error("Agent error:", err);
      });
    },

    onQuit() {
      sessionManager.updateMessages(agent.state.messages as any[]);
      sessionManager.saveCurrent();
    },

    onModeChange(mode: string) {
      if (!isValidMode(mode)) {
        console.log(`Unknown mode: "${mode}". Available: ${getAllModeNames().join(", ")}`);
        return;
      }
      currentMode = mode;
      sessionManager.setMode(mode);
      agent.state.systemPrompt = buildSystemPrompt(mode, activeSkills);
    },

    onSessionCommand(args: string) {
      const parts = args.split(/\s+/);
      const subCmd = parts[0];
      const subArgs = parts.slice(1).join(" ");

      switch (subCmd) {
        case "new": {
          sessionManager.saveCurrent();
          const s = sessionManager.newSession(currentMode);
          agent.state.messages = [] as any;
          break;
        }
        case "list": {
          const sessions = SessionManager.list();
          console.log("\nSessions:");
          sessions.forEach((s, i) => {
            console.log(`  ${i + 1}. [${s.id}] ${s.title} (${s.mode}) — ${s.updatedAt.slice(0, 10)}`);
          });
          break;
        }
        case "resume": {
          const id = subArgs;
          const resumed = SessionManager.resume(id);
          if (!resumed) {
            console.log(`Session "${id}" not found.`);
            return;
          }
          sessionManager.saveCurrent();
          const s = sessionManager.newSession(resumed.mode);
          s.id = resumed.id;
          s.messages = resumed.messages;
          agent.state.messages = [...resumed.messages] as any;
          currentMode = resumed.mode;
          agent.state.systemPrompt = buildSystemPrompt(resumed.mode, activeSkills);
          break;
        }
        case "delete": {
          const id = subArgs;
          if (SessionManager.delete(id)) {
            console.log(`Session "${id}" deleted.`);
          } else {
            console.log(`Session "${id}" not found.`);
          }
          break;
        }
        default:
          console.log(`Unknown session command: "${subCmd}". Use: new|list|resume|delete`);
      }
    },

    onSkillActivate(skill: string) {
      if (activeSkills.includes(skill)) {
        activeSkills = activeSkills.filter((s) => s !== skill);
        console.log(`Skill "${skill}" deactivated.`);
      } else {
        activeSkills.push(skill);
        console.log(`Skill "${skill}" activated.`);
      }
      agent.state.systemPrompt = buildSystemPrompt(currentMode, activeSkills);
    },
  });

  // Wire agent events to TUI streaming
  agent.subscribe(async (event) => {
    if (event.type === "message_update" && (event as any).assistantMessageEvent?.type === "text_delta") {
      tui.onStreamDelta((event as any).assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      tui.onToolCallStart(
        (event as any).toolName,
        (event as any).args ?? {},
        (event as any).toolCallId,
      );
    }
    if (event.type === "agent_end") {
      sessionManager.updateMessages(agent.state.messages as any[]);
      sessionManager.saveCurrent();
    }
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    sessionManager.updateMessages(agent.state.messages as any[]);
    sessionManager.saveCurrent();
    tui.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
