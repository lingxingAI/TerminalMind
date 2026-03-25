import { create } from 'zustand';

interface SftpBrowserState {
  selectedSshSessionId: string | null;
  setSelectedSshSessionId: (id: string | null) => void;
}

export const useSftpBrowserStore = create<SftpBrowserState>((set) => ({
  selectedSshSessionId: null,
  setSelectedSshSessionId: (id) => set({ selectedSshSessionId: id }),
}));
