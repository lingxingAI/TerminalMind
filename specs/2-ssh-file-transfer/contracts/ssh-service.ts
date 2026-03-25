/**
 * SSHService 接口契约
 * 管理 SSH 连接会话的生命周期
 */

import type { Event } from '@terminalmind/core';
import type { TerminalSession } from '../terminal-service';

// ─── SSH 认证 ──────────────────────────────────────

export type SSHAuthMethod =
  | { readonly type: 'password'; readonly password: string }
  | { readonly type: 'publicKey'; readonly privateKeyPath: string; readonly passphrase?: string }
  | { readonly type: 'agent' };

// ─── SSH 连接配置 ──────────────────────────────────

export interface SSHConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SSHAuthMethod;
  readonly jumpHosts?: readonly SSHConnectionConfig[];
  readonly keepAliveInterval?: number;
  readonly readyTimeout?: number;
}

// ─── SSH 会话 ──────────────────────────────────────

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

// ─── SFTP ─────────────────────────────────────────

export interface SFTPChannel {
  readonly sessionId: string;

  list(remotePath: string): Promise<readonly FileEntry[]>;
  stat(remotePath: string): Promise<FileStat>;
  mkdir(remotePath: string): Promise<void>;
  rmdir(remotePath: string): Promise<void>;
  unlink(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  upload(
    localPath: string,
    remotePath: string,
    options?: Readonly<TransferOptions>,
  ): Promise<TransferResult>;
  download(
    remotePath: string,
    localPath: string,
    options?: Readonly<TransferOptions>,
  ): Promise<TransferResult>;

  readonly onProgress: Event<TransferProgress>;
}

export interface FileEntry {
  readonly filename: string;
  readonly longname: string;
  readonly attrs: FileStat;
}

export interface FileStat {
  readonly size: number;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly atime: number;
  readonly mtime: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly isSymbolicLink: boolean;
}

export interface TransferOptions {
  readonly concurrency?: number;
  readonly chunkSize?: number;
}

export interface TransferResult {
  readonly success: boolean;
  readonly bytesTransferred: number;
  readonly durationMs: number;
}

export interface TransferProgress {
  readonly transferId: string;
  readonly filename: string;
  readonly direction: 'upload' | 'download';
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly percentage: number;
}

// ─── Service 接口 ─────────────────────────────────

export interface ISSHService {
  connect(config: Readonly<SSHConnectionConfig>): Promise<SSHSession>;
  disconnect(sessionId: string): Promise<void>;
  getSession(id: string): SSHSession | undefined;
  listSessions(): readonly SSHSession[];
}
