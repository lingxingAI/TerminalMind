import { create } from 'zustand';
import type { ShellInfo } from '@terminalmind/api';

export interface TerminalFontOption {
  value: string;
  label: string;
  bundled?: boolean;
}

export interface TerminalSettings {
  defaultShellPath: string;
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  copyOnSelect: boolean;
}

const DEFAULTS: TerminalSettings = {
  defaultShellPath: '',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 14,
  scrollback: 10000,
  copyOnSelect: true,
};

const CANDIDATE_FONTS: TerminalFontOption[] = [
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono', bundled: true },
  { value: "'Cascadia Code', monospace", label: 'Cascadia Code' },
  { value: "'Cascadia Mono', monospace", label: 'Cascadia Mono' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: "'Source Code Pro', monospace", label: 'Source Code Pro' },
  { value: "'Consolas', monospace", label: 'Consolas' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: "'Ubuntu Mono', monospace", label: 'Ubuntu Mono' },
  { value: "'Hack', monospace", label: 'Hack' },
  { value: "'Inconsolata', monospace", label: 'Inconsolata' },
  { value: "'Menlo', monospace", label: 'Menlo' },
  { value: "'Monaco', monospace", label: 'Monaco' },
  { value: "'DejaVu Sans Mono', monospace", label: 'DejaVu Sans Mono' },
  { value: "'Lucida Console', monospace", label: 'Lucida Console' },
  { value: "'SF Mono', monospace", label: 'SF Mono' },
  { value: "'Roboto Mono', monospace", label: 'Roboto Mono' },
];

function detectAvailableFonts(): TerminalFontOption[] {
  return CANDIDATE_FONTS.filter((f) => {
    if (f.bundled) return true;
    try {
      return document.fonts.check(`16px ${f.label}`);
    } catch {
      return false;
    }
  });
}

interface TerminalSettingsState extends TerminalSettings {
  shells: readonly ShellInfo[];
  availableFonts: TerminalFontOption[];
  ready: boolean;
  init: () => Promise<void>;
  setDefaultShellPath: (path: string) => void;
  setFontFamily: (family: string) => void;
  setFontSize: (size: number) => void;
  setScrollback: (lines: number) => void;
  setCopyOnSelect: (enabled: boolean) => void;
}

function persist(key: string, value: unknown): void {
  void window.api.config.set(`terminal.${key}`, value);
}

export const useTerminalSettingsStore = create<TerminalSettingsState>((set) => ({
  ...DEFAULTS,
  shells: [],
  availableFonts: CANDIDATE_FONTS.filter((f) => f.bundled),
  ready: false,

  init: async () => {
    const [defaultShellPath, fontFamily, fontSize, scrollback, copyOnSelect, shells] =
      await Promise.all([
        window.api.config.get<string>('terminal.defaultShellPath', DEFAULTS.defaultShellPath),
        window.api.config.get<string>('terminal.fontFamily', DEFAULTS.fontFamily),
        window.api.config.get<number>('terminal.fontSize', DEFAULTS.fontSize),
        window.api.config.get<number>('terminal.scrollback', DEFAULTS.scrollback),
        window.api.config.get<boolean>('terminal.copyOnSelect', DEFAULTS.copyOnSelect),
        window.api.shell.discover(),
      ]);
    const availableFonts = detectAvailableFonts();
    set({ defaultShellPath, fontFamily, fontSize, scrollback, copyOnSelect, shells, availableFonts, ready: true });
  },

  setDefaultShellPath: (path) => {
    persist('defaultShellPath', path);
    set({ defaultShellPath: path });
  },
  setFontFamily: (family) => {
    persist('fontFamily', family);
    set({ fontFamily: family });
  },
  setFontSize: (size) => {
    if (size < 8 || size > 72) return;
    persist('fontSize', size);
    set({ fontSize: size });
  },
  setScrollback: (lines) => {
    if (lines < 0 || lines > 100000) return;
    persist('scrollback', lines);
    set({ scrollback: lines });
  },
  setCopyOnSelect: (enabled) => {
    persist('copyOnSelect', enabled);
    set({ copyOnSelect: enabled });
  },
}));
