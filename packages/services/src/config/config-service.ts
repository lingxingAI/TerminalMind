import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Disposable } from '@terminalmind/core';

export interface IConfigService {
  get<T>(key: string, defaultValue: T): T;
  set(key: string, value: unknown): Promise<void>;
  onChange(key: string, handler: (value: unknown) => void): Disposable;
}

export class ConfigService implements IConfigService {
  private data: Record<string, unknown> = {};
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();
  private readonly configPath: string;

  constructor(configDir?: string) {
    const dir = configDir ?? join(homedir(), '.terminalmind');
    this.configPath = join(dir, 'config.json');
    this.load();
  }

  get<T>(key: string, defaultValue: T): T {
    const value = this.data[key];
    return value !== undefined ? (value as T) : defaultValue;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    this.save();
    const handlers = this.listeners.get(key);
    if (handlers) {
      for (const h of handlers) h(value);
    }
  }

  onChange(key: string, handler: (value: unknown) => void): Disposable {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(handler);
    return {
      dispose: () => {
        set!.delete(handler);
        if (set!.size === 0) this.listeners.delete(key);
      },
    };
  }

  private load(): void {
    try {
      if (existsSync(this.configPath)) {
        this.data = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      }
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
