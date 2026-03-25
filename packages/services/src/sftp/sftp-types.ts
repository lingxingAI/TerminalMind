import type { Event } from '@terminalmind/core';

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

export interface FileEntry {
  readonly filename: string;
  readonly longname: string;
  readonly attrs: FileStat;
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

export interface ISFTPChannel {
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
  close(): void;
}

export interface TransferTask {
  readonly id: string;
  readonly sshSessionId: string;
  readonly direction: 'upload' | 'download';
  readonly localPath: string;
  readonly remotePath: string;
  readonly status: 'queued' | 'transferring' | 'completed' | 'failed';
  readonly progress: number;
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly error?: string;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export interface ITransferQueue {
  enqueue(task: {
    readonly sshSessionId: string;
    readonly direction: 'upload' | 'download';
    readonly localPath: string;
    readonly remotePath: string;
  }): string;
  cancel(taskId: string): void;
  retry(taskId: string): void;
  listTasks(): readonly TransferTask[];
  clearCompleted(): void;
  readonly onTaskUpdate: Event<TransferTask>;
}
