import { getModel } from "@earendil-works/pi-ai";
import { loadConfig } from "./config/loader.js";
import { createSageAgent } from "./agent/index.js";
import { SessionManager, Session } from "./session/manager.js";
import { getAllModeNames, isValidMode } from "./core/modes.js";
import { Logger } from "./log/logger.js";
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

function extractAssistantText(messages: any[]): string {
  // TODO: 直接反向for循环效率更高
  const last = [...messages].reverse().find((m: any) => m.role === "assistant");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return JSON.stringify(last.content).slice(0, 1000);
}

function findSessionByName(name: string) : null | Session {
  // TODO: 这种函数应该是 Session Manager 中
  const sessions = SessionManager.list();
  const match = sessions.find(s =>
    s.id === name ||
    s.id.startsWith(name) ||
    (s.title && s.title.toLowerCase().includes(name.toLowerCase()))
  );
  if (match) {
    return SessionManager.resume(match.id);
  }
  return null;
}

async function main() {
  const { createSageTUI } = await import("./tui/index.js");

  const config = loadConfig();
  setApiKeyEnv(config.model.provider, config.model.apiKey);
  const model = getModel(config.model.provider as any, config.model.model);

  // Session setup
  const sessionManager = new SessionManager();
  const args = process.argv.slice(2);

  // TODO: parse arg 应该独立一点
  const newIdx = args.indexOf("--new");
  const resumeIdx = args.indexOf("--resume");
  const isNew = newIdx !== -1;
  const isResume = resumeIdx !== -1;
  const newName = isNew ? args[newIdx + 1] : undefined;
  const resumeName = isResume ? args[resumeIdx + 1] : undefined;

  let session = sessionManager.getCurrent();

  if (isResume) {
    if (resumeName && !resumeName.startsWith("--")) {
      const resumed = findSessionByName(resumeName);
      if (resumed) {
        const s = sessionManager.newSession(resumed.mode);
        s.id = resumed.id;
        s.title = resumed.title;
        s.messages = resumed.messages;
        session = s;
      }
    } else {
      const sessions = SessionManager.list();
      if (sessions.length > 0) {
        const resumed = SessionManager.resume(sessions[0].id);
        if (resumed) {
          const s = sessionManager.newSession(resumed.mode);
          s.id = resumed.id;
          s.title = resumed.title;
          s.messages = resumed.messages;
          session = s;
        }
      }
    }
  } else if (!isNew) {
    const sessions = SessionManager.list();
    if (sessions.length > 0) {
      const resumed = SessionManager.resume(sessions[0].id);
      if (resumed) {
        const s = sessionManager.newSession(resumed.mode);
        s.id = resumed.id;
        s.title = resumed.title;
        s.messages = resumed.messages;
        session = s;
      }
    }
  }

  if (!session) {
    session = sessionManager.newSession(config.defaultMode);
    if (isNew && newName && !newName.startsWith("--")) {
      session.title = newName;
    }
  }

  // Logger setup
  const logger = new Logger(session.id);
  logger.log("session:init", { id: session.id, mode: session.mode, model: config.model.model });

  // Agent setup
  let activeSkills: string[] = []; // TODO: 需要active skill的概念吗？虽然可以考虑在 mode 上抽一层，但暂时应该不需要
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
      logger.log("agent:prompt", { text });
      agent.prompt(text).catch((err: Error) => {
        logger.log("error", { message: err.message, stack: err.stack });
        console.error("Agent error:", err);
      });
    },

    onQuit() {
      sessionManager.updateMessages(agent.state.messages as any[]);
      sessionManager.saveCurrent();
      logger.close();
    },

    onModeChange(mode: string) {
      if (!isValidMode(mode)) {
        tui.addSystemMessage(`Unknown mode: "${mode}". Available: ${getAllModeNames().join(", ")}`);
        return;
      }
      currentMode = mode;
      logger.log("mode:change", { mode });
      sessionManager.setMode(mode);
      agent.state.systemPrompt = buildSystemPrompt(mode, activeSkills);
      updateStatusBar();
    },

    onSessionNew(name?: string) {
      sessionManager.saveCurrent();
      const s = sessionManager.newSession(currentMode);
      if (name) s.title = name;
      session = s;
      logger.log("session:new", { id: s.id, title: name || "(auto)" });
      tui.clearMessages();
      agent.state.messages = [] as any;
      updateStatusBar();
    },

    onSessionList() {
      const sessions = SessionManager.list();
      if (sessions.length === 0) {
        tui.addSystemMessage("No saved sessions.");
        return;
      }
      const lines = sessions.map((s, i) => {
        const displayTitle = s.title || s.id;
        return `  ${i + 1}. ${displayTitle} (${s.mode}) — ${s.updatedAt.slice(0, 10)}`;
      });
      tui.addSystemMessage(`Sessions (${sessions.length}):\n${lines.join("\n")}`);
    },

    onSessionResume(name: string) {
      const resumed = findSessionByName(name);
      if (!resumed) {
        tui.addSystemMessage(`Session "${name}" not found.`);
        return;
      }
      sessionManager.saveCurrent();

      // Clear TUI and show resumed session history
      tui.clearMessages();
      tui.addSystemMessage(`Resumed: ${resumed.title || resumed.id}`);
      tui.addSystemMessage(`Mode: ${resumed.mode} | Messages: ${resumed.messages.length} | ${resumed.createdAt.slice(0, 10)}`);

      // Show partial history (first 6 messages)
      const preview = resumed.messages.slice(0, 6);
      for (const msg of preview) {
        const roleLabel = msg.role === "user" ? "You" : msg.role === "assistant" ? "Sage" : msg.role;
        const rawContent = (msg as any).content;
        const content = typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((c: any) => c.text || c.type || "").filter(Boolean).join(" ").slice(0, 80)
            : "";
        tui.addSystemMessage(`[${roleLabel}] ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`);
      }
      if (resumed.messages.length > 6) {
        tui.addSystemMessage(`... and ${resumed.messages.length - 6} more messages`);
      }

      const s = sessionManager.newSession(resumed.mode);
      s.id = resumed.id;
      s.title = resumed.title;
      s.messages = resumed.messages;
      session = s;
      logger.log("session:resume", { id: s.id, title: s.title || s.id });
      agent.state.messages = [...resumed.messages] as any;
      currentMode = resumed.mode;
      agent.state.systemPrompt = buildSystemPrompt(resumed.mode, activeSkills);
      updateStatusBar();
    },

    onSessionDelete(name: string) {
      const sessions = SessionManager.list();
      const match = sessions.find(s =>
        s.id === name || s.id.startsWith(name) ||
        (s.title && s.title.toLowerCase().includes(name.toLowerCase()))
      );
      const id = match?.id ?? name;
      if (SessionManager.delete(id)) {
        tui.addSystemMessage(`Session "${name}" deleted.`);
      } else {
        tui.addSystemMessage(`Session "${name}" not found.`);
      }
    },

    onSkillActivate(skill: string) {
      if (activeSkills.includes(skill)) {
        activeSkills = activeSkills.filter((s) => s !== skill);
        logger.log("skill:deactivate", { skill });
      } else {
        activeSkills.push(skill);
        logger.log("skill:activate", { skill });
      }
      agent.state.systemPrompt = buildSystemPrompt(currentMode, activeSkills);
      updateStatusBar();
    },
  }, {
    modes: () => getAllModeNames(),
    sessions: () => SessionManager.list().map(s => s.title || s.id),
  });

  function updateStatusBar() {
    tui.updateStatus({
      mode: currentMode,
      thinkingLevel: "high",
      modelName: config.model.model,
      skills: activeSkills,
      sessionName: session?.title,
    });
  }
  updateStatusBar();

  // Wire agent events to TUI streaming
  agent.subscribe(async (event) => {
    if (event.type === "message_update") {
      const ae = (event as any).assistantMessageEvent;
      if (ae?.type === "text_delta") {
        tui.onStreamDelta(ae.delta);
      }
      if (ae?.type === "thinking_delta") {
        tui.onThinkingDelta(ae.delta);
        // Don't log every thinking delta — too chatty. Log only on agent_end.
      }
    }
    if (event.type === "tool_execution_start") {
      tui.onToolCallStart(
        (event as any).toolName,
        (event as any).args ?? {},
        (event as any).toolCallId,
      );
      logger.log("tool:start", { name: (event as any).toolName, args: (event as any).args });
    }
    if (event.type === "tool_execution_end") {
      logger.log("tool:end", { name: (event as any).toolName, callId: (event as any).toolCallId });
    }
    if (event.type === "agent_end") {
      const fullResp = extractAssistantText(agent.state.messages);
      logger.log("agent:response", { text: fullResp });

      const lastAssistant = [...agent.state.messages].reverse().find(
        (m: any) => m.role === "assistant",
      ) as any;
      if (lastAssistant?.stopReason === "error" || lastAssistant?.stopReason === "aborted") {
        const errMsg = lastAssistant?.errorMessage || `Agent ${lastAssistant.stopReason}`;
        logger.log("agent:error", { stopReason: lastAssistant.stopReason, error: errMsg });
        tui.addErrorMessage(errMsg);
      } else if (!fullResp && agent.state.messages.length > 0) {
        logger.log("agent:empty_response", { messageCount: agent.state.messages.length });
      }

      sessionManager.updateMessages(agent.state.messages as any[]);
      sessionManager.saveCurrent();
      updateStatusBar();
      logger.log("session:save", { id: session!.id });
    }
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    sessionManager.updateMessages(agent.state.messages as any[]);
    sessionManager.saveCurrent();
    logger.close();
    tui.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
