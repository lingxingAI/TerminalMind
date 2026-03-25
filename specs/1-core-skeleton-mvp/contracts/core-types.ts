/**
 * TerminalMind Core Types — Phase 1 契约
 *
 * 跨层共享的核心类型定义。
 * 本文件是设计契约（非可编译代码），定义 Phase 1 实现必须遵守的类型接口。
 */

// ─── 基础类型 ────────────────────────────────────────────

export interface Disposable {
  dispose(): void;
}

export type Event<T> = (handler: (payload: T) => void) => Disposable;

// ─── ServiceContainer ────────────────────────────────────

export interface ServiceToken<T> {
  readonly id: symbol;
  readonly _brand: T;
}

export function createServiceToken<T>(description: string): ServiceToken<T> {
  return { id: Symbol(description) } as ServiceToken<T>;
}

export interface ServiceContainer {
  register<T>(token: ServiceToken<T>, factory: () => T): void;
  get<T>(token: ServiceToken<T>): T;
}

// ─── CommandRegistry ─────────────────────────────────────

export interface Command<TArgs = unknown, TResult = unknown> {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly handler: (
    args: Readonly<TArgs>,
    ctx: Readonly<CommandContext>
  ) => Promise<TResult>;
}

export interface CommandContext {
  readonly services: ServiceContainer;
  readonly events: EventBus;
  readonly pipeline: PipelineEngine;
}

export interface CommandRegistry {
  register<TArgs, TResult>(command: Command<TArgs, TResult>): Disposable;
  execute<TResult>(id: string, args?: unknown): Promise<TResult>;
  getCommand(id: string): Command | undefined;
  getCommands(): readonly Command[];
  getCommandsByCategory(category: string): readonly Command[];
}

// ─── EventBus ────────────────────────────────────────────

export type EventType =
  | 'terminal.created'
  | 'terminal.destroyed'
  | 'terminal.titleChanged'
  | 'terminal.exited'
  | 'extension.activated'
  | 'extension.deactivated'
  | 'command.registered';

export interface EventPayloadMap {
  'terminal.created': { readonly sessionId: string; readonly title: string };
  'terminal.destroyed': { readonly sessionId: string };
  'terminal.titleChanged': {
    readonly sessionId: string;
    readonly title: string;
  };
  'terminal.exited': { readonly sessionId: string; readonly exitCode: number };
  'extension.activated': { readonly extensionId: string };
  'extension.deactivated': { readonly extensionId: string };
  'command.registered': { readonly commandId: string };
}

export interface EventBus {
  emit<T extends EventType>(
    type: T,
    payload: Readonly<EventPayloadMap[T]>
  ): void;
  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable;
}

// ─── PipelineEngine（Phase 1 Stub） ─────────────────────

export interface PipelineStep<TIn, TOut> {
  readonly name: string;
  readonly transform: (input: Readonly<TIn>) => Promise<TOut>;
}

export interface Pipeline<TIn, TOut> {
  readonly steps: readonly PipelineStep<unknown, unknown>[];
}

export interface PipelineEngine {
  pipe<TIn, TOut>(
    steps: ReadonlyArray<PipelineStep<TIn, TOut>>
  ): Pipeline<TIn, TOut>;
  execute<TIn, TOut>(
    pipeline: Pipeline<TIn, TOut>,
    input: TIn
  ): Promise<TOut>;
}

// ─── TerminalService ─────────────────────────────────────

export interface TerminalCreateOptions {
  readonly shell?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cols?: number;
  readonly rows?: number;
  readonly title?: string;
}

export interface TerminalSession {
  readonly id: string;
  readonly title: string;
  readonly pid: number;
  readonly shellPath: string;
  readonly status: 'running' | 'exited';
  readonly exitCode: number | undefined;
  readonly createdAt: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  readonly onData: Event<string>;
  readonly onExit: Event<{ readonly exitCode: number }>;
}

export interface ITerminalService {
  create(
    options: Readonly<TerminalCreateOptions>
  ): Promise<TerminalSession>;
  getSession(id: string): TerminalSession | undefined;
  listSessions(): readonly TerminalSession[];
  destroy(id: string): Promise<void>;
}

// ─── Shell 发现（平台 Adapter） ──────────────────────────

export interface ShellInfo {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly args: readonly string[];
  readonly platform: 'win32' | 'darwin' | 'linux';
  readonly isDefault: boolean;
}

export interface IShellDiscoveryAdapter {
  discoverShells(): Promise<readonly ShellInfo[]>;
  getDefaultShell(): Promise<ShellInfo>;
}

// ─── ConfigService（Phase 1 简化版） ────────────────────

export interface IConfigService {
  get<T>(key: string, defaultValue: T): T;
  set(key: string, value: unknown): Promise<void>;
  onChange(key: string, handler: (value: unknown) => void): Disposable;
}

// ─── ServiceTokens 注册表 ────────────────────────────────

export const ServiceTokens = {
  TerminalService: createServiceToken<ITerminalService>('ITerminalService'),
  ShellDiscovery: createServiceToken<IShellDiscoveryAdapter>(
    'IShellDiscoveryAdapter'
  ),
  ConfigService: createServiceToken<IConfigService>('IConfigService'),
  CommandRegistry: createServiceToken<CommandRegistry>('CommandRegistry'),
  EventBus: createServiceToken<EventBus>('EventBus'),
  PipelineEngine: createServiceToken<PipelineEngine>('PipelineEngine'),
} as const;
