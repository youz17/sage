import chalk from "chalk";
import {
  TUI,
  ProcessTerminal,
  Container,
  Editor,
  Markdown,
  Text,
  Spacer,
  CombinedAutocompleteProvider,
  Key,
  matchesKey,
} from "@earendil-works/pi-tui";
import type { Component, MarkdownTheme } from "@earendil-works/pi-tui";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

// --- Themes ---

const sageMarkdownTheme: MarkdownTheme = {
  heading: (text: string) => chalk.bold.blue(text),
  link: (text: string) => chalk.underline.cyan(text),
  linkUrl: (text: string) => chalk.dim(text),
  code: (text: string) => chalk.yellow(text),
  codeBlock: (text: string) => chalk.yellow(text),
  codeBlockBorder: (text: string) => chalk.dim(text),
  quote: (text: string) => chalk.italic.dim(text),
  quoteBorder: (text: string) => chalk.dim("│"),
  hr: (text: string) => chalk.dim(text),
  listBullet: (text: string) => chalk.cyan(text),
  bold: (text: string) => chalk.bold(text),
  italic: (text: string) => chalk.italic(text),
  strikethrough: (text: string) => chalk.strikethrough.dim(text),
  underline: (text: string) => chalk.underline(text),
};

// --- Commands ---

interface CommandDef {
  name: string;
  description: string;
  argumentHint?: string;
  getArgumentCompletions?: (text: string) => Promise<Array<{ value: string; label: string; description?: string }>>;
}

function buildCommands(
  modes: () => string[],
  sessions: () => string[],
): CommandDef[] {
  function plainFilter(items: string[], text: string) {
    return items
      .filter(i => i.startsWith(text))
      .map(i => ({ value: i, label: i }));
  }

  return [
    {
      name: "mode",
      description: "Switch communication mode",
      argumentHint: "<mode>",
      getArgumentCompletions: async (text) => plainFilter(modes(), text),
    },
    { name: "session-new", description: "Start a new session" },
    { name: "session-list", description: "List saved sessions" },
    {
      name: "session-resume",
      description: "Resume a session",
      argumentHint: "<name>", // 是否应该是 id，但是补全中id后面增加描述
      getArgumentCompletions: async (text) => plainFilter(sessions(), text),
    },
    {
      name: "session-delete",
      description: "Delete a session",
      argumentHint: "<name>",
      getArgumentCompletions: async (text) => plainFilter(sessions(), text),
    },
    { name: "quit", description: "Exit Sage" },
    { name: "exit", description: "Exit Sage" },
    // TODO: custom skills
  ];
}

// --- Status Bar ---

class SageStatusBar implements Component {
  private _text = "";
  private _cachedWidth = -1;
  private _cachedLines: string[] = [];

  update(mode: string, thinkingLevel: string, modelName: string, sessionName: string): void {
    const parts: string[] = [];
    // 可能 session id 更好。name的话，很多时候描述不清
    if (sessionName) {
      parts.push(chalk.bold(sessionName));
    }
    parts.push(chalk.bold(`Mode: ${mode}`));
    parts.push(`Think: ${thinkingLevel}`);
    parts.push(`Model: ${modelName}`);

    this._text = parts.join(" | ");
    this.invalidate();
  }

  render(width: number): string[] {
    if (this._cachedWidth === width && this._cachedLines.length > 0) {
      return this._cachedLines;
    }

    // TODO: ui log to long, 压缩应该是有选择的，比如 session name 可以压缩，但是 model之类的不用压缩。或者整个省略某项
    const line = this._text.length > width
      ? this._text.slice(0, width - 3) + "..."
      : this._text.padEnd(width);
    this._cachedWidth = width;
    this._cachedLines = [chalk.bgCyan.black(` ${line} `)];
    return this._cachedLines;
  }

  invalidate(): void {
    this._cachedWidth = -1;
    this._cachedLines = [];
  }
}

// --- Message Rendering ---

function getMessageText(msg: AgentMessage): string {
  const content = (msg as { content: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { text?: string } => typeof c === "object" && c !== null && "text" in c)
      .map((c) => c.text || "")
      .join("\n");
  }
  return "";
}

class SageMessages extends Container {
  private _streamingMarkdown: Markdown | null = null;
  private _streamingContent = "";
  private _thinkingContainer: Container | null = null;
  private _currentThinkingBlock: { label: Text; text: Text; fullText: string } | null = null;
  private _thinkingBlocks: { label: Text; text: Text; fullText: string }[] = [];
  private _thinkingExpanded = true;

  resetState(): void {
    this._streamingMarkdown = null;
    this._streamingContent = "";
    this._thinkingContainer = null;
    this._currentThinkingBlock = null;
  }

  clearMessages(): void {
    this.clear();
    this.resetState();
    this._thinkingBlocks = [];
    this._thinkingExpanded = true;
  }

  addSystemMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.dim(text)}`));
  }

  addUserMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.green("You:")} ${text}`));
  }

  startAssistantMessage(): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.blue("Sage:")}`));
    this._thinkingContainer = new Container();
    this.addChild(this._thinkingContainer);
    this._currentThinkingBlock = null;
    this._streamingMarkdown = new Markdown("", 2, 0, sageMarkdownTheme);
    this.addChild(this._streamingMarkdown);
    this._streamingContent = "";
  }

  startThinking(): void {
    if (!this._thinkingContainer) return;
    const block = {
      label: new Text(`  ${chalk.gray.italic("[thinking]")}`),
      text: new Text("", 4, 0),
      fullText: "",
    };
    this._thinkingContainer.addChild(block.label);
    this._thinkingContainer.addChild(block.text);
    this._currentThinkingBlock = block;
    this._thinkingBlocks.push(block);
  }

  endThinking(): void {
    this._currentThinkingBlock = null;
  }

  appendDelta(delta: string): void {
    if (this._streamingMarkdown) {
      this._streamingContent += delta;
      this._streamingMarkdown.setText(this._streamingContent);
    }
  }

  appendThinking(delta: string): void {
    if (!this._currentThinkingBlock) return;
    this._currentThinkingBlock.fullText += delta;
    if (this._thinkingExpanded) {
      this._currentThinkingBlock.text.setText(chalk.gray.italic(this._currentThinkingBlock.fullText));
    }
  }

  finishAssistantMessage(): void {
    this._streamingMarkdown = null;
    this._streamingContent = "";
    this._thinkingContainer = null;
    this._currentThinkingBlock = null;
  }

  addToolCall(name: string, _callId: string): void {
    this.addChild(new Text(`  ${chalk.dim("[tool]")} ${chalk.cyan(name)}`));
  }

  toggleThinking(): void {
    this._thinkingExpanded = !this._thinkingExpanded;
    for (const block of this._thinkingBlocks) {
      if (this._thinkingExpanded) {
        block.text.setText(chalk.gray.italic(block.fullText));
      } else {
        block.text.setText("");
      }
    }
  }

  addAssistantMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.blue("Sage:")}`));
    const md = new Markdown(text, 2, 0, sageMarkdownTheme);
    this.addChild(md);
  }

  restoreMessages(messages: AgentMessage[]): void {
    this.clearMessages();
    for (const msg of messages) {
      if (msg.role === "user") {
        const text = getMessageText(msg);
        this.addUserMessage(text);
      } else if (msg.role === "assistant") {
        const text = getMessageText(msg);
        this.addAssistantMessage(text);
      } else if (msg.role === "toolResult") {
        const label = (msg as { isError?: boolean; toolName?: string }).isError
          ? `[tool error: ${(msg as { toolName: string }).toolName}]`
          : `[tool: ${(msg as { toolName: string }).toolName}]`;
        this.addSystemMessage(label);
      }
    }
  }

  addErrorMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.red("[error]")} ${chalk.red(text)}`));
  }
}

// --- TUI Factory ---

export interface SageTUI {
  tui: TUI;
  shutdown: () => void;
  onStreamDelta: (delta: string) => void;
  onThinkingStart: () => void;
  onThinkingDelta: (delta: string) => void;
  onThinkingEnd: () => void;
  onToolCallStart: (name: string, args: Record<string, unknown>, callId: string) => void;
  onToolCallEnd: (callId: string) => void;
  updateStatus: (props: { mode: string; thinkingLevel: string; modelName: string; sessionName: string }) => void;
  addSystemMessage: (text: string) => void;
  clearMessages: () => void;
  restoreMessages: (messages: AgentMessage[]) => void;
  addErrorMessage: (text: string) => void;
  toggleThinking: () => void;
}

export interface SageTUIHandlers {
  onInput: (text: string) => void;
  onQuit: () => void;
  onModeChange: (mode: string) => void;
  onSessionNew: (name?: string) => void;
  onSessionList: () => void;
  onSessionResume: (name: string) => void;
  onSessionDelete: (name: string) => void;
  onSkill: (name: string, userText?: string) => void;
  onSessionRename: (name: string) => void;
}

export function createSageTUI(handlers: SageTUIHandlers, completions: {
  modes: () => string[];
  sessions: () => string[];
}): SageTUI {
  const commands = buildCommands(completions.modes, completions.sessions);

  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const messages = new SageMessages();
  tui.addChild(messages);
  
  tui.addChild(new Spacer(1));

  const statusBar = new SageStatusBar();
  tui.addChild(statusBar);

  const editor = new Editor(tui, {
    borderColor: (s: string) => chalk.cyan(s),
    selectList: {
      selectedPrefix: (s: string) => chalk.cyan(`> ${s}`),
      selectedText: (s: string) => chalk.bold(s),
      description: (s: string) => chalk.dim(s),
      scrollInfo: (s: string) => chalk.dim(s),
      noMatch: (s: string) => chalk.red(s),
    },
  });

  const autocomplete = new CombinedAutocompleteProvider(commands as any, process.cwd());
  editor.setAutocompleteProvider(autocomplete);

  editor.onSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("/")) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1).join(" ");

      switch (cmd) {
        case "quit":
        case "exit":
          handlers.onQuit();
          return;
        case "mode":
          handlers.onModeChange(args);
          return;
        case "session-new":
          handlers.onSessionNew(args || undefined);
          return;
        case "session-list":
          handlers.onSessionList();
          return;
        case "session-resume":
          handlers.onSessionResume(args);
          return;
        case "session-delete":
          handlers.onSessionDelete(args);
          return;
        case "session-rename":
          handlers.onSessionRename(args);
          return;
      }
    }

    messages.addUserMessage(trimmed);
    messages.startAssistantMessage();
    handlers.onInput(trimmed);
  };

  tui.addChild(editor);
  tui.setFocus(editor);

  const toggleThinking = () => {
    messages.toggleThinking();
    tui.requestRender();
  };

  tui.addInputListener((data: string) => {
    if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
      handlers.onQuit();
      tui.stop();
      process.exit(0);
    }
    if (matchesKey(data, Key.ctrl("t"))) {
      toggleThinking();
      return { consume: true };
    }
    return undefined;
  });

  tui.start();

  return {
    tui,
    shutdown() {
      tui.stop();
    },
    onStreamDelta(delta: string) {
      messages.appendDelta(delta);
      tui.requestRender();
    },
    onThinkingStart() {
      messages.startThinking();
      tui.requestRender();
    },
    onThinkingDelta(delta: string) {
      messages.appendThinking(delta);
      tui.requestRender();
    },
    onThinkingEnd() {
      messages.endThinking();
      tui.requestRender();
    },
    onToolCallStart(name: string, _args: Record<string, unknown>, callId: string) {
      messages.addToolCall(name, callId);
      tui.requestRender();
    },
    onToolCallEnd(_callId: string) {},
    updateStatus(props: { mode: string; thinkingLevel: string; modelName: string; sessionName: string }) {
      statusBar.update(props.mode, props.thinkingLevel, props.modelName, props.sessionName);
    },
    addSystemMessage(text: string) {
      messages.addSystemMessage(text);
      tui.requestRender();
    },
    clearMessages() {
      messages.clearMessages();
      tui.requestRender();
    },
    restoreMessages(msgs: AgentMessage[]) {
      messages.restoreMessages(msgs);
      tui.requestRender();
    },
    toggleThinking,
    addErrorMessage(text: string) {
      messages.addErrorMessage(text);
      tui.requestRender();
    },
  };
}
