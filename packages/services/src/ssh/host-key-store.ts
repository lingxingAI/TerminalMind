import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export interface HostKeyEntry {
  readonly host: string;
  readonly port: number;
  readonly algorithm: string;
  readonly fingerprint: string;
  readonly addedAt: number;
}

export interface IHostKeyStore {
  lookup(host: string, port: number): Promise<HostKeyEntry | undefined>;
  save(entry: Readonly<HostKeyEntry>): Promise<void>;
  remove(host: string, port: number): Promise<void>;
}

function formatHostPort(host: string, port: number): string {
  if (host.includes(':')) {
    return `[${host}]:${port}`;
  }
  return `${host}:${port}`;
}

function parseHostPort(s: string): { readonly host: string; readonly port: number } | undefined {
  if (s.startsWith('[')) {
    const close = s.indexOf(']');
    if (close === -1) return undefined;
    const host = s.slice(1, close);
    const rest = s.slice(close + 1);
    if (!rest.startsWith(':')) return undefined;
    const port = Number(rest.slice(1));
    if (!Number.isFinite(port)) return undefined;
    return { host, port };
  }
  const idx = s.lastIndexOf(':');
  if (idx <= 0) return undefined;
  const port = Number(s.slice(idx + 1));
  if (!Number.isFinite(port)) return undefined;
  return { host: s.slice(0, idx), port };
}

function parseLine(line: string): HostKeyEntry | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 4) return undefined;

  const addedAt = Number(tokens[tokens.length - 1]!);
  const fingerprint = tokens[tokens.length - 2]!;
  const algorithm = tokens[tokens.length - 3]!;
  const hostPortRaw = tokens.slice(0, tokens.length - 3).join(' ');
  const hp = parseHostPort(hostPortRaw);
  if (!hp || !Number.isFinite(addedAt)) return undefined;

  return {
    host: hp.host,
    port: hp.port,
    algorithm,
    fingerprint,
    addedAt,
  };
}

function serializeEntry(entry: Readonly<HostKeyEntry>): string {
  return `${formatHostPort(entry.host, entry.port)} ${entry.algorithm} ${entry.fingerprint} ${entry.addedAt}`;
}

export class HostKeyStore implements IHostKeyStore {
  private readonly filePath: string;

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(homedir(), '.terminalmind');
    this.filePath = join(dir, 'known_hosts');
  }

  private readAll(): HostKeyEntry[] {
    try {
      if (!existsSync(this.filePath)) return [];
      const text = readFileSync(this.filePath, 'utf-8');
      const out: HostKeyEntry[] = [];
      for (const line of text.split(/\r?\n/)) {
        const e = parseLine(line);
        if (e) out.push(e);
      }
      return out;
    } catch {
      return [];
    }
  }

  private writeAll(entries: readonly HostKeyEntry[]): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const body = entries.map((e) => serializeEntry(e)).join('\n');
    const nl = body.length > 0 ? `${body}\n` : '';
    writeFileSync(this.filePath, nl, 'utf-8');
  }

  async lookup(host: string, port: number): Promise<HostKeyEntry | undefined> {
    return this.readAll().find((e) => e.host === host && e.port === port);
  }

  async save(entry: Readonly<HostKeyEntry>): Promise<void> {
    const entries = this.readAll().filter((e) => !(e.host === entry.host && e.port === entry.port));
    entries.push(entry);
    this.writeAll(entries);
  }

  async remove(host: string, port: number): Promise<void> {
    const entries = this.readAll().filter((e) => !(e.host === host && e.port === port));
    this.writeAll(entries);
  }
}
