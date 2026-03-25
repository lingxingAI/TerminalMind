import type { EventType, EventPayloadMap } from '@terminalmind/core';

export interface TerminalCreateOptions {
  readonly shell?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cols?: number;
  readonly rows?: number;
  readonly title?: string;
}

export interface TerminalSessionInfo {
  readonly id: string;
  readonly title: string;
  readonly pid: number;
  readonly shellPath: string;
  readonly status: 'running' | 'exited';
  readonly exitCode: number | undefined;
  readonly createdAt: number;
}

export interface ShellInfo {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly args: readonly string[];
  readonly platform: 'win32' | 'darwin' | 'linux';
  readonly isDefault: boolean;
}

export interface CommandInfo {
  readonly id: string;
  readonly title: string;
  readonly category: string;
}

export interface PtyDataPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface PtyInputPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface EventBroadcastPayload<T extends EventType = EventType> {
  readonly type: T;
  readonly payload: EventPayloadMap[T];
}

export interface PreloadAPI {
  terminal: {
    create(options: Readonly<TerminalCreateOptions>): Promise<TerminalSessionInfo>;
    destroy(sessionId: string): Promise<void>;
    list(): Promise<readonly TerminalSessionInfo[]>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    getSession(sessionId: string): Promise<TerminalSessionInfo | null>;
    sendInput(sessionId: string, data: string): void;
    onData(sessionId: string, callback: (data: string) => void): () => void;
  };
  shell: {
    discover(): Promise<readonly ShellInfo[]>;
    getDefault(): Promise<ShellInfo>;
  };
  commands: {
    execute<T = unknown>(id: string, args?: unknown): Promise<T>;
    list(): Promise<readonly CommandInfo[]>;
  };
  config: {
    get<T>(key: string, defaultValue: T): Promise<T>;
    set(key: string, value: unknown): Promise<void>;
  };
  events: {
    onEvent<T extends EventType>(
      type: T,
      callback: (payload: EventPayloadMap[T]) => void
    ): () => void;
  };
}

declare global {
  interface Window {
    readonly api: PreloadAPI;
  }
}
