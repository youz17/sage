import * as fs from "node:fs";
import * as path from "node:path";
import { getSageDir } from "../config/loader.js";

function logsDir(): string {
  const dir = path.join(getSageDir(), "logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sanitize(obj: unknown): unknown {
  if (typeof obj === "string") {
    // Redact api keys (sk-... patterns, tvly-... etc)
    return obj.replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
      .replace(/tvly-[a-zA-Z0-9]+/g, "tvly-***");
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k.toLowerCase().includes("apikey") || k.toLowerCase().includes("api_key")) {
        out[k] = "***";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return obj;
}

export class Logger {
  private stream: fs.WriteStream;

  constructor(sessionId: string) {
    const filePath = path.join(logsDir(), `${sessionId}.jsonl`);
    this.stream = fs.createWriteStream(filePath, { flags: "a" });
  }

  log(type: string, detail: unknown = {}): void {
    const entry = {
      ts: new Date().toISOString(),
      type,
      ...(sanitize(detail) as Record<string, unknown>),
    };
    this.stream.write(JSON.stringify(entry) + "\n");
  }

  close(): void {
    this.stream.end();
  }
}
