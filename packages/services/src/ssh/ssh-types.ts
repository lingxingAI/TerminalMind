import type { ISFTPChannel } from '../sftp/sftp-types';
import type { TerminalSession } from '../terminal/terminal-service';

export type SFTPChannel = ISFTPChannel;

export type SSHAuthMethod =
  | Readonly<{ readonly type: 'password'; readonly password: string }>
  | Readonly<{ readonly type: 'publicKey'; readonly privateKeyPath: string; readonly passphrase?: string }>
  | Readonly<{ readonly type: 'agent' }>;

export interface SSHConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SSHAuthMethod;
  readonly jumpHosts?: readonly SSHConnectionConfig[];
  readonly keepAliveInterval?: number;
  readonly keepaliveCountMax?: number;
  readonly readyTimeout?: number;
}

export interface SSHSession {
  readonly id: string;
  readonly config: Readonly<SSHConnectionConfig>;
  readonly status: 'connecting' | 'connected' | 'disconnected' | 'error';
  readonly connectedAt?: number;
  readonly error?: string;

  shell(): Promise<TerminalSession>;
  exec(command: string): Promise<ExecResult>;
  forwardPort(options: Readonly<PortForwardOptions>): Promise<PortForward>;
  sftp(): Promise<SFTPChannel>;
  disconnect(): Promise<void>;
}

export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PortForwardOptions {
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
}

export interface PortForward {
  readonly id: string;
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
  close(): Promise<void>;
}

export interface ISSHService {
  connect(config: Readonly<SSHConnectionConfig>): Promise<SSHSession>;
  disconnect(sessionId: string): Promise<void>;
  getSession(id: string): SSHSession | undefined;
  listSessions(): readonly SSHSession[];
}
