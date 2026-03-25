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
 * Prefer OS keychain via keytar (service {@link SERVICE_NAME}).
 * Falls back to {@link InMemorySecretStore} with a console warning if keytar cannot load.
 */
export async function createSecretStore(): Promise<ISecretStore> {
  try {
    const mod = await import('keytar');
    const keytar = mod.default;
    return new KeytarSecretStore(keytar);
  } catch {
    console.warn(
      '[TerminalMind] keytar could not be loaded; secrets will be kept in memory only and will not persist securely.'
    );
    return new InMemorySecretStore();
  }
}
