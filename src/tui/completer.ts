const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const BG_CYAN = "\x1b[46m";
const BLACK = "\x1b[30m";
const RESET = "\x1b[0m";
const CLEAR_LINE = "\x1b[2K\r";

export interface CompletionItem {
  label: string;
  description: string;
}

export type CompletionProvider = (input: string) => CompletionItem[];

export class Completer {
  private provider: CompletionProvider;
  private filtered: CompletionItem[] = [];
  private selectedIndex = 0;
  private _isOpen = false;
  private menuLinesDrawn = 0;

  constructor(provider: CompletionProvider) {
    this.provider = provider;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(input: string): void {
    this._isOpen = true;
    this.update(input);
  }

  close(): void {
    this.clearMenu();
    this._isOpen = false;
    this.selectedIndex = 0;
    this.filtered = [];
  }

  update(input: string): void {
    this.filtered = this.provider(input);
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
    return selected.label;
  }

  private drawMenu(): void {
    this.clearMenu();
    if (this.filtered.length === 0) {
      this.menuLinesDrawn = 0;
      return;
    }

    const lines: string[] = [];
    const maxItems = Math.min(this.filtered.length, 10);
    for (let i = 0; i < maxItems; i++) {
      const item = this.filtered[i];
      if (i === this.selectedIndex) {
        lines.push(`  ${BG_CYAN}${BLACK} ${item.label.padEnd(20)} ${item.description} ${RESET}`);
      } else {
        lines.push(`  ${CYAN}${item.label.padEnd(20)}${RESET} ${DIM}${item.description}${RESET}`);
      }
    }

    process.stdout.write("\n" + lines.join("\n"));
    this.menuLinesDrawn = lines.length;
    if (this.menuLinesDrawn > 0) {
      process.stdout.write(`\x1b[${this.menuLinesDrawn}A`);
    }
  }

  clearMenu(): void {
    if (this.menuLinesDrawn === 0) return;
    process.stdout.write("\x1b[s");
    for (let i = 0; i < this.menuLinesDrawn; i++) {
      process.stdout.write(`\n${CLEAR_LINE}`);
    }
    process.stdout.write("\x1b[u");
    this.menuLinesDrawn = 0;
  }
}
