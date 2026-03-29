import { useEffect } from 'react';
import { useLayoutStore } from '../stores/layout-store';
import { useConnectionStore } from '../stores/connection-store';
import { useTabStore } from '../stores/tab-store';

const ACTIVITY_BAR_SHORTCUT_ORDER = [
  'connections',
  'files',
  'extensions',
  'settings',
] as const;

export function useGlobalKeybindings(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        useConnectionStore.getState().openEditor();
      }
      if (ctrl && !e.shiftKey) {
        const digit = /^Digit([1-4])$/.exec(e.code);
        if (digit) {
          e.preventDefault();
          const index = Number(digit[1]) - 1;
          useLayoutStore
            .getState()
            .setActiveActivityBarItem(ACTIVITY_BAR_SHORTCUT_ORDER[index]);
        }
      }
      if (ctrl && e.key === ',') {
        e.preventDefault();
        useLayoutStore.getState().setActiveActivityBarItem('settings');
      }
      if (ctrl && e.key === 'ArrowLeft') {
        e.preventDefault();
        useTabStore.getState().activatePrevTab();
      }
      if (ctrl && e.key === 'ArrowRight') {
        e.preventDefault();
        useTabStore.getState().activateNextTab();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
