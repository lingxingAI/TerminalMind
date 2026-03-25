import { useEffect } from 'react';
import { useTransferStore } from '../stores/transfer-store';

export function useTransferIpcSync(): void {
  useEffect(() => {
    void window.api.sftp.listTransfers().then((tasks) => {
      useTransferStore.getState().hydrateFromMain(tasks);
    });

    const offProgress = window.api.sftp.onTransferProgress((p) => {
      const store = useTransferStore.getState();
      const existing = store.tasks.find((t) => t.id === p.transferId);
      if (!existing && p.sshSessionId !== undefined) {
        store.addTask({
          id: p.transferId,
          sshSessionId: p.sshSessionId,
          direction: p.direction,
          localPath: '',
          remotePath: '',
          filename: p.filename,
          status: 'transferring',
          progress: p.percentage,
          bytesTransferred: p.bytesTransferred,
          totalBytes: p.totalBytes,
        });
      } else {
        store.updateTask(p.transferId, {
          progress: p.percentage,
          bytesTransferred: p.bytesTransferred,
          totalBytes: p.totalBytes,
          status: 'transferring',
          filename: p.filename,
          ...(p.sshSessionId !== undefined ? { sshSessionId: p.sshSessionId } : {}),
        });
      }
    });

    const offComplete = window.api.sftp.onTransferComplete((r) => {
      useTransferStore.getState().updateTask(r.transferId, {
        status: r.success ? 'completed' : 'failed',
        progress: r.success ? 100 : undefined,
        ...(r.error !== undefined ? { error: r.error } : {}),
      });
    });

    return () => {
      offProgress();
      offComplete();
    };
  }, []);
}
