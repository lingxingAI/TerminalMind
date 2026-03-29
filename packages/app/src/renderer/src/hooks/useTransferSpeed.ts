import { useEffect, useRef, useState } from 'react';
import { useTransferStore, type TransferTaskInfo } from '../stores/transfer-store';

export interface TransferStats {
  activeCount: number;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  overallProgress: number;
  speedBytesPerSec: number;
}

const SPEED_INTERVAL_MS = 1_000;

function sumBytes(tasks: TransferTaskInfo[]): number {
  return tasks.reduce((s, t) => s + t.bytesTransferred, 0);
}

export function useTransferStats(): TransferStats {
  const tasks = useTransferStore((s) => s.tasks);
  const [speed, setSpeed] = useState(0);
  const prevRef = useRef<{ bytes: number; time: number } | null>(null);

  const active = tasks.filter((t) => t.status === 'queued' || t.status === 'transferring');
  const completed = tasks.filter((t) => t.status === 'completed');
  const failed = tasks.filter((t) => t.status === 'failed');

  useEffect(() => {
    if (active.length === 0) {
      prevRef.current = null;
      setSpeed(0);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const currentBytes = sumBytes(active);
      const prev = prevRef.current;
      if (prev) {
        const dt = (now - prev.time) / 1000;
        if (dt > 0) {
          const delta = Math.max(0, currentBytes - prev.bytes);
          setSpeed(delta / dt);
        }
      }
      prevRef.current = { bytes: currentBytes, time: now };
    };

    tick();
    const timer = setInterval(tick, SPEED_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  const overallProgress =
    active.length > 0
      ? active.reduce((s, t) => s + t.progress, 0) / active.length
      : 0;

  return {
    activeCount: active.length,
    totalCount: tasks.length,
    completedCount: completed.length,
    failedCount: failed.length,
    overallProgress,
    speedBytesPerSec: speed,
  };
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}
