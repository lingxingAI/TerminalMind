import type { Disposable, Pipeline, PipelineStep } from '@terminalmind/core';
import type { EventType, EventPayloadMap } from '@terminalmind/core';
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
  AIProviderInfo,
  AIStreamChunk,
  SSHConnectOptions,
  TerminalCreateOptions,
} from './ipc/types';

/** Shape used by the main-process connection store (`IConnectionStore`), exposed to extensions. */
export interface StoredConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'local';
  readonly group?: string;
  readonly tags?: readonly string[];
  readonly sshConfig?: Readonly<SSHConnectOptions>;
  readonly terminalConfig?: Readonly<Partial<TerminalCreateOptions>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ExtensionModule {
  activate(ctx: ExtensionContext, api: TerminalMindAPI): void;
  deactivate?(): void;
}

export interface ExtensionContext {
  readonly extensionId: string;
  readonly subscriptions: Disposable[];
}

/** Package / marketplace manifest (`package.json` + `terminalmind`); see `ipc/types`. */
export type {
  ExtensionManifest,
  ExtensionContributions,
  Permission,
  PermissionGrant,
  PermissionPrompt,
  IPermissionManager,
  InstalledExtension,
  RegistryEntry,
  MarketplaceSearchResult,
  InstallProgress,
} from './ipc/types';

export interface TerminalNamespace {
  create(options?: { shell?: string; cwd?: string; title?: string }): Promise<{ id: string; title: string }>;
  list(): { id: string; title: string }[];
  sendInput(sessionId: string, data: string): void;
  destroy(sessionId: string): Promise<void>;
  onData(sessionId: string, callback: (data: string) => void): Disposable;
  onExit(sessionId: string, callback: (exitCode: number) => void): Disposable;
}

export interface AINamespace {
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  stream(request: AICompletionRequest): AsyncIterable<AIStreamChunk>;
  registerProvider(provider: AIProvider): Disposable;
  listProviders(): AIProviderInfo[];
}

export interface ConnectionsNamespace {
  list(): Promise<readonly { id: string; name: string; type: 'ssh' | 'local' }[]>;
  get(id: string): Promise<StoredConnectionProfile | null>;
  save(profile: StoredConnectionProfile): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface FSNamespace {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readDir(path: string): Promise<readonly { name: string; isDirectory: boolean }[]>;
  stat(path: string): Promise<{ size: number; isDirectory: boolean; modifiedAt: number }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface PipelineNamespace {
  registerStep(step: PipelineStep<unknown, unknown>): Disposable;
  pipe(steps: PipelineStep<unknown, unknown>[], name?: string): Pipeline<unknown, unknown>;
  execute(pipeline: Pipeline<unknown, unknown>, input: unknown): Promise<unknown>;
}

export interface ConfigNamespace {
  get<T>(key: string, defaultValue: T): T;
  set(key: string, value: unknown): Promise<void>;
  onDidChange(key: string, callback: (value: unknown) => void): Disposable;
}

export interface WindowNamespace {
  showNotification(message: string, type?: 'info' | 'warning' | 'error'): void;
  showQuickPick<T extends { label: string }>(items: readonly T[]): Promise<T | undefined>;
  showInputBox(options?: { prompt?: string; value?: string }): Promise<string | undefined>;
}

export interface TerminalMindAPI {
  readonly commands: CommandsNamespace;
  readonly views: ViewsNamespace;
  readonly events: EventsNamespace;
  readonly terminal: TerminalNamespace;
  readonly connections: ConnectionsNamespace;
  readonly ai: AINamespace;
  readonly fs: FSNamespace;
  readonly pipeline: PipelineNamespace;
  readonly config: ConfigNamespace;
  readonly window: WindowNamespace;
}

export interface CommandsNamespace {
  register(id: string, handler: (args?: unknown) => Promise<unknown>): Disposable;
  execute<T = unknown>(id: string, args?: unknown): Promise<T>;
  getRegisteredCommands(): readonly string[];
}

export interface SidebarViewProvider {
  readonly viewId: string;
  readonly title: string;
  readonly icon: string;
}

export interface PanelViewProvider {
  readonly viewId: string;
  readonly title: string;
  readonly icon: string;
}

export interface StatusBarItemProvider {
  readonly id: string;
  readonly text: string;
  readonly priority?: number;
}

export interface ViewsNamespace {
  registerSidebarView(viewId: string, provider: SidebarViewProvider): Disposable;
  registerPanelView(viewId: string, provider: PanelViewProvider): Disposable;
  registerStatusBarItem(itemId: string, provider: StatusBarItemProvider): Disposable;
}

export interface EventsNamespace {
  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable;
}
