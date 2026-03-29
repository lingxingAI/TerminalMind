import { create } from 'zustand';

export type SessionMode = 'shell' | 'agent';

export interface TabState {
  readonly id: string;
  readonly terminalSessionId: string;
  readonly title: string;
  readonly isActive: boolean;
  readonly icon: string;
  readonly iconColor: string;
  readonly connectionType: 'local' | 'ssh';
  readonly sshSessionId?: string;
  readonly connectionId?: string;
  readonly sessionMode: SessionMode;
}

interface TabStoreState {
  tabs: TabState[];
  addTab: (sessionId: string, title: string) => string;
  addSSHTab: (sessionId: string, sshSessionId: string, title: string, connectionId?: string) => string;
  removeTab: (tabId: string) => void;
  removeOtherTabs: (tabId: string) => void;
  removeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  activateNextTab: () => void;
  activatePrevTab: () => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  updateTitle: (tabId: string, title: string) => void;
  setSessionMode: (tabId: string, mode: SessionMode) => void;
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
          connectionType: 'local',
          sessionMode: 'agent',
        },
      ],
    }));
    return tabId;
  },

  addSSHTab: (sessionId: string, sshSessionId: string, title: string, connectionId?: string) => {
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
          iconColor: 'var(--accent)',
          connectionType: 'ssh',
          sshSessionId,
          connectionId,
          sessionMode: 'agent',
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

  removeOtherTabs: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs
        .filter((t) => t.id === tabId)
        .map((t) => ({ ...t, isActive: true })),
    }));
  },

  removeAllTabs: () => {
    set({ tabs: [] });
  },

  setActiveTab: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
    }));
  },

  activateNextTab: () => {
    set((state) => {
      const { tabs } = state;
      if (tabs.length <= 1) return state;
      const idx = tabs.findIndex((t) => t.isActive);
      const next = (idx + 1) % tabs.length;
      return { tabs: tabs.map((t, i) => ({ ...t, isActive: i === next })) };
    });
  },

  activatePrevTab: () => {
    set((state) => {
      const { tabs } = state;
      if (tabs.length <= 1) return state;
      const idx = tabs.findIndex((t) => t.isActive);
      const prev = (idx - 1 + tabs.length) % tabs.length;
      return { tabs: tabs.map((t, i) => ({ ...t, isActive: i === prev })) };
    });
  },

  moveTab: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const { tabs } = state;
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= tabs.length || toIndex >= tabs.length) {
        return state;
      }
      const next = [...tabs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { tabs: next };
    });
  },

  updateTitle: (tabId: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    }));
  },

  setSessionMode: (tabId: string, mode: SessionMode) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, sessionMode: mode } : t)),
    }));
  },
}));
