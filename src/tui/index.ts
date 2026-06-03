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
      argumentHint: "<name>",
      getArgumentCompletions: async (text) => plainFilter(sessions(), text),
    },
    {
      name: "session-delete",
      description: "Delete a session",
      argumentHint: "<name>",
      getArgumentCompletions: async (text) => plainFilter(sessions(), text),
    },
    { name: "reflect", description: "Activate reflect skill" },
    { name: "challenge", description: "Activate challenge skill" },
    { name: "goal", description: "Activate goal skill" },
    { name: "quit", description: "Exit Sage" },
    { name: "exit", description: "Exit Sage" },
  ];
}

// --- Status Bar ---

class SageStatusBar implements Component {
  private _text = "";
  private _cachedWidth = -1;
  private _cachedLines: string[] = [];

  update(mode: string, thinkingLevel: string, modelName: string, skills: string[]): void {
    const parts: string[] = [];
    parts.push(chalk.bold(`Mode: ${mode}`));
    parts.push(`Think: ${thinkingLevel}`);
    parts.push(`Model: ${modelName}`);
    if (skills.length > 0) {
      parts.push(`Skills: ${skills.join(", ")}`);
    }
    this._text = parts.join(" | ");
    this.invalidate();
  }

  render(width: number): string[] {
    if (this._cachedWidth === width && this._cachedLines.length > 0) {
      return this._cachedLines;
    }
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

class SageMessages extends Container {
  private _streamingMarkdown: Markdown | null = null;
  private _streamingContent = "";
  private _thinkingLabel: Text | null = null;
  private _thinkingContent = "";

  addUserMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.green("You:")} ${text}`));
  }

  startAssistantMessage(): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.blue("Sage:")}`));
    this._streamingMarkdown = new Markdown("", 2, 0, sageMarkdownTheme);
    this.addChild(this._streamingMarkdown);
    this._streamingContent = "";
    this._thinkingContent = "";
    this._thinkingLabel = null;
  }

  appendDelta(delta: string): void {
    if (this._streamingMarkdown) {
      this._streamingContent += delta;
      this._streamingMarkdown.setText(this._streamingContent);
    }
  }

  appendThinking(delta: string): void {
    if (!this._thinkingLabel) {
      this._thinkingLabel = new Text(`  ${chalk.gray.italic("[thinking]")}`);
      this.addChild(this._thinkingLabel);
    }
    this._thinkingContent += delta;
  }

  finishAssistantMessage(): void {
    this._streamingMarkdown = null;
    this._streamingContent = "";
    if (this._thinkingLabel) {
      this._thinkingLabel = null;
      this._thinkingContent = "";
    }
  }

  addToolCall(name: string, _callId: string): void {
    this.addChild(new Text(`  ${chalk.dim("[tool]")} ${chalk.cyan(name)}`));
  }
}

// --- TUI Factory ---

export interface SageTUI {
  tui: TUI;
  shutdown: () => void;
  onStreamDelta: (delta: string) => void;
  onThinkingDelta: (delta: string) => void;
  onToolCallStart: (name: string, args: Record<string, unknown>, callId: string) => void;
  onToolCallEnd: (callId: string) => void;
  updateStatus: (props: { mode: string; thinkingLevel: string; modelName: string; skills: string[] }) => void;
}

export interface SageTUIHandlers {
  onInput: (text: string) => void;
  onQuit: () => void;
  onModeChange: (mode: string) => void;
  onSessionNew: (name?: string) => void;
  onSessionList: () => void;
  onSessionResume: (name: string) => void;
  onSessionDelete: (name: string) => void;
  onSkillActivate: (skill: string) => void;
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
        case "reflect":
        case "challenge":
        case "goal":
          handlers.onSkillActivate(cmd);
          return;
      }
    }

    messages.addUserMessage(trimmed);
    messages.startAssistantMessage();
    handlers.onInput(trimmed);
  };

  tui.addChild(new Spacer(1));
  tui.addChild(editor);
  tui.setFocus(editor);

  tui.addInputListener((data: string) => {
    if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
      handlers.onQuit();
      tui.stop();
      process.exit(0);
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
    },
    onThinkingDelta(delta: string) {
      messages.appendThinking(delta);
    },
    onToolCallStart(name: string, _args: Record<string, unknown>, callId: string) {
      messages.addToolCall(name, callId);
    },
    onToolCallEnd(_callId: string) {},
    updateStatus(props: { mode: string; thinkingLevel: string; modelName: string; skills: string[] }) {
      statusBar.update(props.mode, props.thinkingLevel, props.modelName, props.skills);
    },
  };
}
