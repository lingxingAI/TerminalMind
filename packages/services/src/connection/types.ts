/**
 * Service-layer connection types (shape-compatible with IPC, defined here for layer separation).
 */

export type SSHAuthMethod =
  | Readonly<{ readonly type: 'password'; readonly password: string }>
  | Readonly<{ readonly type: 'publicKey'; readonly privateKeyPath: string; readonly passphrase?: string }>
  | Readonly<{ readonly type: 'agent' }>;

export type SSHConnectOptions = Readonly<{
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SSHAuthMethod;
  readonly jumpHosts?: readonly SSHConnectOptions[];
  readonly keepAlive?: boolean;
  readonly readyTimeout?: number;
}>;

/** Terminal options persisted with a connection profile (mirrors TerminalCreateOptions). */
export type ConnectionTerminalConfig = Readonly<{
  readonly shell?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cols?: number;
  readonly rows?: number;
  readonly title?: string;
}>;

export interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'local';
  readonly group?: string;
  readonly tags?: readonly string[];
  readonly sshConfig?: Readonly<SSHConnectOptions>;
  readonly terminalConfig?: Readonly<ConnectionTerminalConfig>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConnectionStoreChangeEvent {
  readonly type: 'added' | 'updated' | 'removed';
  readonly profileId: string;
}
