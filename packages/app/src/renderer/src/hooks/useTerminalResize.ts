import { useCallback, useRef } from 'react';

interface ResizeState {
  timer: ReturnType<typeof setTimeout> | null;
}

export function useTerminalResize(
  sessionId: string | null,
  fitFn: (() => { cols: number; rows: number } | undefined) | null,
): () => void {
  const stateRef = useRef<ResizeState>({ timer: null });

  return useCallback(() => {
    if (!sessionId || !fitFn) return;

    if (stateRef.current.timer) {
      clearTimeout(stateRef.current.timer);
    }

    stateRef.current.timer = setTimeout(() => {
      const dims = fitFn();
      if (dims) {
        window.api.terminal.resize(sessionId, dims.cols, dims.rows);
      }
      stateRef.current.timer = null;
    }, 50);
  }, [sessionId, fitFn]);
}
