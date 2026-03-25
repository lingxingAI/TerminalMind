import type { WindowNamespace } from '@terminalmind/api';

export function createWindowNamespace(): WindowNamespace {
  return {
    showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info') {
      // GUI phase: IPC to renderer; for now log for smoke / debugging.
      console.log(`[TerminalMind notification:${type}] ${message}`);
    },
    async showQuickPick<T extends { label: string }>(_items: readonly T[]) {
      return undefined;
    },
    async showInputBox(_options?: { prompt?: string; value?: string }) {
      return undefined;
    },
  };
}
