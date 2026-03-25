/**
 * Phase 4 — Extension Host、Permission、完整 TerminalMindAPI 与 Worker 受限代理契约
 *
 * 实现注意：本文件为规约级类型定义；实现应置于 packages/api / packages/services 并与之一致。
 */

/** 与 @terminalmind/api 对齐 */
export interface Disposable {
  dispose(): void;
}

// ─── Permission ───────────────────────────────────────────

export type Permission =
  | 'terminal.execute'
  | 'connections.read'
  | 'connections.write'
  | 'fs.read'
  | 'fs.write'
  | 'ai.invoke'
  | 'network.outbound';

export interface PermissionGrant {
  readonly extensionId: string;
  readonly granted: ReadonlySet<Permission>;
  readonly updatedAt: number;
}

export interface IPermissionManager {
  check(extensionId: string, permission: Permission): boolean;
  request(
    extensionId: string,
    permissions: readonly Permission[]
  ): Promise<PermissionGrant>;
  /** 可选：撤销授权，供扩展管理 UI 调用 */
  revoke?(extensionId: string, permissions: readonly Permission[]): Promise<void>;
}

// ─── Manifest 贡献点（与 data-model.md 对齐）────────────────

export interface CommandContribution {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
}

export interface ViewContribution {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly location: 'sidebar' | 'panel' | 'statusBar';
}

export interface ExtensionManifest {
  readonly entry: string;
  readonly activationEvents: readonly string[];
  readonly permissions: readonly Permission[];
  readonly contributes: ExtensionContributions;
}

export interface ExtensionContributions {
  readonly commands?: readonly CommandContribution[];
  readonly views?: readonly ViewContribution[];
  readonly menus?: readonly MenuContribution[];
  readonly keybindings?: readonly KeybindingContribution[];
  readonly configuration?: readonly ConfigurationContribution[];
}

export interface MenuContribution {
  readonly command: string;
  readonly when?: string;
  readonly group?: string;
}

export interface KeybindingContribution {
  readonly command: string;
  readonly key: string;
  readonly when?: string;
  readonly mac?: string;
}

export interface ConfigurationContribution {
  readonly title: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

// ─── InstalledExtension / Host ────────────────────────────

export type ExtensionSource = 'builtin' | 'marketplace' | 'local';

export interface InstalledExtension {
  readonly id: string;
  readonly version: string;
  readonly source: ExtensionSource;
  readonly rootPath: string;
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
  readonly installedAt: number;
  readonly updatedAt: number;
}

export interface IExtensionHost {
  readonly permissionManager: IPermissionManager;

  listInstalled(): Promise<readonly InstalledExtension[]>;
  /** 扫描 extensions 目录并合并内置扩展列表 */
  refresh(): Promise<void>;
  activateExtension(extensionId: string): Promise<void>;
  deactivateExtension(extensionId: string): Promise<void>;
  /** 从磁盘加载并走激活事件（内置扩展同步路径） */
  loadBuiltinExtensions(): Promise<void>;
}

export interface IWorkerExtensionHost extends IExtensionHost {
  /** 为指定扩展创建或复用 Worker，并传入 MessagePort */
  spawnWorker(extension: InstalledExtension): Promise<void>;
  terminateWorker(extensionId: string): Promise<void>;
  getWorkerState(extensionId: string): WorkerExtensionState;
}

export type WorkerExtensionState =
  | { readonly status: 'stopped' }
  | { readonly status: 'starting' }
  | { readonly status: 'running'; readonly workerThreadId: number }
  | { readonly status: 'crashed'; readonly lastError?: string };

// ─── Worker 消息协议 ───────────────────────────────────────

export type ExtensionWorkerMessage =
  | { readonly kind: 'worker.ready'; readonly extensionId: string }
  | {
      readonly kind: 'worker.error';
      readonly extensionId: string;
      readonly message: string;
    }
  | {
      readonly kind: 'api.invoke';
      readonly callId: string;
      readonly extensionId: string;
      readonly namespace: keyof TerminalMindAPI;
      readonly method: string;
      readonly payload: unknown;
    }
  | {
      readonly kind: 'api.response';
      readonly callId: string;
      readonly ok: boolean;
      readonly result?: unknown;
      readonly error?: { readonly code: string; readonly message: string };
    }
  | {
      readonly kind: 'api.event';
      readonly subscriptionId: string;
      readonly payload: unknown;
    }
  | { readonly kind: 'lifecycle.shutdown'; readonly extensionId: string };

// ─── Extension context ─────────────────────────────────────

export interface ExtensionContext {
  readonly extensionId: string;
  readonly subscriptions: Disposable[];
  readonly extensionPath: string;
}

export interface ExtensionModule {
  activate(ctx: ExtensionContext, api: TerminalMindAPI): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// ─── 共享类型（精简 DTO，实现侧可扩展）──────────────────────

export interface TerminalSessionInfo {
  readonly sessionId: string;
  readonly title: string;
  readonly cwd?: string;
  readonly shell?: string;
}

export interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'sftp' | string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface AICompletionRequest {
  readonly model: string;
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly systemPrompt?: string;
}

export interface AIStreamHandle {
  readonly cancel: () => void;
}

export interface FileStat {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface PipelineStepHandle {
  readonly id: string;
}

export type EventType = string;
export type EventPayload = Readonly<Record<string, unknown>>;

export interface QuickPickItem {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly id?: string;
}

// ─── TerminalMindAPI（10 命名空间）─────────────────────────

export interface CommandsNamespace {
  register(
    id: string,
    handler: (args?: unknown) => Promise<unknown>
  ): Disposable;
  execute<T = unknown>(id: string, args?: unknown): Promise<T>;
  getRegisteredCommands(): readonly string[];
}

export interface TerminalNamespace {
  createSession(options?: Readonly<Record<string, unknown>>): Promise<TerminalSessionInfo>;
  destroySession(sessionId: string): Promise<void>;
  listSessions(): Promise<readonly TerminalSessionInfo[]>;
  sendInput(sessionId: string, data: string): Promise<void>;
  onOutput(
    sessionId: string,
    handler: (chunk: string) => void
  ): Disposable;
  /** 需要 terminal.execute */
  executeInSession?(
    sessionId: string,
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface ConnectionsNamespace {
  list(): Promise<readonly ConnectionProfile[]>;
  get(id: string): Promise<ConnectionProfile | null>;
  create(profile: Omit<ConnectionProfile, 'id'>): Promise<ConnectionProfile>;
  update(profile: ConnectionProfile): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface AiNamespace {
  complete(request: AICompletionRequest): Promise<{ content: string }>;
  stream(
    request: AICompletionRequest,
    onChunk: (text: string) => void
  ): Promise<AIStreamHandle>;
  registerProvider?(provider: unknown): Disposable;
}

export interface FsNamespace {
  readText(path: string, encoding?: BufferEncoding): Promise<string>;
  writeText(path: string, content: string, encoding?: BufferEncoding): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  readdir(path: string): Promise<readonly FileStat[]>;
  /** 远程路径由实现约定 scheme，如 ssh://sessionId/... */
  remoteRead?(uri: string): Promise<Uint8Array>;
  remoteWrite?(uri: string, data: Uint8Array): Promise<void>;
}

export interface SidebarViewProvider {
  readonly viewId: string;
  readonly title: string;
  readonly icon: string;
}

export interface ViewsNamespace {
  registerSidebarView(viewId: string, provider: SidebarViewProvider): Disposable;
  registerPanel?(viewId: string, provider: SidebarViewProvider): Disposable;
  registerStatusBarItem?(
    id: string,
    provider: Readonly<{ text: string; tooltip?: string }>
  ): Disposable;
}

export interface PipelineNamespace {
  registerStep(
    id: string,
    step: (input: unknown) => Promise<unknown>
  ): Disposable;
  executePipeline(
    pipelineId: string,
    input: unknown
  ): Promise<unknown>;
  compose?(
    id: string,
    steps: readonly PipelineStepHandle[]
  ): Disposable;
}

export interface EventsNamespace {
  on<T extends EventType>(
    type: T,
    handler: (payload: EventPayload) => void
  ): Disposable;
}

export interface ConfigNamespace {
  get<T>(key: string, defaultValue: T): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
}

export interface WindowNamespace {
  showInformationMessage(message: string): Promise<void>;
  showWarningMessage(message: string): Promise<void>;
  showErrorMessage(message: string): Promise<void>;
  showQuickPick?(
    items: readonly QuickPickItem[],
    options?: { title?: string }
  ): Promise<QuickPickItem | undefined>;
}

export interface TerminalMindAPI {
  readonly commands: CommandsNamespace;
  readonly terminal: TerminalNamespace;
  readonly connections: ConnectionsNamespace;
  readonly ai: AiNamespace;
  readonly fs: FsNamespace;
  readonly views: ViewsNamespace;
  readonly pipeline: PipelineNamespace;
  readonly events: EventsNamespace;
  readonly config: ConfigNamespace;
  readonly window: WindowNamespace;
}

/**
 * Worker 内可见的受限 API；通常为同步包装为 Promise 的代理。
 * 禁止暴露：原始 Node 模块、任意文件路径绕过校验、未授权网络。
 */
export type ExtensionWorkerAPI = Pick<
  TerminalMindAPI,
  'commands' | 'terminal' | 'connections' | 'ai' | 'fs' | 'views' | 'pipeline' | 'events' | 'config' | 'window'
>;

/** 实现侧可用 Omit 或更窄方法集收窄 Worker 能力 */
export type ExtensionWorkerAPILimits = {
  readonly blockedMethods?: Partial<
    Record<keyof TerminalMindAPI, readonly string[]>
  >;
};
