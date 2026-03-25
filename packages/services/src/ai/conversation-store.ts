import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AIMessage, ConversationInfo } from '@terminalmind/api';

export interface StoredConversation {
  readonly id: string;
  readonly title: string;
  readonly messages: readonly AIMessage[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

function titleFromMessages(messages: readonly AIMessage[]): string {
  const user = messages.find((m) => m.role === 'user');
  if (!user) {
    return 'New conversation';
  }
  const t = user.content.trim().replace(/\s+/g, ' ');
  if (t.length === 0) {
    return 'New conversation';
  }
  return t.length <= 50 ? t : `${t.slice(0, 50)}…`;
}

export class ConversationStore extends EventEmitter {
  private readonly dir: string;

  constructor(baseDir?: string) {
    super();
    const root = baseDir ?? join(homedir(), '.terminalmind');
    this.dir = join(root, 'ai', 'conversations');
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private pathFor(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  private readFile(id: string): StoredConversation | null {
    const p = this.pathFor(id);
    if (!existsSync(p)) {
      return null;
    }
    try {
      const raw = readFileSync(p, 'utf-8');
      const j = JSON.parse(raw) as StoredConversation;
      if (typeof j.id !== 'string' || !Array.isArray(j.messages)) {
        return null;
      }
      return j;
    } catch {
      return null;
    }
  }

  list(): ConversationInfo[] {
    if (!existsSync(this.dir)) {
      return [];
    }
    const out: ConversationInfo[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const id = name.slice(0, -'.json'.length);
      const doc = this.readFile(id);
      if (!doc) {
        continue;
      }
      out.push({
        id: doc.id,
        title: doc.title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        messageCount: doc.messages.length,
      });
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  get(id: string): StoredConversation | null {
    return this.readFile(id);
  }

  create(): string {
    this.ensureDir();
    const id = randomUUID();
    const now = Date.now();
    const doc: StoredConversation = {
      id,
      title: 'New conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    writeFileSync(this.pathFor(id), JSON.stringify(doc, null, 2), 'utf-8');
    this.emit('change');
    return id;
  }

  save(id: string, messages: readonly AIMessage[]): void {
    this.ensureDir();
    const now = Date.now();
    const prev = this.readFile(id);
    const createdAt = prev?.createdAt ?? now;
    const title = titleFromMessages(messages);
    const doc: StoredConversation = {
      id,
      title,
      messages: [...messages],
      createdAt,
      updatedAt: now,
    };
    writeFileSync(this.pathFor(id), JSON.stringify(doc, null, 2), 'utf-8');
    this.emit('change');
  }

  delete(id: string): void {
    const p = this.pathFor(id);
    if (existsSync(p)) {
      unlinkSync(p);
      this.emit('change');
    }
  }
}
