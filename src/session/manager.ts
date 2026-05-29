import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getSubdir } from "../config/loader.js";
import type { Message } from "../types.js";

export interface Session {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

function sessionsDir(): string {
  return getSubdir("sessions");
}

function sessionPath(id: string): string {
  return join(sessionsDir(), `${id}.json`);
}

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${date}-${rand}`;
}

export class SessionManager {
  private current: Session | null = null;

  createSession(mode: string): Session {
    if (this.current) {
      this.save();
    }
    const session: Session = {
      id: generateId(),
      title: "New session",
      mode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.current = session;
    this.save();
    return session;
  }

  getCurrent(): Session | null {
    return this.current;
  }

  getMessages(): Message[] {
    return this.current?.messages ?? [];
  }

  addMessage(msg: Message): void {
    if (!this.current) return;
    this.current.messages.push(msg);
    if (this.current.messages.length === 1 && msg.role === "user") {
      this.current.title = msg.content.slice(0, 30).replace(/\n/g, " ");
    }
    this.current.updatedAt = new Date().toISOString();
    this.save();
  }

  setMode(mode: string): void {
    if (this.current) {
      this.current.mode = mode;
      this.save();
    }
  }

  save(): void {
    if (!this.current) return;
    const filePath = sessionPath(this.current.id);
    writeFileSync(filePath, JSON.stringify(this.current, null, 2), "utf-8");
  }

  list(): Array<{ id: string; title: string; updatedAt: string; messageCount: number }> {
    const dir = sessionsDir();
    if (!existsSync(dir)) return [];

    const sessions: Array<{ id: string; title: string; updatedAt: string; messageCount: number }> = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = JSON.parse(readFileSync(join(dir, file), "utf-8")) as Session;
        sessions.push({
          id: data.id,
          title: data.title,
          updatedAt: data.updatedAt,
          messageCount: data.messages.length,
        });
      } catch {
        // skip corrupt files
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  resume(idOrIndex: string): Session | null {
    const sessions = this.list();
    let target: string | undefined;

    const index = parseInt(idOrIndex, 10);
    if (!isNaN(index) && index >= 1 && index <= sessions.length) {
      target = sessions[index - 1].id;
    } else {
      target = sessions.find((s) => s.id === idOrIndex || s.id.startsWith(idOrIndex))?.id;
    }

    if (!target) return null;

    const filePath = sessionPath(target);
    if (!existsSync(filePath)) return null;

    if (this.current) this.save();

    const data = JSON.parse(readFileSync(filePath, "utf-8")) as Session;
    this.current = data;
    return data;
  }

  resumeLatest(): Session | null {
    const sessions = this.list();
    if (sessions.length === 0) return null;
    return this.resume(sessions[0].id);
  }

  delete(idOrIndex: string): boolean {
    const sessions = this.list();
    let target: string | undefined;

    const index = parseInt(idOrIndex, 10);
    if (!isNaN(index) && index >= 1 && index <= sessions.length) {
      target = sessions[index - 1].id;
    } else {
      target = sessions.find((s) => s.id === idOrIndex)?.id;
    }

    if (!target) return false;

    const filePath = sessionPath(target);
    if (!existsSync(filePath)) return false;

    unlinkSync(filePath);
    if (this.current?.id === target) {
      this.current = null;
    }
    return true;
  }

  getSessionIds(): string[] {
    return this.list().map((s) => `${s.id} (${s.title})`);
  }
}
