import { constants } from 'fs';
import { basename } from 'path';
import type { Attributes, FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2';
import { EventEmitter } from '@terminalmind/core';
import type { Event } from '@terminalmind/core';
import type {
  FileEntry,
  FileStat,
  ISFTPChannel,
  TransferOptions,
  TransferProgress,
  TransferResult,
} from './sftp-types';

function isStats(attrs: Stats | Attributes): attrs is Stats {
  return typeof (attrs as Stats).isDirectory === 'function';
}

export function toFileStat(attrs: Readonly<Stats | Attributes>): FileStat {
  if (isStats(attrs)) {
    return {
      size: attrs.size,
      mode: attrs.mode,
      uid: attrs.uid,
      gid: attrs.gid,
      atime: attrs.atime,
      mtime: attrs.mtime,
      isDirectory: attrs.isDirectory(),
      isFile: attrs.isFile(),
      isSymbolicLink: attrs.isSymbolicLink(),
    };
  }
  const mode = attrs.mode;
  return {
    size: attrs.size,
    mode: attrs.mode,
    uid: attrs.uid,
    gid: attrs.gid,
    atime: attrs.atime,
    mtime: attrs.mtime,
    isDirectory: (mode & constants.S_IFMT) === constants.S_IFDIR,
    isFile: (mode & constants.S_IFMT) === constants.S_IFREG,
    isSymbolicLink: (mode & constants.S_IFMT) === constants.S_IFLNK,
  };
}

export class SFTPChannel implements ISFTPChannel {
  private readonly progressEmitter = new EventEmitter<TransferProgress>();
  private closed = false;

  readonly onProgress: Event<TransferProgress> = this.progressEmitter.event;

  constructor(
    readonly sessionId: string,
    private readonly sftp: SFTPWrapper,
  ) {}

  async list(remotePath: string): Promise<readonly FileEntry[]> {
    this.assertOpen();
    const list = await new Promise<FileEntryWithStats[]>((resolve, reject) => {
      this.sftp.readdir(remotePath, (err, entries) => {
        if (err) reject(err);
        else resolve(entries ?? []);
      });
    });
    return list.map(
      (e): FileEntry => ({
        filename: e.filename,
        longname: e.longname,
        attrs: toFileStat(e.attrs),
      }),
    );
  }

  async stat(remotePath: string): Promise<FileStat> {
    this.assertOpen();
    const stats = await new Promise<Stats>((resolve, reject) => {
      this.sftp.stat(remotePath, (err, st) => {
        if (err) reject(err);
        else resolve(st);
      });
    });
    return toFileStat(stats);
  }

  async mkdir(remotePath: string): Promise<void> {
    this.assertOpen();
    await new Promise<void>((resolve, reject) => {
      this.sftp.mkdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async rmdir(remotePath: string): Promise<void> {
    this.assertOpen();
    await new Promise<void>((resolve, reject) => {
      this.sftp.rmdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async unlink(remotePath: string): Promise<void> {
    this.assertOpen();
    await new Promise<void>((resolve, reject) => {
      this.sftp.unlink(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.assertOpen();
    await new Promise<void>((resolve, reject) => {
      this.sftp.rename(oldPath, newPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async upload(
    localPath: string,
    remotePath: string,
    options?: Readonly<TransferOptions>,
  ): Promise<TransferResult> {
    this.assertOpen();
    const transferId = crypto.randomUUID();
    const filename = basename(localPath);
    const started = performance.now();
    const ssh2Opts: import('ssh2').TransferOptions = {
      step: (total, _nb, fsize) => {
        this.progressEmitter.fire({
          transferId,
          filename,
          direction: 'upload',
          bytesTransferred: total,
          totalBytes: fsize,
          percentage: fsize > 0 ? (total / fsize) * 100 : 0,
        });
      },
    };
    if (options?.concurrency !== undefined) {
      ssh2Opts.concurrency = options.concurrency;
    }
    if (options?.chunkSize !== undefined) {
      ssh2Opts.chunkSize = options.chunkSize;
    }
    await new Promise<void>((resolve, reject) => {
      this.sftp.fastPut(localPath, remotePath, ssh2Opts, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const durationMs = Math.round(performance.now() - started);
    const stats = await new Promise<Stats>((resolve, reject) => {
      this.sftp.stat(remotePath, (err, st) => {
        if (err) reject(err);
        else resolve(st);
      });
    });
    return {
      success: true,
      bytesTransferred: stats.size,
      durationMs,
    };
  }

  async download(
    remotePath: string,
    localPath: string,
    options?: Readonly<TransferOptions>,
  ): Promise<TransferResult> {
    this.assertOpen();
    const transferId = crypto.randomUUID();
    const filename = basename(remotePath);
    const started = performance.now();
    const ssh2Opts: import('ssh2').TransferOptions = {
      step: (total, _nb, fsize) => {
        this.progressEmitter.fire({
          transferId,
          filename,
          direction: 'download',
          bytesTransferred: total,
          totalBytes: fsize,
          percentage: fsize > 0 ? (total / fsize) * 100 : 0,
        });
      },
    };
    if (options?.concurrency !== undefined) {
      ssh2Opts.concurrency = options.concurrency;
    }
    if (options?.chunkSize !== undefined) {
      ssh2Opts.chunkSize = options.chunkSize;
    }
    await new Promise<void>((resolve, reject) => {
      this.sftp.fastGet(remotePath, localPath, ssh2Opts, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const durationMs = Math.round(performance.now() - started);
    const stats = await new Promise<Stats>((resolve, reject) => {
      this.sftp.stat(remotePath, (err, st) => {
        if (err) reject(err);
        else resolve(st);
      });
    });
    return {
      success: true,
      bytesTransferred: stats.size,
      durationMs,
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.progressEmitter.dispose();
    this.sftp.end();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('SFTP channel is closed');
    }
  }
}
