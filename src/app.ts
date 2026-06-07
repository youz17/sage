import { getModel } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { loadConfig } from "./config/loader.js";
import type { SageConfig } from "./config/types.js";
import { createSageAgent } from "./agent/index.js";
import { SessionManager, Session } from "./session/manager.js";
import { getAllModeNames, isValidMode } from "./core/modes.js";
import { Logger } from "./log/logger.js";
import { buildSystemPrompt } from "./core/prompts.js";
import { loadSkill } from "./skills/loader.js";
import type { SageTUI, SageTUIHandlers } from "./tui/index.js";

// ---- types ----

/** Shared mutable context for TUI handlers, agent wireup, and status bar. */
interface AppContext {
  sessionManager: SessionManager;
  agent: Agent;
  config: SageConfig;
  session: Session | null;
  currentMode: string;
  tui: SageTUI;
  updateStatusBar(): void;
}

// ---- helpers ----

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

function extractAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (typeof m.content === "string") return m.content;
    return JSON.stringify(m.content).slice(0, 1000);
  }
  return "";
}

// ---- CLI args ----

interface ParsedArgs {
  isNew: boolean;
  isResume: boolean;
  newName?: string;
  resumeName?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const newIdx = args.indexOf("--new");
  const resumeIdx = args.indexOf("--resume");
  return {
    isNew: newIdx !== -1,
    isResume: resumeIdx !== -1,
    newName: newIdx !== -1 ? args[newIdx + 1] : undefined,
    resumeName: resumeIdx !== -1 ? args[resumeIdx + 1] : undefined,
  };
}

// ---- TUI handlers ----

function createTUIHandlers(ctx: AppContext): SageTUIHandlers {
  const sid = ctx.session!.id;

  return {
    onInput(text: string) {
      Logger.info("agent:prompt", { sessionId: sid, text });
      ctx.agent.prompt(text).catch((err: Error) => {
        Logger.error("error", { sessionId: sid, message: err.message, stack: err.stack });
        console.error("Agent error:", err);
      });
    },

    onQuit() {
      ctx.sessionManager.updateMessages(ctx.agent.state.messages);
      ctx.sessionManager.saveCurrent();
      Logger.close();
    },

    onModeChange(mode: string) {
      if (!isValidMode(mode)) {
        ctx.tui.addSystemMessage(
          `Unknown mode: "${mode}". Available: ${getAllModeNames().join(", ")}`,
        );
        return;
      }
      ctx.currentMode = mode;
      Logger.info("mode:change", { sessionId: sid, mode });
      ctx.sessionManager.setMode(mode);
      ctx.agent.state.systemPrompt = buildSystemPrompt(mode);
      ctx.updateStatusBar();
    },

    onSessionNew(name?: string) {
      ctx.sessionManager.saveCurrent();
      const s = ctx.sessionManager.newSession(ctx.currentMode);
      if (name) s.name = name;
      ctx.session = s;
      Logger.info("session:new", { sessionId: sid, name });
      ctx.tui.clearMessages();
      ctx.agent.state.messages = [];
      ctx.updateStatusBar();
    },

    onSessionList() {
      const sessions = SessionManager.list();
      if (sessions.length === 0) {
        ctx.tui.addSystemMessage("No saved sessions.");
        return;
      }
      const lines = sessions.map((s, i) => {
        return `  ${i + 1}. ${s.name}: ${s.description || "(no messages)"}`;
      });
      ctx.tui.addSystemMessage(`Sessions (${sessions.length}):\n${lines.join("\n")}`);
    },

    onSessionResume(name: string) {
      const resumed = SessionManager.findByName(name);
      if (!resumed) {
        ctx.tui.addSystemMessage(`Session "${name}" not found.`);
        return;
      }
      ctx.sessionManager.saveCurrent();

      ctx.tui.restoreMessages(resumed.messages);
      ctx.tui.addSystemMessage(
        `Resumed: ${resumed.name || resumed.id} (${resumed.mode}, ${resumed.messages.length} messages)`,
      );

      const s = ctx.sessionManager.newSession(resumed.mode);
      s.id = resumed.id;
      s.name = resumed.name;
      s.messages = resumed.messages;
      ctx.session = s;
      Logger.info("session:resume", { sessionId: sid, name: s.name });
      ctx.agent.state.messages = [...resumed.messages];
      ctx.currentMode = resumed.mode;
      ctx.agent.state.systemPrompt = buildSystemPrompt(resumed.mode);
      ctx.updateStatusBar();
    },

    onSessionDelete(name: string) {
      const sessions = SessionManager.list();
      const match = sessions.find(
        (s) =>
          s.id === name ||
          s.id.startsWith(name) ||
          (s.name && s.name.toLowerCase().includes(name.toLowerCase())),
      );
      const id = match?.id ?? name;
      if (SessionManager.delete(id)) {
        ctx.tui.addSystemMessage(`Session "${name}" deleted.`);
      } else {
        ctx.tui.addSystemMessage(`Session "${name}" not found.`);
      }
    },

    onSessionRename(name: string) {
      if (!name) {
        ctx.tui.addSystemMessage("Usage: /session-rename <name>");
        return;
      }
      if (!ctx.session) {
        ctx.tui.addSystemMessage("No active session.");
        return;
      }
      const ok = ctx.sessionManager.setName(name);
      if (!ok) {
        ctx.tui.addSystemMessage(`Session "${name}" already exists.`);
        return;
      }
      Logger.info("session:rename", { sessionId: sid, name });
      ctx.tui.addSystemMessage(`Session renamed to "${name}".`);
      ctx.updateStatusBar();
    },

    onSkill(name: string, userText?: string) {
      const skill = loadSkill(name);
      if (!skill) {
        ctx.tui.addSystemMessage(`Skill "${name}" not found.`);
        return;
      }
      const prompt = userText
        ? `${skill.prompt}\n\n${userText}`
        : skill.prompt;
      Logger.info("skill:trigger", { sessionId: ctx.session!.id, skill: name });
      ctx.agent.prompt(prompt).catch((err: Error) => {
        Logger.error("error", { sessionId: ctx.session!.id, message: err.message, stack: err.stack });
        console.error("Agent error:", err);
      });
    },
  };
}

// ---- init ----

interface InitSessionResult {
  session: Session;
  agent: Agent;
  currentMode: string;
}

function initSession(
  sessionManager: SessionManager,
  args: ParsedArgs,
  config: SageConfig,
  model: Model<any>,
): InitSessionResult {
  const { isNew, isResume, newName, resumeName } = args;
  let session = sessionManager.getCurrent();

  if (isResume) {
    if (resumeName && !resumeName.startsWith("--")) {
      const resumed = SessionManager.findByName(resumeName);
      if (resumed) {
        const s = sessionManager.newSession(resumed.mode);
        s.id = resumed.id;
        s.name = resumed.name;
        s.messages = resumed.messages;
        session = s;
      }
    } else {
      const sessions = SessionManager.list();
      if (sessions.length > 0) {
        const resumed = SessionManager.load(sessions[0].id);
        if (resumed) {
          const s = sessionManager.newSession(resumed.mode);
          s.id = resumed.id;
          s.name = resumed.name;
          s.messages = resumed.messages;
          session = s;
        }
      }
    }
  } else if (!isNew) {
    const sessions = SessionManager.list();
    if (sessions.length > 0) {
      const resumed = SessionManager.load(sessions[0].id);
      if (resumed) {
        const s = sessionManager.newSession(resumed.mode);
        s.id = resumed.id;
        s.name = resumed.name;
        s.messages = resumed.messages;
        session = s;
      }
    }
  }

  if (!session) {
    session = sessionManager.newSession(config.defaultMode);
    if (isNew && newName && !newName.startsWith("--")) {
      session.name = newName;
    }
  }

  Logger.info("session:init", { sessionId: session.id, mode: session.mode, model: config.model.model });

  const currentMode = session.mode;

  const agent = createSageAgent(model, {
    mode: currentMode,
    tavilyApiKey: config.tavilyApiKey,
    sessionId: session.id,
  });

  if (session.messages.length > 0) {
    agent.state.messages = [...session.messages];
  }

  return { session, agent, currentMode };
}

// ---- agent events ----

function wireAgentEvents(
  agent: Agent,
  ctx: AppContext,
  tui: SageTUI,
  sessionManager: SessionManager,
  updateStatusBar: () => void,
): void {
  const sid = ctx.session!.id;

  agent.subscribe(async (event: AgentEvent) => {
    if (event.type === "message_update") {
      const ae = event.assistantMessageEvent;
      if (ae.type === "text_delta") {
        tui.onStreamDelta(ae.delta);
      }
      if (ae.type === "thinking_start") {
        tui.onThinkingStart();
      }
      if (ae.type === "thinking_delta") {
        tui.onThinkingDelta(ae.delta);
      }
      if (ae.type === "thinking_end") {
        tui.onThinkingEnd();
      }
    }
    if (event.type === "tool_execution_start") {
      tui.onToolCallStart(event.toolName, event.args ?? {}, event.toolCallId);
      Logger.log("tool:start", { sessionId: sid, name: event.toolName, args: event.args });
    }
    if (event.type === "tool_execution_end") {
      Logger.log("tool:end", { sessionId: sid, name: event.toolName, callId: event.toolCallId });
    }
    if (event.type === "agent_end") {
      const fullResp = extractAssistantText(agent.state.messages);
      Logger.info("agent:response", { sessionId: sid, text: fullResp });

      const lastAssistant = [...agent.state.messages]
        .reverse()
        .find((m) => m.role === "assistant") as AgentMessage | undefined;
      if (
        lastAssistant &&
        "stopReason" in lastAssistant &&
        (lastAssistant.stopReason === "error" || lastAssistant.stopReason === "aborted")
      ) {
        const errMsg =
          "errorMessage" in lastAssistant
            ? (lastAssistant as { errorMessage?: string }).errorMessage
            : undefined;
        Logger.error("agent:error", {
          sessionId: sid,
          stopReason: lastAssistant.stopReason,
          error: errMsg || `Agent ${lastAssistant.stopReason}`,
        });
        tui.addErrorMessage(errMsg || `Agent ${lastAssistant.stopReason}`);
      } else if (!fullResp && agent.state.messages.length > 0) {
        Logger.warn("agent:empty_response", { sessionId: sid, messageCount: agent.state.messages.length });
      }

      sessionManager.updateMessages(agent.state.messages);
      sessionManager.saveCurrent();
      updateStatusBar();
      Logger.info("session:save", { sessionId: sid });
    }
  });
}

// ---- shutdown ----

function registerShutdown(
  agent: Agent,
  sessionManager: SessionManager,
  tui: SageTUI,
): void {
  process.on("SIGINT", () => {
    sessionManager.updateMessages(agent.state.messages);
    sessionManager.saveCurrent();
    Logger.close();
    tui.shutdown();
    process.exit(0);
  });
}

// ---- main ----

async function main(): Promise<void> {
  const { createSageTUI } = await import("./tui/index.js");

  Logger.init();

  const config = loadConfig();
  setApiKeyEnv(config.model.provider, config.model.apiKey);
  const model: Model<any> = getModel(config.model.provider as any, config.model.model);

  // Session setup
  const sessionManager = new SessionManager();
  const { session, agent, currentMode } = initSession(
    sessionManager,
    parseArgs(process.argv.slice(2)),
    config,
    model,
  );

  // TUI setup — ctx gets tui/updateStatusBar filled after tui creation (circular dependency,
  // safe because handlers fire only after createSageTUI returns)
  const ctx: AppContext = {
    sessionManager,
    agent,
    config,
    session,
    currentMode,
  } as AppContext;

  function updateStatusBar() {
    ctx.tui.updateStatus({
      mode: ctx.currentMode,
      thinkingLevel: "high",
      modelName: ctx.config.model.model,
      sessionName: ctx.session!.name,
    });
  }
  ctx.updateStatusBar = updateStatusBar;

  const tui = createSageTUI(createTUIHandlers(ctx), {
    modes: () => getAllModeNames(),
    sessions: () => SessionManager.list().map((s) => s.name),
  });
  ctx.tui = tui;

  if (session.messages.length > 0) {
    tui.restoreMessages(session.messages);
  }

  updateStatusBar();

  wireAgentEvents(agent, ctx, tui, sessionManager, updateStatusBar);
  registerShutdown(agent, sessionManager, tui);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
