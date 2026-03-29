import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, hostname, userInfo } from 'os';

const SERVICE_NAME = 'terminalmind';

export interface ISecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

class KeytarSecretStore implements ISecretStore {
  constructor(private readonly keytar: typeof import('keytar')) {}

  async get(key: string): Promise<string | null> {
    const v = await this.keytar.getPassword(SERVICE_NAME, key);
    return v ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.keytar.setPassword(SERVICE_NAME, key, value);
  }

  async delete(key: string): Promise<void> {
    await this.keytar.deletePassword(SERVICE_NAME, key);
  }
}

/** In-memory fallback and test double. */
export class InMemorySecretStore implements ISecretStore {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    const v = this.map.get(key);
    return v === undefined ? null : v;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/**
 * File-based secret store that encrypts values with AES-256-GCM.
 * Derives key from a machine-stable fingerprint so secrets survive restarts.
 * NOT as secure as OS keychain but far better than in-memory-only.
 */
class FileSecretStore implements ISecretStore {
  private readonly filePath: string;
  private readonly encKey: Buffer;
  private cache: Record<string, string>;

  constructor(dataDir: string) {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'secrets.enc');
    this.encKey = FileSecretStore.deriveKey();
    this.cache = this.load();
  }

  private static deriveKey(): Buffer {
    const fingerprint = `${SERVICE_NAME}:${homedir()}:${hostname()}:${userInfo().username}`;
    const salt = createHash('sha256').update(fingerprint).digest().subarray(0, 16);
    return scryptSync(fingerprint, salt, 32);
  }

  private load(): Record<string, string> {
    try {
      if (!existsSync(this.filePath)) return {};
      const raw = readFileSync(this.filePath);
      if (raw.length < 28) return {};
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const enc = raw.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
      return JSON.parse(dec.toString('utf8'));
    } catch {
      return {};
    }
  }

  private persist(): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(this.cache), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    writeFileSync(this.filePath, Buffer.concat([iv, tag, enc]), { mode: 0o600 });
  }

  async get(key: string): Promise<string | null> {
    return this.cache[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.cache[key] = value;
    this.persist();
  }

  async delete(key: string): Promise<void> {
    delete this.cache[key];
    this.persist();
  }
}

/**
 * Prefer OS keychain via keytar (service {@link SERVICE_NAME}).
 * Falls back to {@link FileSecretStore} for persistent encrypted storage on disk.
 * @param dataDir directory for the encrypted secrets file (only used when keytar is unavailable)
 */
export async function createSecretStore(dataDir?: string): Promise<ISecretStore> {
  try {
    const mod = await import('keytar');
    const keytar = mod.default;
    return new KeytarSecretStore(keytar);
  } catch {
    const dir = dataDir ?? join(homedir(), '.terminalmind');
    console.warn(
      `[TerminalMind] keytar unavailable; using encrypted file store at ${dir}/secrets.enc`
    );
    return new FileSecretStore(dir);
  }
}
