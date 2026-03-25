import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { EventEmitter, type Event } from '@terminalmind/core';
import type { ISecretStore } from './secret-store';
import type {
  ConnectionProfile,
  ConnectionStoreChangeEvent,
  SSHAuthMethod,
  SSHConnectOptions,
} from './types';

export interface IConnectionStore {
  list(): Promise<readonly ConnectionProfile[]>;
  get(id: string): Promise<ConnectionProfile | undefined>;
  save(profile: Readonly<ConnectionProfile>): Promise<void>;
  remove(id: string): Promise<void>;
  import(source: string, format: 'json'): Promise<readonly ConnectionProfile[]>;
  export(ids: readonly string[], format: 'json'): Promise<string>;
  readonly onChange: Event<ConnectionStoreChangeEvent>;
}

type SerializedSSHAuth =
  | Readonly<{ readonly type: 'password' }>
  | Readonly<{ readonly type: 'publicKey'; readonly privateKeyPath: string }>
  | Readonly<{ readonly type: 'agent' }>;

type SerializedSSHConnectOptions = Readonly<{
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SerializedSSHAuth;
  readonly jumpHosts?: readonly SerializedSSHConnectOptions[];
  readonly keepAlive?: boolean;
  readonly readyTimeout?: number;
}>;

type SerializedConnectionProfile = Readonly<{
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'local';
  readonly group?: string;
  readonly tags?: readonly string[];
  readonly sshConfig?: SerializedSSHConnectOptions;
  readonly terminalConfig?: ConnectionProfile['terminalConfig'];
  readonly createdAt: number;
  readonly updatedAt: number;
}>;

interface ConnectionsFile {
  readonly version: number;
  readonly profiles: readonly SerializedConnectionProfile[];
}

function secretBase(profileId: string, jumpPath: readonly number[]): string {
  if (jumpPath.length === 0) return `connection:${profileId}`;
  return `connection:${profileId}:jump:${jumpPath.join('.')}`;
}

function passwordKey(profileId: string, jumpPath: readonly number[]): string {
  return `${secretBase(profileId, jumpPath)}:password`;
}

function passphraseKey(profileId: string, jumpPath: readonly number[]): string {
  return `${secretBase(profileId, jumpPath)}:passphrase`;
}

async function persistSshSecrets(
  secrets: ISecretStore,
  profileId: string,
  ssh: Readonly<SSHConnectOptions>,
  jumpPath: readonly number[]
): Promise<void> {
  const auth = ssh.auth;
  if (auth.type === 'password') {
    if (auth.password !== '') {
      await secrets.set(passwordKey(profileId, jumpPath), auth.password);
    } else {
      await secrets.delete(passwordKey(profileId, jumpPath));
    }
    await secrets.delete(passphraseKey(profileId, jumpPath));
  } else {
    await secrets.delete(passwordKey(profileId, jumpPath));
  }

  if (auth.type === 'publicKey') {
    if (auth.passphrase !== undefined && auth.passphrase !== '') {
      await secrets.set(passphraseKey(profileId, jumpPath), auth.passphrase);
    } else {
      await secrets.delete(passphraseKey(profileId, jumpPath));
    }
  } else {
    await secrets.delete(passphraseKey(profileId, jumpPath));
  }

  if (ssh.jumpHosts) {
    let i = 0;
    for (const j of ssh.jumpHosts) {
      await persistSshSecrets(secrets, profileId, j, [...jumpPath, i]);
      i += 1;
    }
  }
}

async function deleteSshSecrets(
  secrets: ISecretStore,
  profileId: string,
  ssh: Readonly<SSHConnectOptions>,
  jumpPath: readonly number[]
): Promise<void> {
  await secrets.delete(passwordKey(profileId, jumpPath));
  await secrets.delete(passphraseKey(profileId, jumpPath));
  if (ssh.jumpHosts) {
    let i = 0;
    for (const j of ssh.jumpHosts) {
      await deleteSshSecrets(secrets, profileId, j, [...jumpPath, i]);
      i += 1;
    }
  }
}

function serializeAuth(auth: Readonly<SSHAuthMethod>): SerializedSSHAuth {
  if (auth.type === 'password') return { type: 'password' };
  if (auth.type === 'publicKey') {
    return { type: 'publicKey', privateKeyPath: auth.privateKeyPath };
  }
  return { type: 'agent' };
}

function serializeSshForDisk(ssh: Readonly<SSHConnectOptions>): SerializedSSHConnectOptions {
  const jumpHosts = ssh.jumpHosts?.map((j) => serializeSshForDisk(j));
  return {
    host: ssh.host,
    port: ssh.port,
    username: ssh.username,
    auth: serializeAuth(ssh.auth),
    ...(jumpHosts !== undefined && jumpHosts.length > 0 ? { jumpHosts } : {}),
    ...(ssh.keepAlive !== undefined ? { keepAlive: ssh.keepAlive } : {}),
    ...(ssh.readyTimeout !== undefined ? { readyTimeout: ssh.readyTimeout } : {}),
  };
}

function serializeProfileForDisk(profile: Readonly<ConnectionProfile>): SerializedConnectionProfile {
  return {
    id: profile.id,
    name: profile.name,
    type: profile.type,
    ...(profile.group !== undefined ? { group: profile.group } : {}),
    ...(profile.tags !== undefined && profile.tags.length > 0 ? { tags: profile.tags } : {}),
    ...(profile.sshConfig !== undefined ? { sshConfig: serializeSshForDisk(profile.sshConfig) } : {}),
    ...(profile.terminalConfig !== undefined ? { terminalConfig: profile.terminalConfig } : {}),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

async function hydrateAuth(
  secrets: ISecretStore,
  profileId: string,
  auth: SerializedSSHAuth,
  jumpPath: readonly number[]
): Promise<SSHAuthMethod> {
  if (auth.type === 'password') {
    const password = (await secrets.get(passwordKey(profileId, jumpPath))) ?? '';
    return { type: 'password', password };
  }
  if (auth.type === 'publicKey') {
    const passphrase = await secrets.get(passphraseKey(profileId, jumpPath));
    return passphrase !== null && passphrase !== ''
      ? { type: 'publicKey', privateKeyPath: auth.privateKeyPath, passphrase }
      : { type: 'publicKey', privateKeyPath: auth.privateKeyPath };
  }
  return { type: 'agent' };
}

async function hydrateSsh(
  secrets: ISecretStore,
  profileId: string,
  ser: SerializedSSHConnectOptions,
  jumpPath: readonly number[]
): Promise<SSHConnectOptions> {
  const auth = await hydrateAuth(secrets, profileId, ser.auth, jumpPath);
  let jumpHosts: readonly SSHConnectOptions[] | undefined;
  if (ser.jumpHosts && ser.jumpHosts.length > 0) {
    jumpHosts = await Promise.all(
      ser.jumpHosts.map((j, i) => hydrateSsh(secrets, profileId, j, [...jumpPath, i]))
    );
  }
  return {
    host: ser.host,
    port: ser.port,
    username: ser.username,
    auth,
    ...(jumpHosts !== undefined && jumpHosts.length > 0 ? { jumpHosts } : {}),
    ...(ser.keepAlive !== undefined ? { keepAlive: ser.keepAlive } : {}),
    ...(ser.readyTimeout !== undefined ? { readyTimeout: ser.readyTimeout } : {}),
  };
}

async function hydrateProfile(
  secrets: ISecretStore,
  ser: SerializedConnectionProfile
): Promise<ConnectionProfile> {
  const sshConfig =
    ser.sshConfig !== undefined && ser.type === 'ssh'
      ? await hydrateSsh(secrets, ser.id, ser.sshConfig, [])
      : undefined;

  return {
    id: ser.id,
    name: ser.name,
    type: ser.type,
    ...(ser.group !== undefined ? { group: ser.group } : {}),
    ...(ser.tags !== undefined && ser.tags.length > 0 ? { tags: ser.tags } : {}),
    ...(sshConfig !== undefined ? { sshConfig } : {}),
    ...(ser.terminalConfig !== undefined ? { terminalConfig: ser.terminalConfig } : {}),
    createdAt: ser.createdAt,
    updatedAt: ser.updatedAt,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function looseSshFromUnknown(sc: Readonly<Record<string, unknown>>): SSHConnectOptions {
  const host = typeof sc.host === 'string' ? sc.host : 'localhost';
  const port = typeof sc.port === 'number' ? sc.port : 22;
  const username = typeof sc.username === 'string' ? sc.username : '';
  const authRaw = sc.auth;
  let auth: SSHAuthMethod;
  if (isRecord(authRaw) && authRaw.type === 'password') {
    const pw = typeof authRaw.password === 'string' ? authRaw.password : '';
    auth = { type: 'password', password: pw };
  } else if (isRecord(authRaw) && authRaw.type === 'publicKey') {
    const pk = typeof authRaw.privateKeyPath === 'string' ? authRaw.privateKeyPath : '';
    const passphrase =
      typeof authRaw.passphrase === 'string' && authRaw.passphrase !== '' ? authRaw.passphrase : undefined;
    auth =
      passphrase !== undefined
        ? { type: 'publicKey', privateKeyPath: pk, passphrase }
        : { type: 'publicKey', privateKeyPath: pk };
  } else if (isRecord(authRaw) && authRaw.type === 'agent') {
    auth = { type: 'agent' };
  } else {
    auth = { type: 'agent' };
  }
  const keepAlive = typeof sc.keepAlive === 'boolean' ? sc.keepAlive : undefined;
  const readyTimeout = typeof sc.readyTimeout === 'number' ? sc.readyTimeout : undefined;
  let jumpHosts: readonly SSHConnectOptions[] | undefined;
  if (Array.isArray(sc.jumpHosts)) {
    const jumps = sc.jumpHosts
      .map((j) => (isRecord(j) ? looseSshFromUnknown(j) : undefined))
      .filter((j): j is SSHConnectOptions => j !== undefined);
    if (jumps.length > 0) jumpHosts = jumps;
  }
  return {
    host,
    port,
    username,
    auth,
    ...(jumpHosts !== undefined && jumpHosts.length > 0 ? { jumpHosts } : {}),
    ...(keepAlive !== undefined ? { keepAlive } : {}),
    ...(readyTimeout !== undefined ? { readyTimeout } : {}),
  };
}

/** Accepts disk-shaped or inline-secret import payloads. */
function looseProfileFromUnknown(raw: unknown, newId: string): ConnectionProfile {
  if (!isRecord(raw)) {
    throw new Error('Invalid profile: expected object');
  }
  const name = typeof raw.name === 'string' ? raw.name : 'Imported';
  const type = raw.type === 'local' || raw.type === 'ssh' ? raw.type : 'ssh';
  const now = Date.now();
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : now;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : now;
  const group = typeof raw.group === 'string' ? raw.group : undefined;
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : undefined;

  let sshConfig: SSHConnectOptions | undefined;
  const sc = raw.sshConfig;
  if (type === 'ssh' && isRecord(sc)) {
    sshConfig = looseSshFromUnknown(sc);
  }

  const terminalConfig = isRecord(raw.terminalConfig)
    ? (raw.terminalConfig as ConnectionProfile['terminalConfig'])
    : undefined;

  return {
    id: newId,
    name,
    type,
    ...(group !== undefined ? { group } : {}),
    ...(tags !== undefined && tags.length > 0 ? { tags } : {}),
    ...(sshConfig !== undefined ? { sshConfig } : {}),
    ...(terminalConfig !== undefined ? { terminalConfig } : {}),
    createdAt,
    updatedAt,
  };
}

function parseConnectionsFile(json: string): ConnectionsFile {
  const data: unknown = JSON.parse(json);
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.profiles)) {
    throw new Error('Invalid connections file: expected { version: 1, profiles: [] }');
  }
  return { version: 1, profiles: data.profiles as readonly SerializedConnectionProfile[] };
}

export class ConnectionStore implements IConnectionStore {
  private readonly secretStore: ISecretStore;
  private readonly filePath: string;
  private readonly profiles = new Map<string, ConnectionProfile>();
  private loaded = false;
  private readonly _onChange = new EventEmitter<ConnectionStoreChangeEvent>();

  readonly onChange: Event<ConnectionStoreChangeEvent> = this._onChange.event;

  constructor(secretStore: ISecretStore, dataDir?: string) {
    this.secretStore = secretStore;
    const dir = dataDir ?? join(homedir(), '.terminalmind');
    this.filePath = join(dir, 'connections.json');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      if (existsSync(this.filePath)) {
        const text = readFileSync(this.filePath, 'utf-8');
        const file = parseConnectionsFile(text);
        for (const ser of file.profiles) {
          const p = await hydrateProfile(this.secretStore, ser);
          this.profiles.set(p.id, p);
        }
      }
    } catch {
      this.profiles.clear();
    }
    this.loaded = true;
  }

  private writeFileFromSerialized(profiles: readonly SerializedConnectionProfile[]): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const payload: ConnectionsFile = { version: 1, profiles };
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private async flushDisk(): Promise<void> {
    const serialized = [...this.profiles.values()].map((p) => serializeProfileForDisk(p));
    this.writeFileFromSerialized(serialized);
  }

  async list(): Promise<readonly ConnectionProfile[]> {
    await this.ensureLoaded();
    return [...this.profiles.values()];
  }

  async get(id: string): Promise<ConnectionProfile | undefined> {
    await this.ensureLoaded();
    return this.profiles.get(id);
  }

  async save(profile: Readonly<ConnectionProfile>): Promise<void> {
    await this.ensureLoaded();
    const now = Date.now();
    const existing = this.profiles.get(profile.id);
    const createdAt = existing?.createdAt ?? profile.createdAt ?? now;
    const updatedAt = now;

    const merged: ConnectionProfile = {
      id: profile.id,
      name: profile.name,
      type: profile.type,
      ...(profile.group !== undefined ? { group: profile.group } : {}),
      ...(profile.tags !== undefined && profile.tags.length > 0 ? { tags: profile.tags } : {}),
      ...(profile.sshConfig !== undefined ? { sshConfig: profile.sshConfig } : {}),
      ...(profile.terminalConfig !== undefined ? { terminalConfig: profile.terminalConfig } : {}),
      createdAt,
      updatedAt,
    };

    if (existing?.sshConfig !== undefined && merged.sshConfig === undefined) {
      await deleteSshSecrets(this.secretStore, merged.id, existing.sshConfig, []);
    }

    if (merged.sshConfig !== undefined) {
      await persistSshSecrets(this.secretStore, merged.id, merged.sshConfig, []);
    }

    const isNew = existing === undefined;
    this.profiles.set(merged.id, merged);
    await this.flushDisk();
    this._onChange.fire({
      type: isNew ? 'added' : 'updated',
      profileId: merged.id,
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureLoaded();
    const p = this.profiles.get(id);
    if (!p) return;
    if (p.sshConfig !== undefined) {
      await deleteSshSecrets(this.secretStore, id, p.sshConfig, []);
    }
    this.profiles.delete(id);
    await this.flushDisk();
    this._onChange.fire({ type: 'removed', profileId: id });
  }

  async import(source: string, format: 'json'): Promise<readonly ConnectionProfile[]> {
    if (format !== 'json') {
      throw new Error(`Unsupported import format: ${format}`);
    }
    await this.ensureLoaded();
    const file = parseConnectionsFile(source);
    const imported: ConnectionProfile[] = [];
    for (const row of file.profiles) {
      const newId = randomUUID();
      const loose = looseProfileFromUnknown(row as unknown, newId);
      await this.save(loose);
      const saved = await this.get(newId);
      if (saved) imported.push(saved);
    }
    return imported;
  }

  async export(ids: readonly string[], format: 'json'): Promise<string> {
    if (format !== 'json') {
      throw new Error(`Unsupported export format: ${format}`);
    }
    await this.ensureLoaded();
    const idSet = new Set(ids);
    const selected = [...this.profiles.values()].filter((p) => idSet.has(p.id));
    const serialized = selected.map((p) => serializeProfileForDisk(p));
    return JSON.stringify({ version: 1, profiles: serialized } satisfies ConnectionsFile, null, 2);
  }

  dispose(): void {
    this._onChange.dispose();
  }
}
