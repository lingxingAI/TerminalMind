import { create } from 'zustand';
import type { SFTPQueueTaskInfo } from '@terminalmind/api';

export interface TransferTaskInfo {
  id: string;
  sshSessionId: string;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  filename: string;
  status: 'queued' | 'transferring' | 'completed' | 'failed';
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  error?: string;
}

function fromQueueInfo(t: SFTPQueueTaskInfo): TransferTaskInfo {
  const base: TransferTaskInfo = {
    id: t.id,
    sshSessionId: t.sshSessionId,
    direction: t.direction,
    localPath: t.localPath,
    remotePath: t.remotePath,
    filename: t.filename,
    status: t.status,
    progress: t.progress,
    bytesTransferred: t.bytesTransferred,
    totalBytes: t.totalBytes,
  };
  if (t.error !== undefined) {
    return { ...base, error: t.error };
  }
  return base;
}

interface TransferState {
  tasks: TransferTaskInfo[];
  addTask(task: TransferTaskInfo): void;
  updateTask(taskId: string, update: Partial<TransferTaskInfo>): void;
  removeTask(taskId: string): void;
  clearCompleted(): void;
  hydrateFromMain(tasks: readonly SFTPQueueTaskInfo[]): void;
}

export const useTransferStore = create<TransferState>((set) => ({
  tasks: [],
  addTask: (task) =>
    set((s) => {
      if (s.tasks.some((t) => t.id === task.id)) {
        return {
          tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
        };
      }
      return { tasks: [...s.tasks, task] };
    }),
  updateTask: (taskId, update) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...update } : t)),
    })),
  removeTask: (taskId) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== taskId),
    })),
  clearCompleted: () =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.status !== 'completed'),
    })),
  hydrateFromMain: (tasks) =>
    set({
      tasks: tasks.map(fromQueueInfo),
    }),
}));
