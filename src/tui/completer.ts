const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const BG_CYAN = "\x1b[46m";
const BLACK = "\x1b[30m";
const RESET = "\x1b[0m";
const CLEAR_LINE = "\x1b[2K\r";

export interface CompletionItem {
  command: string;
  description: string;
}

export class Completer {
  private items: CompletionItem[] = [];
  private filtered: CompletionItem[] = [];
  private selectedIndex = 0;
  private _isOpen = false;
  private menuLinesDrawn = 0;

  constructor(items: CompletionItem[]) {
    this.items = items;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(filter: string): void {
    this._isOpen = true;
    this.filter(filter);
  }

  close(): void {
    this.clearMenu();
    this._isOpen = false;
    this.selectedIndex = 0;
    this.filtered = [];
  }

  filter(input: string): void {
    const query = input.startsWith("/") ? input.slice(1) : input;
    this.filtered = query
      ? this.items.filter((item) =>
          item.command.slice(1).startsWith(query.toLowerCase()),
        )
      : [...this.items];
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
    this.drawMenu();
  }

  moveUp(): void {
    if (this.filtered.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filtered.length) % this.filtered.length;
    this.drawMenu();
  }

  moveDown(): void {
    if (this.filtered.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filtered.length;
    this.drawMenu();
  }

  accept(): string | null {
    if (this.filtered.length === 0) return null;
    const selected = this.filtered[this.selectedIndex];
    this.close();
    return selected.command;
  }

  private drawMenu(): void {
    this.clearMenu();
    if (this.filtered.length === 0) {
      this.menuLinesDrawn = 0;
      return;
    }

    const lines: string[] = [];
    for (let i = 0; i < this.filtered.length; i++) {
      const item = this.filtered[i];
      if (i === this.selectedIndex) {
        lines.push(`  ${BG_CYAN}${BLACK} ${item.command.padEnd(14)} ${item.description} ${RESET}`);
      } else {
        lines.push(`  ${CYAN}${item.command.padEnd(14)}${RESET} ${DIM}${item.description}${RESET}`);
      }
    }

    process.stdout.write("\n" + lines.join("\n"));
    this.menuLinesDrawn = lines.length;
    // Move cursor back up to the input line
    if (this.menuLinesDrawn > 0) {
      process.stdout.write(`\x1b[${this.menuLinesDrawn}A`);
    }
  }

  clearMenu(): void {
    if (this.menuLinesDrawn === 0) return;
    // Save cursor, move down, clear lines, restore cursor
    process.stdout.write("\x1b[s");
    for (let i = 0; i < this.menuLinesDrawn; i++) {
      process.stdout.write(`\n${CLEAR_LINE}`);
    }
    process.stdout.write("\x1b[u");
    this.menuLinesDrawn = 0;
  }
}
