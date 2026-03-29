import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISFTPChannel } from '../sftp-types';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { TransferQueue } from '../transfer-queue';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function createMockChannel(sessionId: string): ISFTPChannel {
  const upload = vi.fn().mockImplementation(async () => {
    await delay(20);
    return { success: true, bytesTransferred: 100, durationMs: 5 };
  });
  const download = vi.fn().mockImplementation(async () => {
    await delay(20);
    return { success: true, bytesTransferred: 200, durationMs: 5 };
  });
  return {
    sessionId,
    list: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    rmdir: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
    upload,
    download,
    onProgress: () => ({ dispose: vi.fn() }),
    close: vi.fn(),
  };
}

describe('TransferQueue', () => {
  let channels: Map<string, ISFTPChannel>;
  let queue: TransferQueue;

  beforeEach(() => {
    channels = new Map();
    queue = new TransferQueue((id) => channels.get(id), 3);
  });

  it('enqueue adds a task', () => {
    const ch = createMockChannel('s1');
    channels.set('s1', ch);
    const id = queue.enqueue({
      sshSessionId: 's1',
      direction: 'upload',
      localPath: '/l',
      remotePath: '/r',
    });
    const tasks = queue.listTasks();
    expect(tasks.some((t) => t.id === id)).toBe(true);
    expect(tasks.find((t) => t.id === id)?.status).toBe('transferring');
  });

  it('respects concurrent execution limit across sessions', async () => {
    for (let i = 0; i < 5; i++) {
      const sid = `s${i}`;
      channels.set(sid, createMockChannel(sid));
    }
    for (let i = 0; i < 5; i++) {
      queue.enqueue({
        sshSessionId: `s${i}`,
        direction: 'upload',
        localPath: `/l${i}`,
        remotePath: `/r${i}`,
      });
    }
    await delay(5);
    const transferring = queue.listTasks().filter((t) => t.status === 'transferring');
    expect(transferring.length).toBe(3);
    await delay(80);
    expect(queue.listTasks().every((t) => t.status === 'completed')).toBe(true);
  });

  it('cancel removes a queued task', () => {
    const ch = createMockChannel('s1');
    channels.set('s1', ch);
    queue = new TransferQueue((id) => channels.get(id), 1);

    const id1 = queue.enqueue({
      sshSessionId: 's1',
      direction: 'upload',
      localPath: '/l1',
      remotePath: '/r1',
    });
    const id2 = queue.enqueue({
      sshSessionId: 's1',
      direction: 'upload',
      localPath: '/l2',
      remotePath: '/r2',
    });

    const t2 = queue.listTasks().find((t) => t.id === id2);
    expect(t2?.status).toBe('queued');

    queue.cancel(id2);
    expect(queue.listTasks().some((t) => t.id === id2)).toBe(false);
    expect(queue.listTasks().find((t) => t.id === id1)).toBeDefined();
  });

  it('retry re-enqueues a failed task', async () => {
    const ch = createMockChannel('s1');
    channels.set('s1', ch);
    (ch.upload as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom')).mockResolvedValue({
      success: true,
      bytesTransferred: 10,
      durationMs: 1,
    });

    const id = queue.enqueue({
      sshSessionId: 's1',
      direction: 'upload',
      localPath: '/l',
      remotePath: '/r',
    });

    await vi.waitFor(() => {
      expect(queue.listTasks().find((t) => t.id === id)?.status).toBe('failed');
    });

    queue.retry(id);
    await vi.waitFor(() => {
      expect(queue.listTasks().find((t) => t.id === id)?.status).toBe('completed');
    });
    expect(ch.upload).toHaveBeenCalledTimes(2);
  });

  it('clearCompleted removes completed tasks', async () => {
    const ch = createMockChannel('s1');
    channels.set('s1', ch);
    queue.enqueue({
      sshSessionId: 's1',
      direction: 'upload',
      localPath: '/l',
      remotePath: '/r',
    });
    await vi.waitFor(() => expect(queue.listTasks()[0]?.status).toBe('completed'));
    expect(queue.listTasks()).toHaveLength(1);
    queue.clearCompleted();
    expect(queue.listTasks()).toHaveLength(0);
  });

  it('onTaskUpdate fires for lifecycle', async () => {
    const ch = createMockChannel('s1');
    channels.set('s1', ch);
    const updates: string[] = [];
    queue.onTaskUpdate((t) => updates.push(t.status));

    queue.enqueue({
      sshSessionId: 's1',
      direction: 'download',
      localPath: '/l',
      remotePath: '/r',
    });

    await vi.waitFor(() => {
      expect(updates.at(-1)).toBe('completed');
    });
    expect(updates[0]).toBe('queued');
    expect(updates).toContain('transferring');
    expect(updates).toContain('completed');
  });
});
