import { create } from 'zustand';

export interface TabState {
  readonly id: string;
  readonly terminalSessionId: string;
  readonly title: string;
  readonly isActive: boolean;
  readonly icon: string;
  readonly iconColor: string;
}

interface TabStoreState {
  tabs: TabState[];
  addTab: (sessionId: string, title: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTitle: (tabId: string, title: string) => void;
}

let nextTabId = 1;

export const useTabStore = create<TabStoreState>((set, _get) => ({
  tabs: [],

  addTab: (sessionId: string, title: string) => {
    const tabId = `tab-${nextTabId++}`;
    set((state) => ({
      tabs: [
        ...state.tabs.map((t) => ({ ...t, isActive: false })),
        {
          id: tabId,
          terminalSessionId: sessionId,
          title,
          isActive: true,
          icon: 'terminal',
          iconColor: 'var(--green)',
        },
      ],
    }));
    return tabId;
  },

  removeTab: (tabId: string) => {
    set((state) => {
      const filtered = state.tabs.filter((t) => t.id !== tabId);
      const wasActive = state.tabs.find((t) => t.id === tabId)?.isActive;
      if (wasActive && filtered.length > 0) {
        filtered[filtered.length - 1] = { ...filtered[filtered.length - 1], isActive: true };
      }
      return { tabs: filtered };
    });
  },

  setActiveTab: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
    }));
  },

  updateTitle: (tabId: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    }));
  },
}));
