import { Completer, type CompletionProvider } from "./completer.js";
import { getAllModeNames, isValidMode } from "../core/modes.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const CLEAR_LINE = "\x1b[2K\r";

export interface InputResult {
  type: "message" | "mode_switch" | "session_command" | "quit";
  text?: string;
  mode?: string;
  skills?: string[];
  sessionArgs?: string[];
}

export class InputEditor {
  private lines: string[] = [""];
  private cursorRow = 0;
  private cursorCol = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private tempInput = "";
  private completer: Completer;
  private currentMode: string;
  private resolve: ((result: InputResult) => void) | null = null;
  private active = false;

  constructor(mode: string, completionProvider: CompletionProvider) {
    this.currentMode = mode;
    this.completer = new Completer(completionProvider);
  }

  get mode(): string {
    return this.currentMode;
  }

  setMode(mode: string): void {
    this.currentMode = mode;
  }

  prompt(): Promise<InputResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.lines = [""];
      this.cursorRow = 0;
      this.cursorCol = 0;
      this.historyIndex = -1;
      this.active = true;
      this.renderPrompt();

      if (!process.stdin.isRaw) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", (data) => this.handleKeypress(data));
      }
    });
  }

  deactivate(): void {
    this.active = false;
  }

  private handleKeypress(data: Buffer): void {
    if (!this.active) return;

    const seq = data.toString();

    // Ctrl+C or Ctrl+D
    if (seq === "\x03" || seq === "\x04") {
      this.completer.close();
      this.emit({ type: "quit" });
      return;
    }

    // Escape
    if (seq === "\x1b") {
      if (this.completer.isOpen) {
        this.completer.close();
        this.renderPrompt();
        return;
      }
      this.lines = [""];
      this.cursorRow = 0;
      this.cursorCol = 0;
      this.renderPrompt();
      return;
    }

    // Tab
    if (seq === "\t") {
      if (this.completer.isOpen) {
        const accepted = this.completer.accept();
        if (accepted) {
          this.applyCompletion(accepted);
        }
        this.renderPrompt();
        return;
      }
      // Cycle mode when no menu is open and input is empty
      if (this.getFullText().trim() === "") {
        const modes = getAllModeNames();
        const idx = modes.indexOf(this.currentMode);
        this.currentMode = modes[(idx + 1) % modes.length];
        this.renderPrompt();
      }
      return;
    }

    // Enter
    if (seq === "\r" || seq === "\n") {
      if (this.completer.isOpen) {
        const accepted = this.completer.accept();
        if (accepted) {
          this.applyCompletion(accepted);
        }
        this.renderPrompt();
        return;
      }
      this.submit();
      return;
    }

    // Shift+Enter
    if (seq === "\x1b[13;2u" || seq === "\x1bOM") {
      this.insertNewline();
      this.renderPrompt();
      return;
    }

    // Backspace
    if (seq === "\x7f" || seq === "\b") {
      if (this.cursorCol > 0) {
        this.lines[this.cursorRow] =
          this.lines[this.cursorRow].slice(0, this.cursorCol - 1) +
          this.lines[this.cursorRow].slice(this.cursorCol);
        this.cursorCol--;
      } else if (this.cursorRow > 0) {
        const prevLine = this.lines[this.cursorRow - 1];
        this.lines[this.cursorRow - 1] += this.lines[this.cursorRow];
        this.lines.splice(this.cursorRow, 1);
        this.cursorRow--;
        this.cursorCol = prevLine.length;
      }
      this.updateCompleter();
      this.renderPrompt();
      return;
    }

    // Arrow keys
    if (seq === "\x1b[A") {
      if (this.completer.isOpen) { this.completer.moveUp(); return; }
      this.historyUp();
      this.renderPrompt();
      return;
    }
    if (seq === "\x1b[B") {
      if (this.completer.isOpen) { this.completer.moveDown(); return; }
      this.historyDown();
      this.renderPrompt();
      return;
    }
    if (seq === "\x1b[C") {
      if (this.cursorCol < this.lines[this.cursorRow].length) {
        this.cursorCol++;
        this.renderPrompt();
      }
      return;
    }
    if (seq === "\x1b[D") {
      if (this.cursorCol > 0) {
        this.cursorCol--;
        this.renderPrompt();
      }
      return;
    }

    // Printable or multi-byte UTF-8
    if ((seq.length === 1 && seq.charCodeAt(0) >= 32) ||
        (seq.length > 1 && !seq.startsWith("\x1b"))) {
      this.insertChar(seq);
      this.renderPrompt();
      return;
    }
  }

  private applyCompletion(accepted: string): void {
    const currentText = this.lines[0];
    // If completing a subcommand like "/mode deep", replace from the right part
    const parts = currentText.split(/\s+/);
    if (parts.length >= 2 && (parts[0] === "/mode" || parts[0] === "/session")) {
      this.lines[0] = parts[0] + " " + accepted + " ";
    } else {
      this.lines[0] = accepted + " ";
    }
    this.cursorRow = 0;
    this.cursorCol = this.lines[0].length;
  }

  private insertChar(ch: string): void {
    this.lines[this.cursorRow] =
      this.lines[this.cursorRow].slice(0, this.cursorCol) +
      ch +
      this.lines[this.cursorRow].slice(this.cursorCol);
    this.cursorCol += ch.length;
    this.updateCompleter();
  }

  private insertNewline(): void {
    const rest = this.lines[this.cursorRow].slice(this.cursorCol);
    this.lines[this.cursorRow] = this.lines[this.cursorRow].slice(0, this.cursorCol);
    this.cursorRow++;
    this.lines.splice(this.cursorRow, 0, rest);
    this.cursorCol = 0;
  }

  private updateCompleter(): void {
    const currentLine = this.lines[0];
    if (currentLine.startsWith("/") && this.cursorRow === 0) {
      if (!this.completer.isOpen) {
        this.completer.open(currentLine);
      } else {
        this.completer.update(currentLine);
      }
    } else if (this.completer.isOpen) {
      this.completer.close();
    }
  }

  private historyUp(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.tempInput = this.getFullText();
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }
    this.setFromHistory(this.history[this.historyIndex]);
  }

  private historyDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.setFromHistory(this.history[this.historyIndex]);
    } else {
      this.historyIndex = -1;
      this.setFromHistory(this.tempInput);
    }
  }

  private setFromHistory(text: string): void {
    this.lines = text.split("\n");
    if (this.lines.length === 0) this.lines = [""];
    this.cursorRow = this.lines.length - 1;
    this.cursorCol = this.lines[this.cursorRow].length;
  }

  private getFullText(): string {
    return this.lines.join("\n");
  }

  private submit(): void {
    const text = this.getFullText().trim();
    if (!text) {
      this.renderPrompt();
      return;
    }

    this.completer.close();
    this.history.push(text);
    process.stdout.write("\n");

    if (text === "/quit" || text === "/exit") {
      this.emit({ type: "quit" });
      return;
    }

    // /mode <name>
    const modeMatch = text.match(/^\/mode\s+(\S+)$/);
    if (modeMatch) {
      const newMode = modeMatch[1];
      if (isValidMode(newMode)) {
        this.currentMode = newMode;
        this.emit({ type: "mode_switch", mode: newMode });
      }
      return;
    }

    // /session <subcommand> [args]
    const sessionMatch = text.match(/^\/session\s+(.+)$/);
    if (sessionMatch) {
      const args = sessionMatch[1].trim().split(/\s+/);
      this.emit({ type: "session_command", sessionArgs: args });
      return;
    }

    // Parse skills
    const skills: string[] = [];
    const cleanText = text.replace(/\/(\w+)/g, (_, name: string) => {
      if (!["mode", "session", "quit", "exit"].includes(name)) {
        skills.push(name);
      }
      return "";
    }).trim();

    this.emit({
      type: "message",
      text: cleanText || text,
      skills,
    });
  }

  private emit(result: InputResult): void {
    this.active = false;
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r(result);
    }
  }

  renderPrompt(): void {
    const promptPrefix = `  ${DIM}[${CYAN}${this.currentMode}${RESET}${DIM}]${RESET} ${BOLD}>${RESET} `;

    if (this.lines.length === 1) {
      process.stdout.write(`${CLEAR_LINE}${promptPrefix}${this.lines[0]}`);
      const backCount = this.lines[0].length - this.cursorCol;
      if (backCount > 0) {
        process.stdout.write(`\x1b[${backCount}D`);
      }
    } else {
      process.stdout.write(CLEAR_LINE);
      for (let i = 0; i < this.lines.length; i++) {
        if (i === 0) {
          process.stdout.write(`${promptPrefix}${this.lines[i]}`);
        } else {
          process.stdout.write(`\n${CLEAR_LINE}       ${this.lines[i]}`);
        }
      }
      const linesBelow = this.lines.length - 1 - this.cursorRow;
      if (linesBelow > 0) {
        process.stdout.write(`\x1b[${linesBelow}A`);
      }
      const linePrefix = this.cursorRow === 0 ? promptPrefix.replace(/\x1b\[[^m]*m/g, "").length : 7;
      process.stdout.write(`\r\x1b[${linePrefix + this.cursorCol}C`);
    }
  }
}
