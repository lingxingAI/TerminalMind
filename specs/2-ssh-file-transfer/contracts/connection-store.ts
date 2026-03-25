/**
 * ConnectionStore 接口契约
 * 连接配置的 CRUD 持久化存储
 */

import type { Event } from '@terminalmind/core';
import type { SSHConnectionConfig } from './ssh-service';
import type { TerminalCreateOptions } from '@terminalmind/api';

// ─── ConnectionProfile ────────────────────────────

export interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'local';
  readonly group?: string;
  readonly tags?: readonly string[];
  readonly sshConfig?: Readonly<SSHConnectionConfig>;
  readonly terminalConfig?: Readonly<TerminalCreateOptions>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ─── 变更事件 ─────────────────────────────────────

export interface ConnectionStoreChangeEvent {
  readonly type: 'added' | 'updated' | 'removed';
  readonly profileId: string;
}

// ─── Store 接口 ───────────────────────────────────

export interface IConnectionStore {
  list(): Promise<readonly ConnectionProfile[]>;
  get(id: string): Promise<ConnectionProfile | undefined>;
  save(profile: Readonly<ConnectionProfile>): Promise<void>;
  remove(id: string): Promise<void>;
  import(source: string, format: 'json'): Promise<readonly ConnectionProfile[]>;
  export(ids: readonly string[], format: 'json'): Promise<string>;

  readonly onChange: Event<ConnectionStoreChangeEvent>;
}

// ─── HostKeyStore ─────────────────────────────────

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

// ─── SecretStore ──────────────────────────────────

export interface ISecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
