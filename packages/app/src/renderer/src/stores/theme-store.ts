import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';

interface ThemeStoreState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  initTheme: () => Promise<void>;
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  theme: 'dark',
  setTheme: (theme) => {
    applyTheme(theme);
    void window.api.config.set('appearance.theme', theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
  initTheme: async () => {
    const saved = await window.api.config.get<ThemeMode>('appearance.theme', 'dark');
    applyTheme(saved);
    set({ theme: saved });
  },
}));
