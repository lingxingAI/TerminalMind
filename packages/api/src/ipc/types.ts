import type { Disposable, EventType, EventPayloadMap } from '@terminalmind/core';

// Permission types (Phase 4)
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
  readonly permission: Permission;
  readonly granted: boolean;
  readonly timestamp: number;
}

export interface PermissionPrompt {
  readonly extensionId: string;
  readonly extensionName: string;
  readonly permissions: readonly Permission[];
  readonly reason?: string;
}

export interface IPermissionManager {
  check(extensionId: string, permission: Permission): boolean;
  request(extensionId: string, permissions: readonly Permission[]): Promise<PermissionGrant[]>;
  revoke(extensionId: string, permission: Permission): void;
  getGrants(extensionId: string): PermissionGrant[];
  isBuiltin(extensionId: string): boolean;
  registerBuiltin(extensionId: string): void;
}

// Extension manifest types (Phase 4 — package.json `terminalmind` block)
export interface ExtensionManifest {
  readonly name: string;
  readonly displayName?: string;
  readonly version: string;
  readonly description?: string;
  readonly author?: string;
  readonly license?: string;
  readonly repository?: string;
  readonly terminalmind: {
    readonly entry: string;
    readonly activationEvents: readonly string[];
    readonly permissions?: readonly Permission[];
    readonly contributes?: ExtensionContributions;
  };
}

export interface ExtensionContributions {
  readonly commands?: readonly { readonly id: string; readonly title: string; readonly category?: string }[];
  readonly views?: {
    readonly sidebar?: readonly { readonly id: string; readonly name: string }[];
    readonly panel?: readonly { readonly id: string; readonly name: string }[];
  };
  readonly menus?: readonly { readonly command: string; readonly group?: string }[];
  readonly keybindings?: readonly { readonly command: string; readonly key: string; readonly when?: string }[];
  readonly configuration?: readonly {
    readonly key: string;
    readonly type: string;
    readonly default?: unknown;
    readonly description?: string;
  }[];
}

export interface InstalledExtension {
  readonly id: string;
  readonly manifest: ExtensionManifest;
  readonly installPath: string;
  readonly installedAt: number;
  readonly updatedAt: number;
  readonly enabled: boolean;
  readonly isBuiltin: boolean;
}

// Marketplace types
export interface RegistryEntry {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly author: string;
  readonly repository: string;
  readonly tarballUrl: string;
  readonly sha512: string;
  readonly downloads: number;
  readonly tags: readonly string[];
  readonly publishedAt: string;
}

export interface MarketplaceSearchResult {
  readonly entries: readonly RegistryEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface InstallProgress {
  readonly extensionId: string;
  readonly phase: 'downloading' | 'verifying' | 'extracting' | 'activating' | 'done' | 'error';
  readonly progress: number; // 0-100
  readonly error?: string;
}

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

export type SSHAuthMethod =
  | Readonly<{ readonly type: 'password'; readonly password: string }>
  | Readonly<{ readonly type: 'publicKey'; readonly privateKeyPath: string; readonly passphrase?: string }>
  | Readonly<{ readonly type: 'agent' }>;

export type SSHConnectOptions = {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SSHAuthMethod;
  readonly jumpHosts?: readonly SSHConnectOptions[];
  readonly keepAlive?: boolean;
  readonly readyTimeout?: number;
};

export interface SSHSessionInfo {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly status: 'connecting' | 'connected' | 'disconnected' | 'error';
  readonly connectedAt: number | undefined;
  readonly error: string | undefined;
  /** Set when `connect` opened an interactive shell wired to PTY_DATA / TerminalView */
  readonly terminalSessionId?: string;
}

export interface ExecResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PortForwardOptions {
  readonly sessionId: string;
  readonly localHost: string;
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
}

export interface PortForwardInfo {
  readonly id: string;
  readonly sessionId: string;
  readonly localHost: string;
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
}

export interface SFTPFileStat {
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly size: number;
  readonly atime: number;
  readonly mtime: number;
}

export interface SFTPFileEntry {
  readonly filename: string;
  readonly longname?: string;
  readonly attrs: Readonly<SFTPFileStat>;
}

export interface SFTPTransferOptions {
  readonly sessionId: string;
  readonly localPath: string;
  readonly remotePath: string;
}

export interface SFTPTransferResult {
  readonly transferId: string;
  readonly success: boolean;
  readonly error?: string;
}

export interface SFTPTransferProgress {
  readonly transferId: string;
  readonly filename: string;
  readonly direction: 'upload' | 'download';
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly percentage: number;
  readonly sshSessionId?: string;
}

/** Full queue task snapshot (listTransfers + optional hydration for UI store). */
export interface SFTPQueueTaskInfo {
  readonly id: string;
  readonly sshSessionId: string;
  readonly direction: 'upload' | 'download';
  readonly localPath: string;
  readonly remotePath: string;
  readonly filename: string;
  readonly status: 'queued' | 'transferring' | 'completed' | 'failed';
  readonly progress: number;
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly error?: string;
}

export interface LocalDirEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface ConnectionProfileTimestamps {
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'local';
  readonly group?: string;
  readonly tags: readonly string[];
  readonly sshConfig: Readonly<SSHConnectOptions>;
  readonly terminalConfig?: Readonly<Partial<TerminalCreateOptions>>;
  readonly timestamps: Readonly<ConnectionProfileTimestamps>;
}

export interface ConnectionStoreChangeEvent {
  readonly type: 'added' | 'updated' | 'removed';
  readonly profileId: string;
}

export interface HostKeyPromptPayload {
  readonly host: string;
  readonly port: number;
  readonly fingerprint: string;
  readonly isChanged: boolean;
}

export type SSHStatusChangePayload =
  | EventPayloadMap['ssh.connecting']
  | EventPayloadMap['ssh.connected']
  | EventPayloadMap['ssh.disconnected']
  | EventPayloadMap['ssh.error'];

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

// AI types
export interface AIMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface AIModelInfo {
  readonly id: string;
  readonly name: string;
  readonly contextLength?: number;
  readonly pricing?: { readonly prompt: number; readonly completion: number };
}

export interface AIProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly models: readonly AIModelInfo[];
}

export interface AICompletionRequest {
  readonly model: string;
  readonly messages: readonly AIMessage[];
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly context?: AICommandContext;
  /** Main-process only: aborts in-flight HTTP when streaming (ignored from renderer). */
  readonly signal?: AbortSignal;
}

export interface AICommandContext {
  readonly shell: string;
  readonly os: string;
  readonly cwd: string;
  readonly recentCommands?: readonly string[];
  readonly recentOutput?: string;
}

export interface AICompletionResponse {
  readonly content: string;
  readonly model: string;
  readonly usage?: { readonly promptTokens: number; readonly completionTokens: number; readonly totalTokens: number };
  readonly finishReason?: string;
}

export interface AIStreamChunk {
  readonly content: string;
  readonly done: boolean;
  readonly model?: string;
  readonly finishReason?: string;
}

/** Pluggable AI backend (OpenRouter, local, etc.). */
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly models: readonly AIModelInfo[];

  complete(request: Readonly<AICompletionRequest>): Promise<AICompletionResponse>;

  stream(request: Readonly<AICompletionRequest>): AsyncIterable<AIStreamChunk>;
}

export interface IAIProviderService {
  registerProvider(provider: AIProvider): Disposable;

  listProviders(): readonly AIProviderInfo[];

  getActiveProvider(): AIProvider;

  setActiveProvider(providerId: string): void;

  complete(request: Readonly<AICompletionRequest>): Promise<AICompletionResponse>;

  stream(request: Readonly<AICompletionRequest>): AsyncIterable<AIStreamChunk>;
}

export interface AIGenerateCommandResult {
  readonly command: string;
  readonly explanation?: string;
}

export interface ConversationInfo {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messageCount: number;
}

export interface AISettings {
  readonly activeProviderId: string;
  readonly defaultModel: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly systemPrompt: string;
  readonly includeContext: boolean;
  readonly recentCommandsCount: number;
  readonly includeRecentOutput: boolean;
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
  ssh: {
    connect(options: Readonly<SSHConnectOptions>): Promise<SSHSessionInfo>;
    disconnect(sessionId: string): Promise<void>;
    listSessions(): Promise<readonly SSHSessionInfo[]>;
    getSession(sessionId: string): Promise<SSHSessionInfo | null>;
    exec(sessionId: string, command: string): Promise<ExecResult>;
    forwardPort(options: Readonly<PortForwardOptions>): Promise<PortForwardInfo>;
    closeForward(sessionId: string, forwardId: string): Promise<void>;
    listForwards(sessionId: string): Promise<readonly PortForwardInfo[]>;
    hostKeyVerify(request: Readonly<{ readonly sessionId: string; readonly verified: boolean }>): Promise<void>;
    hostKeyAccept(request: Readonly<{ readonly sessionId: string }>): Promise<void>;
    onStatusChange(callback: (payload: Readonly<SSHStatusChangePayload>) => void): () => void;
    onHostKeyPrompt(callback: (payload: Readonly<HostKeyPromptPayload>) => void): () => void;
    onPasswordPrompt(callback: (payload: Readonly<{ readonly sessionId: string }>) => void): () => void;
  };
  sftp: {
    list(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<readonly SFTPFileEntry[]>;
    stat(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<SFTPFileStat>;
    mkdir(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<void>;
    rmdir(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<void>;
    unlink(request: Readonly<{ readonly sessionId: string; readonly remotePath: string }>): Promise<void>;
    rename(
      request: Readonly<{ readonly sessionId: string; readonly fromPath: string; readonly toPath: string }>
    ): Promise<void>;
    upload(options: Readonly<SFTPTransferOptions>): Promise<SFTPTransferResult>;
    download(options: Readonly<SFTPTransferOptions>): Promise<SFTPTransferResult>;
    cancelTransfer(transferId: string): Promise<void>;
    retryTransfer(transferId: string): Promise<SFTPTransferResult>;
    listTransfers(): Promise<readonly SFTPQueueTaskInfo[]>;
    clearCompleted(): Promise<void>;
    onTransferProgress(callback: (payload: Readonly<SFTPTransferProgress>) => void): () => void;
    onTransferComplete(callback: (payload: Readonly<SFTPTransferResult>) => void): () => void;
  };
  connections: {
    list(): Promise<readonly ConnectionProfile[]>;
    get(profileId: string): Promise<ConnectionProfile | null>;
    save(profile: Readonly<ConnectionProfile>): Promise<void>;
    remove(profileId: string): Promise<void>;
    importData(data: string): Promise<void>;
    exportData(): Promise<string>;
    onChanged(callback: (payload: Readonly<ConnectionStoreChangeEvent>) => void): () => void;
  };
  events: {
    onEvent<T extends EventType>(
      type: T,
      callback: (payload: EventPayloadMap[T]) => void
    ): () => void;
  };
  local: {
    readDirectory(absolutePath: string): Promise<readonly LocalDirEntry[]>;
  };
  ai: {
    complete(request: AICompletionRequest): Promise<AICompletionResponse>;
    generateCommand(prompt: string, context?: AICommandContext, sessionId?: string): Promise<AIGenerateCommandResult>;
    streamStart(
      request: AICompletionRequest,
      options?: Readonly<{ conversationId?: string; messages?: readonly AIMessage[] }>,
    ): Promise<string>;
    streamCancel(streamId: string): Promise<void>;
    onStreamChunk(callback: (payload: { streamId: string; chunk: AIStreamChunk }) => void): () => void;
    listProviders(): Promise<AIProviderInfo[]>;
    setActiveProvider(providerId: string): Promise<void>;
    listModels(): Promise<AIModelInfo[]>;
    setApiKey(providerId: string, apiKey: string): Promise<void>;
    getSettings(): Promise<AISettings>;
    updateSettings(settings: Partial<AISettings>): Promise<void>;
    listConversations(): Promise<ConversationInfo[]>;
    getConversation(id: string): Promise<{ id: string; messages: AIMessage[] } | null>;
    deleteConversation(id: string): Promise<void>;
  };
  marketplace: {
    search(query: string, page?: number): Promise<MarketplaceSearchResult>;
    getDetails(name: string): Promise<RegistryEntry | null>;
    install(name: string, version?: string): Promise<void>;
    uninstall(extensionId: string): Promise<void>;
    update(extensionId: string): Promise<void>;
    onInstallProgress(callback: (progress: InstallProgress) => void): () => void;
  };
  extensions: {
    list(): Promise<InstalledExtension[]>;
    enable(extensionId: string): Promise<void>;
    disable(extensionId: string): Promise<void>;
    getPermissions(extensionId: string): Promise<PermissionGrant[]>;
    revokePermission(extensionId: string, permission: Permission): Promise<void>;
    onPermissionPrompt(callback: (prompt: PermissionPrompt) => void): () => void;
    respondToPermissionPrompt(extensionId: string, granted: boolean): Promise<void>;
    onExtensionStateChanged(callback: (payload: Readonly<{ extensionId: string }>) => void): () => void;
  };
}

declare global {
  interface Window {
    readonly api: PreloadAPI;
  }
}
