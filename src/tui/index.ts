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

const SLASH_COMMANDS = [
  { name: "mode", description: "Switch communication mode (socratic|direct|discuss|deep|perspectives)" },
  { name: "session", description: "Session management: new|list|resume|delete" },
  { name: "skills", description: "List available skills" },
  { name: "reflect", description: "Activate reflect skill" },
  { name: "challenge", description: "Activate challenge skill" },
  { name: "goal", description: "Activate goal skill" },
  { name: "quit", description: "Exit Sage" },
  { name: "exit", description: "Exit Sage" },
];

// --- Message Rendering ---

class SageMessages extends Container {
  private _streamingMarkdown: Markdown | null = null;
  private _streamingContent = "";

  addUserMessage(text: string): void {
    this.addChild(new Spacer(1));
    this.addChild(new Text(`  ${chalk.bold.green("You:")} ${text}`));
  }

  startAssistantMessage(): Markdown {
    this.addChild(new Spacer(1));
    const header = new Text(`  ${chalk.bold.blue("Sage:")}`);
    this.addChild(header);
    this._streamingMarkdown = new Markdown("", 2, 0, sageMarkdownTheme);
    this.addChild(this._streamingMarkdown);
    this._streamingContent = "";
    return this._streamingMarkdown;
  }

  appendDelta(delta: string): void {
    if (this._streamingMarkdown) {
      this._streamingContent += delta;
      this._streamingMarkdown.setText(this._streamingContent);
    }
  }

  finishAssistantMessage(): void {
    this._streamingMarkdown = null;
    this._streamingContent = "";
  }

  addToolCall(name: string, _callId: string): void {
    const label = new Text(`  ${chalk.dim("[tool]")} ${chalk.cyan(name)}`);
    this.addChild(label);
  }
}

// --- TUI Factory ---

export interface SageTUI {
  tui: TUI;
  shutdown: () => void;
  onStreamDelta: (delta: string) => void;
  onToolCallStart: (name: string, args: Record<string, unknown>, callId: string) => void;
  onToolCallEnd: (callId: string) => void;
}

export interface SageTUIHandlers {
  onInput: (text: string) => void;
  onQuit: () => void;
  onModeChange: (mode: string) => void;
  onSessionCommand: (args: string) => void;
  onSkillActivate: (skill: string) => void;
}

export function createSageTUI(handlers: SageTUIHandlers): SageTUI {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const messages = new SageMessages();
  tui.addChild(messages);

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

  const autocomplete = new CombinedAutocompleteProvider(SLASH_COMMANDS, process.cwd());
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
        case "session":
          handlers.onSessionCommand(args);
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

  const spacer = new Spacer(1);
  tui.addChild(spacer);
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
    onToolCallStart(name: string, _args: Record<string, unknown>, callId: string) {
      messages.addToolCall(name, callId);
    },
    onToolCallEnd(_callId: string) {},
  };
}
