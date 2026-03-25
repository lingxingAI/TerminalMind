import type { EventType, EventPayloadMap } from '@terminalmind/core';

export interface TerminalCreateOptions {
  readonly shell?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cols?: number;
  readonly rows?: number;
  readonly title?: string;
}

export interface TerminalSessionInfo {
  readonly id: string;
  readonly title: string;
  readonly pid: number;
  readonly shellPath: string;
  readonly status: 'running' | 'exited';
  readonly exitCode: number | undefined;
  readonly createdAt: number;
}

export interface ShellInfo {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly args: readonly string[];
  readonly platform: 'win32' | 'darwin' | 'linux';
  readonly isDefault: boolean;
}

export interface CommandInfo {
  readonly id: string;
  readonly title: string;
  readonly category: string;
}

export type SSHAuthMethod =
  | Readonly<{ readonly type: 'password'; readonly password: string }>
  | Readonly<{ readonly type: 'publicKey'; readonly privateKeyPath: string; readonly passphrase?: string }>
  | Readonly<{ readonly type: 'agent' }>;

export type SSHConnectOptions = {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SSHAuthMethod;
  readonly jumpHosts?: readonly SSHConnectOptions[];
  readonly keepAlive?: boolean;
  readonly readyTimeout?: number;
};

export interface SSHSessionInfo {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly status: 'connecting' | 'connected' | 'disconnected' | 'error';
  readonly connectedAt: number | undefined;
  readonly error: string | undefined;
}

export interface ExecResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PortForwardOptions {
  readonly sessionId: string;
  readonly localHost: string;
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
}

export interface PortForwardInfo {
  readonly id: string;
  readonly sessionId: string;
  readonly localHost: string;
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
}

export interface SFTPFileStat {
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly size: number;
  readonly atime: number;
  readonly mtime: number;
}

export interface SFTPFileEntry {
  readonly filename: string;
  readonly longname?: string;
  readonly attrs: Readonly<SFTPFileStat>;
}

export interface SFTPTransferOptions {
  readonly sessionId: string;
  readonly localPath: string;
  readonly remotePath: string;
}

export interface SFTPTransferResult {
  readonly transferId: string;
  readonly success: boolean;
  readonly error?: string;
}

export interface SFTPTransferProgress {
  readonly transferId: string;
  readonly filename: string;
  readonly direction: 'upload' | 'download';
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly percentage: number;
}

export interface ConnectionProfileTimestamps {
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'local';
  readonly group?: string;
  readonly tags: readonly string[];
  readonly sshConfig: Readonly<SSHConnectOptions>;
  readonly terminalConfig?: Readonly<Partial<TerminalCreateOptions>>;
  readonly timestamps: Readonly<ConnectionProfileTimestamps>;
}

export interface ConnectionStoreChangeEvent {
  readonly type: 'added' | 'updated' | 'removed';
  readonly profileId: string;
}

export interface HostKeyPromptPayload {
  readonly host: string;
  readonly port: number;
  readonly fingerprint: string;
  readonly isChanged: boolean;
}

export type SSHStatusChangePayload =
  | EventPayloadMap['ssh.connecting']
  | EventPayloadMap['ssh.connected']
  | EventPayloadMap['ssh.disconnected']
  | EventPayloadMap['ssh.error'];

export interface PtyDataPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface PtyInputPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface EventBroadcastPayload<T extends EventType = EventType> {
  readonly type: T;
  readonly payload: EventPayloadMap[T];
}

export interface PreloadAPI {
  terminal: {
    create(options: Readonly<TerminalCreateOptions>): Promise<TerminalSessionInfo>;
    destroy(sessionId: string): Promise<void>;
    list(): Promise<readonly TerminalSessionInfo[]>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    getSession(sessionId: string): Promise<TerminalSessionInfo | null>;
    sendInput(sessionId: string, data: string): void;
    onData(sessionId: string, callback: (data: string) => void): () => void;
  };
  shell: {
    discover(): Promise<readonly ShellInfo[]>;
    getDefault(): Promise<ShellInfo>;
  };
  commands: {
    execute<T = unknown>(id: string, args?: unknown): Promise<T>;
    list(): Promise<readonly CommandInfo[]>;
  };
  config: {
    get<T>(key: string, defaultValue: T): Promise<T>;
    set(key: string, value: unknown): Promise<void>;
  };
  ssh: {
    connect(options: Readonly<SSHConnectOptions>): Promise<SSHSessionInfo>;
    disconnect(sessionId: string): Promise<void>;
    listSessions(): Promise<readonly SSHSessionInfo[]>;
    getSession(sessionId: string): Promise<SSHSessionInfo | null>;
    exec(sessionId: string, command: string): Promise<ExecResult>;
    forwardPort(options: Readonly<PortForwardOptions>): Promise<PortForwardInfo>;
    closeForward(sessionId: string, forwardId: string): Promise<void>;
    listForwards(sessionId: string): Promise<readonly PortForwardInfo[]>;
    hostKeyVerify(request: Readonly<{ readonly sessionId: string; readonly verified: boolean }>): Promise<void>;
    hostKeyAccept(request: Readonly<{ readonly sessionId: string }>): Promise<void>;
    onStatusChange(callback: (payload: Readonly<SSHStatusChangePayload>) => void): () => void;
    onHostKeyPrompt(callback: (payload: Readonly<HostKeyPromptPayload>) => void): () => void;
    onPasswordPrompt(callback: (payload: Readonly<{ readonly sessionId: string }>) => void): () => void;
  };
  sftp: {
    list(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<readonly SFTPFileEntry[]>;
    stat(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<SFTPFileStat>;
    mkdir(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<void>;
    rmdir(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<void>;
    unlink(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<void>;
    rename(
      request: Readonly<{ readonly sessionId: string; readonly fromPath: string; readonly toPath: string }>
    ): Promise<void>;
    upload(options: Readonly<SFTPTransferOptions>): Promise<SFTPTransferResult>;
    download(options: Readonly<SFTPTransferOptions>): Promise<SFTPTransferResult>;
    cancelTransfer(transferId: string): Promise<void>;
    retryTransfer(transferId: string): Promise<SFTPTransferResult>;
    listTransfers(): Promise<readonly SFTPTransferProgress[]>;
    clearCompleted(): Promise<void>;
    onTransferProgress(callback: (payload: Readonly<SFTPTransferProgress>) => void): () => void;
    onTransferComplete(callback: (payload: Readonly<SFTPTransferResult>) => void): () => void;
  };
  connections: {
    list(): Promise<readonly ConnectionProfile[]>;
    get(profileId: string): Promise<ConnectionProfile | null>;
    save(profile: Readonly<ConnectionProfile>): Promise<void>;
    remove(profileId: string): Promise<void>;
    importData(data: string): Promise<void>;
    exportData(): Promise<string>;
    onChanged(callback: (payload: Readonly<ConnectionStoreChangeEvent>) => void): () => void;
  };
  events: {
    onEvent<T extends EventType>(
      type: T,
      callback: (payload: EventPayloadMap[T]) => void
    ): () => void;
  };
}

declare global {
  interface Window {
    readonly api: PreloadAPI;
  }
}
