/**
 * TerminalMind IPC Bridge 契约 — Phase 1
 *
 * 定义 Main ↔ Renderer 进程间通信的通道、请求/响应类型。
 * 共享类型由 main、preload、renderer 三方引用，保证编译期类型一致。
 */

import type {
  TerminalCreateOptions,
  TerminalSession,
  ShellInfo,
  EventType,
  EventPayloadMap,
} from './core-types';

// ─── IPC 通道常量 ────────────────────────────────────────

/**
 * Request-Response 通道（invoke/handle 模式）。
 * Renderer 调用 → Main 处理 → 返回结果。
 */
export const IpcChannels = {
  // 终端管理
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_LIST: 'terminal:list',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_GET_SESSION: 'terminal:getSession',

  // Shell 发现
  SHELL_DISCOVER: 'shell:discover',
  SHELL_GET_DEFAULT: 'shell:getDefault',

  // 命令执行
  COMMAND_EXECUTE: 'command:execute',
  COMMAND_LIST: 'command:list',

  // 配置
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
} as const;

/**
 * 事件通道（send/on 模式）。
 * 单向推送，无返回值。
 */
export const IpcEventChannels = {
  // Main → Renderer：PTY 数据流
  PTY_DATA: 'pty:data',

  // Renderer → Main：PTY 输入
  PTY_INPUT: 'pty:input',

  // Main → Renderer：EventBus 事件桥接
  EVENT_BROADCAST: 'event:broadcast',
} as const;

// ─── Request/Response 类型映射 ───────────────────────────

export interface IpcRequestMap {
  [IpcChannels.TERMINAL_CREATE]: {
    request: Readonly<TerminalCreateOptions>;
    response: TerminalSessionInfo;
  };
  [IpcChannels.TERMINAL_DESTROY]: {
    request: { readonly sessionId: string };
    response: void;
  };
  [IpcChannels.TERMINAL_LIST]: {
    request: void;
    response: readonly TerminalSessionInfo[];
  };
  [IpcChannels.TERMINAL_RESIZE]: {
    request: {
      readonly sessionId: string;
      readonly cols: number;
      readonly rows: number;
    };
    response: void;
  };
  [IpcChannels.TERMINAL_GET_SESSION]: {
    request: { readonly sessionId: string };
    response: TerminalSessionInfo | null;
  };
  [IpcChannels.SHELL_DISCOVER]: {
    request: void;
    response: readonly ShellInfo[];
  };
  [IpcChannels.SHELL_GET_DEFAULT]: {
    request: void;
    response: ShellInfo;
  };
  [IpcChannels.COMMAND_EXECUTE]: {
    request: { readonly id: string; readonly args?: unknown };
    response: unknown;
  };
  [IpcChannels.COMMAND_LIST]: {
    request: void;
    response: readonly CommandInfo[];
  };
  [IpcChannels.CONFIG_GET]: {
    request: { readonly key: string; readonly defaultValue: unknown };
    response: unknown;
  };
  [IpcChannels.CONFIG_SET]: {
    request: { readonly key: string; readonly value: unknown };
    response: void;
  };
}

// ─── 事件数据类型 ────────────────────────────────────────

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

// ─── 序列化友好的会话信息 ────────────────────────────────

/**
 * TerminalSession 的可序列化子集，用于 IPC 传输。
 * 不含方法（write、resize、onData、onExit），
 * 这些通过独立的 IPC 通道处理。
 */
export interface TerminalSessionInfo {
  readonly id: string;
  readonly title: string;
  readonly pid: number;
  readonly shellPath: string;
  readonly status: 'running' | 'exited';
  readonly exitCode: number | undefined;
  readonly createdAt: number;
}

export interface CommandInfo {
  readonly id: string;
  readonly title: string;
  readonly category: string;
}

// ─── Preload 暴露的 API 形状 ────────────────────────────

/**
 * 通过 contextBridge.exposeInMainWorld('api', ...) 暴露到 window.api。
 * Renderer 进程中 React 组件通过 useTerminalMindAPI() hook 访问。
 */
export interface PreloadAPI {
  // Request-Response（对应 ipcRenderer.invoke）
  terminal: {
    create(options: Readonly<TerminalCreateOptions>): Promise<TerminalSessionInfo>;
    destroy(sessionId: string): Promise<void>;
    list(): Promise<readonly TerminalSessionInfo[]>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    getSession(sessionId: string): Promise<TerminalSessionInfo | null>;
    sendInput(sessionId: string, data: string): void;
    onData(
      sessionId: string,
      callback: (data: string) => void
    ): () => void;
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

// ─── Window 类型增强（Renderer 使用） ───────────────────

declare global {
  interface Window {
    readonly api: PreloadAPI;
  }
}
