import { marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal() as MarkedExtension);

const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CLEAR_LINE = "\x1b[2K\r";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Renderer {
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;

  renderWelcome(mode: string, tools: string[]): void {
    console.log(`\n${BOLD}  Better Chat Agent${RESET}`);
    console.log(`${DIM}  Tab: switch mode | /command: skills | Shift+Enter: newline | Ctrl+C: exit${RESET}`);
    console.log(`${DIM}  Tools: ${tools.join(", ") || "none"}${RESET}`);
    console.log(`${CYAN}  Mode: ${mode}${RESET}\n`);
  }

  renderUserMessage(text: string): void {
    const lines = text.split("\n");
    process.stdout.write(`\n${BOLD}  You:${RESET} ${lines[0]}\n`);
    for (let i = 1; i < lines.length; i++) {
      process.stdout.write(`       ${lines[i]}\n`);
    }
  }

  renderAgentHeader(mode: string): void {
    process.stdout.write(`\n${BOLD}  Agent${RESET} ${DIM}[${mode}]${RESET}${BOLD}:${RESET}\n`);
  }

  renderTextChunk(text: string): void {
    process.stdout.write(text);
  }

  renderTextDone(): void {
    // Streaming already printed the raw text. Just ensure a clean newline.
    process.stdout.write("\n");
  }

  renderToolCall(name: string, args: Record<string, unknown>): void {
    const argsStr = JSON.stringify(args);
    const truncated = argsStr.length > 100 ? argsStr.slice(0, 100) + "..." : argsStr;
    process.stdout.write(`  ${YELLOW}▶ ${name}${RESET}${DIM}(${truncated})${RESET}\n`);
  }

  renderToolResult(name: string, result: string): void {
    const preview = result.slice(0, 150).replace(/\n/g, " ");
    process.stdout.write(`  ${GREEN}✓ ${name}${RESET} ${DIM}${preview}...${RESET}\n\n`);
  }

  renderError(message: string): void {
    process.stdout.write(`\n  ${RED}Error: ${message}${RESET}\n`);
  }

  renderModeSwitch(mode: string): void {
    process.stdout.write(`  ${CYAN}Mode → ${mode}${RESET}\n`);
  }

  startSpinner(): void {
    this.stopSpinner();
    this.spinnerFrame = 0;
    this.spinnerInterval = setInterval(() => {
      const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
      process.stdout.write(`${CLEAR_LINE}  ${CYAN}${frame} thinking...${RESET}`);
      this.spinnerFrame++;
    }, 80);
  }

  stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
      process.stdout.write(CLEAR_LINE);
    }
  }

  renderDone(): void {
    process.stdout.write("\n");
  }
}

export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text) as string;
    return rendered
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
  } catch {
    return `  ${text}`;
  }
}
