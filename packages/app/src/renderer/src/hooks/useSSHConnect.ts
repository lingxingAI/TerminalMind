import { useCallback, useState } from 'react';
import type { SSHConnectOptions } from '@terminalmind/api';
import { useTabStore } from '../stores/tab-store';

export interface UseSSHConnectResult {
  connect: (options: Readonly<SSHConnectOptions>, title?: string) => Promise<void>;
  isConnecting: boolean;
  error: string | null;
  clearError: () => void;
}

export function useSSHConnect(): UseSSHConnectResult {
  const addSSHTab = useTabStore((s) => s.addSSHTab);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const connect = useCallback(
    async (options: Readonly<SSHConnectOptions>, title?: string) => {
      setError(null);
      setIsConnecting(true);
      try {
        const info = await window.api.ssh.connect(options);
        const termId = info.terminalSessionId;
        if (!termId) {
          throw new Error('SSH connect did not return a terminal session id');
        }
        const tabTitle = title ?? `${options.username}@${options.host}`;
        addSSHTab(termId, info.id, tabTitle);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setIsConnecting(false);
      }
    },
    [addSSHTab],
  );

  return { connect, isConnecting, error, clearError };
}
