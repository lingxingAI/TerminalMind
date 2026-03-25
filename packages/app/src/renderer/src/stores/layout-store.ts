import { create } from 'zustand';

interface LayoutStoreState {
  sidebarVisible: boolean;
  sidebarWidth: number;
  panelVisible: boolean;
  panelHeight: number;
  activeActivityBarItem: string;
  activeSidebarView: string;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  togglePanel: () => void;
  setPanelHeight: (height: number) => void;
  setActiveActivityBarItem: (id: string) => void;
  setActiveSidebarView: (id: string) => void;
}

export const useLayoutStore = create<LayoutStoreState>((set) => ({
  sidebarVisible: true,
  sidebarWidth: 240,
  panelVisible: false,
  panelHeight: 200,
  activeActivityBarItem: 'terminal',
  activeSidebarView: 'terminal-list',
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(160, Math.min(width, 480)) }),
  togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
  setPanelHeight: (height) => set({ panelHeight: Math.max(100, Math.min(height, 500)) }),
  setActiveActivityBarItem: (id) => set({ activeActivityBarItem: id, activeSidebarView: id }),
  setActiveSidebarView: (id) => set({ activeSidebarView: id }),
}));
