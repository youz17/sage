import * as fs from "node:fs";
import * as path from "node:path";
import { getSageDir } from "../config/loader.js";

let _stream: fs.WriteStream | null = null;

function logsDir(): string {
  const dir = path.join(getSageDir(), "logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sanitize(obj: unknown): unknown {
  if (typeof obj === "string") {
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

function buildFileName(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const pid = process.pid;
  return `sage-${date}-${time}-${pid}.jsonl`;
}

export class Logger {
  static init(): void {
    const filePath = path.join(logsDir(), buildFileName());
    _stream = fs.createWriteStream(filePath, { flags: "a" });
  }

  static close(): void {
    if (_stream) {
      _stream.end();
      _stream = null;
    }
  }

  static log(key: string, data?: Record<string, unknown>): void {
    if (!_stream) return;
    const entry = {
      ts: new Date().toISOString(),
      type: key,
      ...(sanitize(data ?? {}) as Record<string, unknown>),
    };
    _stream.write(JSON.stringify(entry) + "\n");
  }

  static info(key: string, data?: Record<string, unknown>): void {
    Logger.log(`info:${key}`, data);
  }
  static warn(key: string, data?: Record<string, unknown>): void {
    Logger.log(`warn:${key}`, data);
  }
  static error(key: string, data?: Record<string, unknown>): void {
    Logger.log(`error:${key}`, data);
  }
}
