import React, { useEffect, useRef, useState } from 'react';
import { useTransferStore } from '../../stores/transfer-store';

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${Math.round(n)} B/s`;
  }
  const u = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}/s`;
}

function TransferRowSpeed({
  bytesTransferred,
  status,
}: {
  readonly bytesTransferred: number;
  readonly status: string;
}): React.ReactElement {
  const [speed, setSpeed] = useState(0);
  const ref = useRef({ t: performance.now(), b: bytesTransferred });

  useEffect(() => {
    if (status !== 'transferring') {
      setSpeed(0);
      return;
    }
    const now = performance.now();
    const prev = ref.current;
    const dt = (now - prev.t) / 1000;
    if (dt >= 0.25) {
      const db = bytesTransferred - prev.b;
      if (db >= 0 && dt > 0) {
        setSpeed(db / dt);
      }
      ref.current = { t: now, b: bytesTransferred };
    }
  }, [bytesTransferred, status]);

  return <span className="sftp-tq-speed">{status === 'transferring' ? formatBytes(speed) : '—'}</span>;
}

export function TransferQueue(): React.ReactElement {
  const tasks = useTransferStore((s) => s.tasks);

  const handleClear = async () => {
    await window.api.sftp.clearCompleted();
    const fresh = await window.api.sftp.listTransfers();
    useTransferStore.getState().hydrateFromMain(fresh);
  };

  const handleRetry = async (id: string) => {
    await window.api.sftp.retryTransfer(id);
  };

  return (
    <div className="sftp-transfer-queue">
      <div className="sftp-tq-header">
        <span className="sftp-tq-title">Transfers</span>
        <button type="button" className="sftp-toolbar-btn sftp-small" onClick={() => void handleClear()}>
          Clear completed
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="sftp-tq-empty">No active transfers</div>
      ) : (
        <ul className="sftp-tq-list">
          {tasks.map((t) => (
            <li key={t.id} className="sftp-tq-item">
              <div className="sftp-tq-row1">
                <span className="sftp-tq-arrow">{t.direction === 'upload' ? '↑' : '↓'}</span>
                <span className="sftp-tq-name" title={t.remotePath || t.localPath}>
                  {t.filename}
                </span>
                <span className="sftp-tq-pct">
                  {t.status === 'failed' ? 'failed' : `${Math.round(t.progress)}%`}
                </span>
                <TransferRowSpeed bytesTransferred={t.bytesTransferred} status={t.status} />
              </div>
              <div className="sftp-tq-bar-wrap">
                <div className="sftp-tq-bar" style={{ width: `${Math.min(100, t.progress)}%` }} />
              </div>
              {t.status === 'failed' && t.error && <div className="sftp-tq-err">{t.error}</div>}
              {t.status === 'failed' && (
                <button type="button" className="sftp-toolbar-btn sftp-small" onClick={() => void handleRetry(t.id)}>
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
