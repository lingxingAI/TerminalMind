import { EventEmitter } from '@terminalmind/core';
import type { Event } from '@terminalmind/core';
import type { ISFTPChannel, ITransferQueue, TransferTask } from './sftp-types';

type MutableTask = {
  id: string;
  sshSessionId: string;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  status: TransferTask['status'];
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
};

function snapshot(task: Readonly<MutableTask>): TransferTask {
  const base: TransferTask = {
    id: task.id,
    sshSessionId: task.sshSessionId,
    direction: task.direction,
    localPath: task.localPath,
    remotePath: task.remotePath,
    status: task.status,
    progress: task.progress,
    bytesTransferred: task.bytesTransferred,
    totalBytes: task.totalBytes,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
  if (task.error !== undefined) {
    return { ...base, error: task.error };
  }
  return base;
}

export class TransferQueue implements ITransferQueue {
  private readonly tasks = new Map<string, MutableTask>();
  private readonly pendingQueue: string[] = [];
  private readonly runningTaskIds = new Set<string>();
  private readonly busySessions = new Set<string>();
  private readonly taskEmitter = new EventEmitter<TransferTask>();

  readonly onTaskUpdate: Event<TransferTask> = this.taskEmitter.event;

  constructor(
    private readonly getSFTPChannel: (sshSessionId: string) => ISFTPChannel | undefined,
    private readonly maxConcurrency: number = 3,
  ) {
    if (maxConcurrency < 1) {
      throw new Error('maxConcurrency must be at least 1');
    }
  }

  enqueue(task: {
    readonly sshSessionId: string;
    readonly direction: 'upload' | 'download';
    readonly localPath: string;
    readonly remotePath: string;
  }): string {
    const id = crypto.randomUUID();
    const record: MutableTask = {
      id,
      sshSessionId: task.sshSessionId,
      direction: task.direction,
      localPath: task.localPath,
      remotePath: task.remotePath,
      status: 'queued',
      progress: 0,
      bytesTransferred: 0,
      totalBytes: 0,
    };
    this.tasks.set(id, record);
    this.pendingQueue.push(id);
    this.taskEmitter.fire(snapshot(record));
    this.pump();
    return id;
  }

  cancel(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'queued') {
      return;
    }
    const idx = this.pendingQueue.indexOf(taskId);
    if (idx !== -1) {
      this.pendingQueue.splice(idx, 1);
    }
    this.tasks.delete(taskId);
  }

  retry(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'failed') {
      return;
    }
    task.status = 'queued';
    task.progress = 0;
    task.bytesTransferred = 0;
    task.totalBytes = 0;
    delete task.error;
    task.startedAt = undefined;
    task.completedAt = undefined;
    this.pendingQueue.push(taskId);
    this.taskEmitter.fire(snapshot(task));
    this.pump();
  }

  listTasks(): readonly TransferTask[] {
    return Array.from(this.tasks.values(), (t) => snapshot(t));
  }

  clearCompleted(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed') {
        this.tasks.delete(id);
      }
    }
  }

  private emitTask(task: Readonly<MutableTask>): void {
    this.taskEmitter.fire(snapshot(task));
  }

  private dequeueRunnable(): string | undefined {
    const idx = this.pendingQueue.findIndex((id) => {
      const t = this.tasks.get(id);
      return t !== undefined && !this.busySessions.has(t.sshSessionId);
    });
    if (idx === -1) {
      return undefined;
    }
    const [id] = this.pendingQueue.splice(idx, 1);
    return id;
  }

  private pump(): void {
    while (this.runningTaskIds.size < this.maxConcurrency) {
      const id = this.dequeueRunnable();
      if (id === undefined) {
        break;
      }
      void this.runTask(id);
    }
  }

  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'queued') {
      return;
    }

    const channel = this.getSFTPChannel(task.sshSessionId);
    if (!channel) {
      task.status = 'failed';
      task.error = 'SFTP channel not available';
      task.completedAt = Date.now();
      this.emitTask(task);
      this.pump();
      return;
    }

    this.busySessions.add(task.sshSessionId);
    this.runningTaskIds.add(taskId);
    task.status = 'transferring';
    task.startedAt = Date.now();
    this.emitTask(task);

    const progressSub = channel.onProgress((p) => {
      if (p.direction !== task.direction) {
        return;
      }
      task.bytesTransferred = p.bytesTransferred;
      task.totalBytes = p.totalBytes;
      task.progress = p.percentage;
      this.emitTask(task);
    });

    try {
      const result =
        task.direction === 'upload'
          ? await channel.upload(task.localPath, task.remotePath)
          : await channel.download(task.remotePath, task.localPath);
      task.status = 'completed';
      task.progress = 100;
      task.bytesTransferred = result.bytesTransferred;
      task.totalBytes = result.bytesTransferred;
      task.completedAt = Date.now();
      this.emitTask(task);
    } catch (e) {
      task.status = 'failed';
      task.error = e instanceof Error ? e.message : String(e);
      task.completedAt = Date.now();
      this.emitTask(task);
    } finally {
      progressSub.dispose();
      this.busySessions.delete(task.sshSessionId);
      this.runningTaskIds.delete(taskId);
      this.pump();
    }
  }
}
