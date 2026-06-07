import * as fs from "node:fs";
import * as path from "node:path";
import { getSubdir } from "../config/loader.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface Session {
  id: string;
  name: string;
  description: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

function sessionsDir(): string {
  const dir = getSubdir("sessions");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

function generateId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${dateStr}-${rand}`;
}

function generateDescription(messages: AgentMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "";
  const content = (firstUser as { content: unknown }).content;
  if (typeof content === "string") return content.slice(0, 50);
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { text?: string } => typeof c === "object" && c !== null && "text" in c)
      .map((c) => c.text || "")
      .join(" ")
      .slice(0, 50);
  }
  return "";
}

export class SessionManager {
  private current: Session | null = null;

  newSession(mode: string = "default"): Session {
    const id = generateId();
    const session: Session = {
      id,
      name: id,
      description: "",
      mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.current = session;
    return session;
  }

  getCurrent(): Session | null {
    return this.current;
  }

  saveCurrent(): void {
    if (!this.current || this.current.messages.length === 0) return;
    this.current.updatedAt = new Date().toISOString();

    if (!this.current.description) {
      this.current.description = generateDescription(this.current.messages);
    }

    fs.writeFileSync(sessionPath(this.current.id), JSON.stringify(this.current, null, 2), "utf-8");
  }

  static list(): Session[] {
    const dir = sessionsDir();
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
          return { ...data, messages: [] } as Session;
        } catch {
          return null;
        }
      })
      .filter((s): s is Session => s !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  // TODO: 命名有点奇怪，实际是获取session信息，没有执行 resume 操作
  static resume(sessionId: string): Session | null {
    const filePath = sessionPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        ...data,
        name: data.name ?? data.title ?? data.id,
        description: data.description ?? "",
      } as Session;
    } catch {
      return null;
    }
  }

  static delete(sessionId: string): boolean {
    const filePath = sessionPath(sessionId);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  updateMessages(messages: AgentMessage[]): void {
    if (this.current) {
      this.current.messages = messages;
    }
  }

  setName(name: string): boolean {
    if (!this.current) return false;
    const sessions = SessionManager.list();
    const conflict = sessions.find((s) => s.name === name && s.id !== this.current!.id);
    if (conflict) return false;
    this.current.name = name;
    this.current.updatedAt = new Date().toISOString();
    return true;
  }

  setMode(mode: string): void {
    if (this.current) {
      this.current.mode = mode;
    }
  }
}
