import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { ipcMain, shell, type BrowserWindow } from 'electron';
import { IpcChannels, IpcEventChannels } from '@terminalmind/api';
import type {
  CommandInfo,
  ConnectionStoreChangeEvent,
  ExecResult,
  InstalledExtension,
  LocalDirEntry,
  Permission,
  PortForwardInfo,
  PortForwardOptions,
  SFTPFileEntry,
  SFTPQueueTaskInfo,
  SFTPTransferOptions,
  SFTPTransferProgress,
  SFTPTransferResult,
  SSHConnectOptions,
  SSHSessionInfo,
  SSHStatusChangePayload,
  TerminalCreateOptions,
  TerminalSessionInfo,
  AICommandContext,
  AICompletionRequest,
  AISettings,
} from '@terminalmind/api';
import type { ICommandRegistry, IEventBus } from '@terminalmind/core';
import type {
  ConnectionProfile as ServiceConnectionProfile,
  FileEntry,
  IConnectionStore,
  IHostKeyStore,
  ISSHService,
  ISFTPChannel,
  IShellDiscoveryAdapter,
  ITerminalService,
  PortForward,
  SSHConnectionConfig,
  SSHSession,
  TerminalSession,
  TransferTask,
} from '@terminalmind/services';
import {
  AIProviderService,
  AiSecretStore,
  ContextCollector,
  ConversationStore,
  createAICommandPipeline,
  OpenRouterProvider,
  PipelineEngineImpl,
  PermissionManager,
  TransferQueue,
  type IConfigService,
  type MarketplaceService,
} from '@terminalmind/services';

const configStore = new Map<string, unknown>();

const OPENROUTER_PROVIDER_ID = 'openrouter';

const terminalLineAccumulator = new Map<string, string>();
const terminalCommandHistory = new Map<string, string[]>();
const terminalOutputSnippets = new Map<string, string>();
const MAX_COMMAND_HISTORY = 200;
const MAX_OUTPUT_SNIPPET_CHARS = 8000;

function appendTerminalCommands(sessionId: string, data: string): void {
  let acc = terminalLineAccumulator.get(sessionId) ?? '';
  acc += data;
  const parts = acc.split(/\r?\n/);
  const tail = parts.pop() ?? '';
  terminalLineAccumulator.set(sessionId, tail);
  for (const part of parts) {
    const t = part.replace(/\r/g, '').trim();
    if (t.length > 0) {
      const list = terminalCommandHistory.get(sessionId) ?? [];
      list.push(t);
      while (list.length > MAX_COMMAND_HISTORY) {
        list.shift();
      }
      terminalCommandHistory.set(sessionId, list);
    }
  }
}

function appendTerminalOutput(sessionId: string, data: string): void {
  const prev = terminalOutputSnippets.get(sessionId) ?? '';
  terminalOutputSnippets.set(sessionId, (prev + data).slice(-MAX_OUTPUT_SNIPPET_CHARS));
}

function clearTerminalBuffers(sessionId: string): void {
  terminalLineAccumulator.delete(sessionId);
  terminalCommandHistory.delete(sessionId);
  terminalOutputSnippets.delete(sessionId);
}

function readAiSettings(config: IConfigService): AISettings {
  return {
    activeProviderId: config.get('ai.activeProviderId', OPENROUTER_PROVIDER_ID),
    defaultModel: config.get('ai.defaultModel', 'openai/gpt-4o-mini'),
    temperature: config.get('ai.temperature', 0.7),
    maxTokens: config.get('ai.maxTokens', 2048),
    systemPrompt: config.get('ai.systemPrompt', ''),
    includeContext: config.get('ai.includeContext', true),
    recentCommandsCount: config.get('ai.recentCommandsCount', 5),
    includeRecentOutput: config.get('ai.includeRecentOutput', false),
  };
}

async function buildTerminalAiContext(
  opts: Readonly<{
    sessionId?: string;
    settings: AISettings;
    contextCollector: ContextCollector;
    terminalService: ITerminalService;
    sshTerminals: ReadonlyMap<string, { readonly term: TerminalSession; readonly sshSessionId: string }>;
  }>,
): Promise<AICommandContext> {
  const { sessionId, settings, contextCollector, terminalService, sshTerminals: sshTerms } = opts;
  let cwd = process.cwd();
  if (sessionId) {
    const local = terminalService.getSession(sessionId);
    if (local) {
      cwd = (local as unknown as { cwd: string }).cwd;
    } else {
      const sshT = sshTerms.get(sessionId);
      if (sshT) {
        cwd = (sshT.term as unknown as { cwd: string }).cwd;
      }
    }
  }
  const n = Math.max(0, Math.min(50, settings.recentCommandsCount));
  const recentCommands =
    sessionId && n > 0 ? (terminalCommandHistory.get(sessionId) ?? []).slice(-n) : [];
  const recentOutput =
    settings.includeRecentOutput && sessionId ? (terminalOutputSnippets.get(sessionId) ?? '') : '';
  return contextCollector.collect({ cwd, recentCommands, recentOutput });
}

export interface AiMainServices {
  readonly aiProvider: AIProviderService;
  readonly aiSecrets: AiSecretStore;
  readonly conversationStore: ConversationStore;
  readonly contextCollector: ContextCollector;
  readonly config: IConfigService;
  readonly pipelineEngine: PipelineEngineImpl;
  readonly commandPipeline: ReturnType<typeof createAICommandPipeline>;
}

const activeAiStreams = new Map<string, AbortController>();

function stripClientSignal(request: Readonly<AICompletionRequest>): Omit<AICompletionRequest, 'signal'> {
  const { signal: _ignored, ...rest } = request;
  return rest;
}

async function runAiStream(
  mainWindow: BrowserWindow,
  streamId: string,
  request: AICompletionRequest,
  signal: AbortSignal,
  aiProvider: AIProviderService,
): Promise<void> {
  try {
    const streamRequest: AICompletionRequest = { ...request, signal };
    for await (const chunk of aiProvider.stream(streamRequest)) {
      if (signal.aborted) {
        break;
      }
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IpcEventChannels.AI_STREAM_CHUNK, { streamId, chunk });
      }
      if (chunk.done) {
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!mainWindow.isDestroyed() && !signal.aborted) {
      mainWindow.webContents.send(IpcEventChannels.AI_STREAM_CHUNK, {
        streamId,
        chunk: { content: `\n\n[Error] ${msg}`, done: true },
      });
    }
  } finally {
    activeAiStreams.delete(streamId);
  }
}

function normalizeSavedConnectionProfile(input: unknown): ServiceConnectionProfile {
  const p = input as Record<string, unknown>;
  const ts = p.timestamps as Record<string, unknown> | undefined;
  const createdAt =
    typeof p.createdAt === 'number'
      ? p.createdAt
      : ts && typeof ts.createdAt === 'number'
        ? ts.createdAt
        : Date.now();
  const updatedAt =
    typeof p.updatedAt === 'number'
      ? p.updatedAt
      : ts && typeof ts.updatedAt === 'number'
        ? ts.updatedAt
        : Date.now();
  const { timestamps: _ignored, ...rest } = p;
  return { ...rest, createdAt, updatedAt } as ServiceConnectionProfile;
}

/** PTY terminal sessions backed by an SSH shell (not in TerminalService). */
const sshTerminals = new Map<string, { readonly term: TerminalSession; readonly sshSessionId: string }>();

const sshForwards = new Map<string, { readonly forward: PortForward; readonly info: PortForwardInfo }>();

function apiSshOptionsToServiceConfig(opts: Readonly<SSHConnectOptions>): SSHConnectionConfig {
  return {
    host: opts.host,
    port: opts.port,
    username: opts.username,
    auth: opts.auth,
    ...(opts.jumpHosts !== undefined
      ? { jumpHosts: opts.jumpHosts.map((j) => apiSshOptionsToServiceConfig(j)) }
      : {}),
    ...(opts.keepAlive === true ? { keepAliveInterval: 30_000, keepaliveCountMax: 3 } : {}),
    ...(opts.readyTimeout !== undefined ? { readyTimeout: opts.readyTimeout } : {}),
  };
}

function toSSHSessionInfo(session: SSHSession, terminalSessionId?: string): SSHSessionInfo {
  return {
    id: session.id,
    host: session.config.host,
    port: session.config.port,
    username: session.config.username,
    status: session.status,
    connectedAt: session.connectedAt,
    error: session.error,
    ...(terminalSessionId !== undefined ? { terminalSessionId } : {}),
  };
}

async function removeSshForwardsForSession(sessionId: string): Promise<void> {
  for (const [fid, row] of [...sshForwards.entries()]) {
    if (row.info.sessionId === sessionId) {
      await row.forward.close().catch(() => undefined);
      sshForwards.delete(fid);
    }
  }
}

function wireTerminalSessionToRenderer(
  mainWindow: BrowserWindow,
  sshService: ISSHService,
  session: TerminalSession,
  onSftpCleanup?: (sshSessionId: string) => void,
  onPtyData?: (sessionId: string, data: string) => void,
): void {
  let buffer = '';
  let flushScheduled = false;
  session.onData((data) => {
    buffer += data;
    if (!flushScheduled) {
      flushScheduled = true;
      setImmediate(() => {
        if (!mainWindow.isDestroyed()) {
          const chunk = buffer;
          mainWindow.webContents.send(IpcEventChannels.PTY_DATA, {
            sessionId: session.id,
            data: chunk,
          });
          onPtyData?.(session.id, chunk);
        }
        buffer = '';
        flushScheduled = false;
      });
    }
  });
  session.onExit((e) => {
    clearTerminalBuffers(session.id);
    const sshEntry = sshTerminals.get(session.id);
    if (sshEntry) {
      sshTerminals.delete(session.id);
      onSftpCleanup?.(sshEntry.sshSessionId);
      void removeSshForwardsForSession(sshEntry.sshSessionId);
      void sshService.disconnect(sshEntry.sshSessionId);
    }
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcEventChannels.EVENT_BROADCAST, {
        type: 'terminal.exited',
        payload: { sessionId: session.id, exitCode: e.exitCode },
      });
    }
  });
}

function toSessionInfo(session: TerminalSession): TerminalSessionInfo {
  return {
    id: session.id,
    title: session.title,
    pid: session.pid,
    shellPath: session.shellPath,
    status: session.status,
    exitCode: session.exitCode,
    createdAt: session.createdAt,
  };
}

function fileEntryToApi(entry: FileEntry): SFTPFileEntry {
  return {
    filename: entry.filename,
    longname: entry.longname,
    attrs: {
      mode: entry.attrs.mode,
      uid: entry.attrs.uid,
      gid: entry.attrs.gid,
      size: entry.attrs.size,
      atime: entry.attrs.atime,
      mtime: entry.attrs.mtime,
    },
  };
}

function taskFilename(task: TransferTask): string {
  return task.direction === 'upload' ? basename(task.localPath) : basename(task.remotePath);
}

function taskToQueueInfo(task: TransferTask): SFTPQueueTaskInfo {
  const base: SFTPQueueTaskInfo = {
    id: task.id,
    sshSessionId: task.sshSessionId,
    direction: task.direction,
    localPath: task.localPath,
    remotePath: task.remotePath,
    filename: taskFilename(task),
    status: task.status,
    progress: task.progress,
    bytesTransferred: task.bytesTransferred,
    totalBytes: task.totalBytes,
  };
  if (task.error !== undefined) {
    return { ...base, error: task.error };
  }
  return base;
}

const BUILTIN_INSTALLED_EXTENSIONS: readonly InstalledExtension[] = (() => {
  const now = Date.now();
  const mk = (
    id: string,
    displayName: string,
    pkg: string,
    desc: string,
  ): InstalledExtension => ({
    id,
    manifest: {
      name: pkg,
      displayName,
      version: '0.1.0',
      description: desc,
      author: 'TerminalMind',
      terminalmind: { entry: './dist/index.js', activationEvents: ['*'] },
    },
    installPath: `builtin://${id}`,
    installedAt: now,
    updatedAt: now,
    enabled: true,
    isBuiltin: true,
  });
  return [
    mk('ext-terminal', 'Terminal', '@terminalmind/ext-terminal', 'Built-in terminal integration'),
    mk('ext-ai', 'AI', '@terminalmind/ext-ai', 'Built-in AI features'),
    mk('ext-ssh', 'SSH', '@terminalmind/ext-ssh', 'Built-in SSH client'),
    mk('ext-sftp', 'SFTP', '@terminalmind/ext-sftp', 'Built-in SFTP browser'),
    mk('ext-connections', 'Connections', '@terminalmind/ext-connections', 'Built-in connection profiles'),
  ];
})();

const BUILTIN_EXTENSION_IDS = new Set(BUILTIN_INSTALLED_EXTENSIONS.map((e) => e.id));

function taskToProgress(task: TransferTask): SFTPTransferProgress {
  const base: SFTPTransferProgress = {
    transferId: task.id,
    filename: taskFilename(task),
    direction: task.direction,
    bytesTransferred: task.bytesTransferred,
    totalBytes: task.totalBytes,
    percentage: task.progress,
  };
  return { ...base, sshSessionId: task.sshSessionId };
}

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  terminalService: ITerminalService,
  shellDiscovery: IShellDiscoveryAdapter,
  commandRegistry: ICommandRegistry,
  sshService: ISSHService,
  eventBus: IEventBus,
  connectionStore: IConnectionStore,
  _hostKeyStore: IHostKeyStore,
  permissionManager: PermissionManager,
  ai: AiMainServices,
  marketplaceService: MarketplaceService,
): void {
  connectionStore.onChange((event: Readonly<ConnectionStoreChangeEvent>) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcEventChannels.CONNECTION_CHANGED, event);
    }
  });

  ipcMain.handle(
    IpcChannels.PERMISSION_PROMPT_RESULT,
    async (_event, args: Readonly<{ extensionId: string; granted: boolean }>) => {
      permissionManager.handlePromptResult(args.extensionId, args.granted);
    },
  );

  commandRegistry.register({
    id: 'window.minimize',
    title: 'Minimize Window',
    category: 'Window',
    handler: async () => {
      mainWindow.minimize();
    },
  });
  commandRegistry.register({
    id: 'window.maximize',
    title: 'Maximize Window',
    category: 'Window',
    handler: async () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    },
  });
  commandRegistry.register({
    id: 'window.close',
    title: 'Close Window',
    category: 'Window',
    handler: async () => {
      mainWindow.close();
    },
  });

  commandRegistry.register({
    id: 'extensions.openDirectory',
    title: 'Open Extensions Folder',
    category: 'Extensions',
    handler: async () => {
      await shell.openPath(marketplaceService.extensionsRoot);
    },
  });

  ipcMain.handle(IpcChannels.TERMINAL_CREATE, async (_event, options: TerminalCreateOptions) => {
    try {
      const session = await terminalService.create(options);
      wireTerminalSessionToRenderer(mainWindow, sshService, session, undefined, appendTerminalOutput);
      return toSessionInfo(session);
    } catch (err) {
      console.error('Failed to create terminal session:', err);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.TERMINAL_DESTROY, async (_event, args: { sessionId: string }) => {
    clearTerminalBuffers(args.sessionId);
    const sshEntry = sshTerminals.get(args.sessionId);
    if (sshEntry) {
      sshTerminals.delete(args.sessionId);
      sshEntry.term.kill();
      await removeSshForwardsForSession(sshEntry.sshSessionId);
      await sshService.disconnect(sshEntry.sshSessionId);
      return;
    }
    if (terminalService.getSession(args.sessionId)) {
      await terminalService.destroy(args.sessionId);
    }
  });

  ipcMain.handle(IpcChannels.TERMINAL_LIST, async () => {
    return terminalService.listSessions().map(toSessionInfo);
  });

  ipcMain.handle(IpcChannels.TERMINAL_RESIZE, async (_event, args: { sessionId: string; cols: number; rows: number }) => {
    const local = terminalService.getSession(args.sessionId);
    if (local) {
      local.resize(args.cols, args.rows);
      return;
    }
    const sshT = sshTerminals.get(args.sessionId);
    if (sshT) {
      sshT.term.resize(args.cols, args.rows);
    }
  });

  ipcMain.handle(IpcChannels.TERMINAL_GET_SESSION, async (_event, args: { sessionId: string }) => {
    const session = terminalService.getSession(args.sessionId);
    return session ? toSessionInfo(session) : null;
  });

  ipcMain.handle(IpcChannels.SHELL_DISCOVER, async () => {
    return shellDiscovery.discoverShells();
  });

  ipcMain.handle(IpcChannels.SHELL_GET_DEFAULT, async () => {
    return shellDiscovery.getDefaultShell();
  });

  ipcMain.handle(IpcChannels.COMMAND_EXECUTE, async (_event, args: { id: string; args?: unknown }) => {
    return commandRegistry.execute(args.id, args.args);
  });

  ipcMain.handle(IpcChannels.COMMAND_LIST, async () => {
    return commandRegistry.getCommands().map((c): CommandInfo => ({
      id: c.id,
      title: c.title,
      category: c.category,
    }));
  });

  ipcMain.handle(IpcChannels.CONFIG_GET, async (_event, args: { key: string; defaultValue: unknown }) => {
    if (configStore.has(args.key)) {
      return configStore.get(args.key) as unknown;
    }
    return args.defaultValue;
  });

  ipcMain.handle(IpcChannels.CONFIG_SET, async (_event, args: { key: string; value: unknown }) => {
    configStore.set(args.key, args.value);
  });

  ipcMain.on(IpcEventChannels.PTY_INPUT, (_event, payload: { sessionId: string; data: string }) => {
    appendTerminalCommands(payload.sessionId, payload.data);
    const local = terminalService.getSession(payload.sessionId);
    if (local) {
      local.write(payload.data);
      return;
    }
    const sshT = sshTerminals.get(payload.sessionId);
    if (sshT) {
      sshT.term.write(payload.data);
    }
  });

  const sftpChannels = new Map<string, ISFTPChannel>();

  function disposeSftp(sshSessionId: string): void {
    const ch = sftpChannels.get(sshSessionId);
    if (ch) {
      ch.close();
      sftpChannels.delete(sshSessionId);
    }
  }

  async function getOrOpenSftp(sshSessionId: string): Promise<ISFTPChannel | undefined> {
    const existing = sftpChannels.get(sshSessionId);
    if (existing) {
      return existing;
    }
    const ssh = sshService.getSession(sshSessionId);
    if (!ssh || ssh.status !== 'connected') {
      return undefined;
    }
    try {
      const ch = await ssh.sftp();
      sftpChannels.set(sshSessionId, ch);
      return ch;
    } catch {
      return undefined;
    }
  }

  const transferQueue = new TransferQueue((sid) => sftpChannels.get(sid), 3);

  const forwardSshStatus = (payload: SSHStatusChangePayload) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcEventChannels.SSH_STATUS_CHANGE, payload);
    }
  };

  eventBus.on('ssh.connecting', (p) => forwardSshStatus(p));
  eventBus.on('ssh.connected', (p) => forwardSshStatus(p));
  eventBus.on('ssh.disconnected', (p) => {
    disposeSftp(p.sessionId);
    forwardSshStatus(p);
  });
  eventBus.on('ssh.error', (p) => {
    disposeSftp(p.sessionId);
    forwardSshStatus(p);
  });

  transferQueue.onTaskUpdate((task) => {
    if (mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(IpcEventChannels.SFTP_TRANSFER_PROGRESS, taskToProgress(task));
    if (task.status === 'completed' || task.status === 'failed') {
      const result: SFTPTransferResult = {
        transferId: task.id,
        success: task.status === 'completed',
        ...(task.error !== undefined ? { error: task.error } : {}),
      };
      mainWindow.webContents.send(IpcEventChannels.SFTP_TRANSFER_COMPLETE, result);
    }
  });

  ipcMain.handle(IpcChannels.SSH_CONNECT, async (_event, options: SSHConnectOptions) => {
    const config = apiSshOptionsToServiceConfig(options);
    const sshSession = await sshService.connect(config);
    try {
      const term = await sshSession.shell();
      sshTerminals.set(term.id, { term, sshSessionId: sshSession.id });
      wireTerminalSessionToRenderer(mainWindow, sshService, term, disposeSftp, appendTerminalOutput);
      return toSSHSessionInfo(sshSession, term.id);
    } catch (e) {
      await sshService.disconnect(sshSession.id);
      throw e;
    }
  });

  ipcMain.handle(IpcChannels.SSH_DISCONNECT, async (_event, args: { sessionId: string }) => {
    disposeSftp(args.sessionId);
    for (const [termId, entry] of [...sshTerminals.entries()]) {
      if (entry.sshSessionId === args.sessionId) {
        sshTerminals.delete(termId);
        entry.term.kill();
      }
    }
    await removeSshForwardsForSession(args.sessionId);
    await sshService.disconnect(args.sessionId);
  });

  ipcMain.handle(IpcChannels.SSH_LIST_SESSIONS, async () => {
    return sshService.listSessions().map((s) => {
      const termId = [...sshTerminals.entries()].find(([, v]) => v.sshSessionId === s.id)?.[0];
      return toSSHSessionInfo(s, termId);
    });
  });

  ipcMain.handle(IpcChannels.SSH_GET_SESSION, async (_event, args: { sessionId: string }) => {
    const s = sshService.getSession(args.sessionId);
    if (!s) {
      return null;
    }
    const termId = [...sshTerminals.entries()].find(([, v]) => v.sshSessionId === s.id)?.[0];
    return toSSHSessionInfo(s, termId);
  });

  ipcMain.handle(IpcChannels.SSH_EXEC, async (_event, args: { sessionId: string; command: string }) => {
    const s = sshService.getSession(args.sessionId);
    if (!s) {
      throw new Error('SSH session not found');
    }
    const r = await s.exec(args.command);
    const out: ExecResult = {
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
    };
    return out;
  });

  ipcMain.handle(IpcChannels.SSH_FORWARD_PORT, async (_event, options: PortForwardOptions) => {
    const s = sshService.getSession(options.sessionId);
    if (!s) {
      throw new Error('SSH session not found');
    }
    const pf = await s.forwardPort({
      localPort: options.localPort,
      remoteHost: options.remoteHost,
      remotePort: options.remotePort,
    });
    const info: PortForwardInfo = {
      id: pf.id,
      sessionId: options.sessionId,
      localHost: options.localHost,
      localPort: pf.localPort,
      remoteHost: pf.remoteHost,
      remotePort: pf.remotePort,
    };
    sshForwards.set(pf.id, { forward: pf, info });
    return info;
  });

  ipcMain.handle(IpcChannels.SSH_CLOSE_FORWARD, async (_event, args: { sessionId: string; forwardId: string }) => {
    const row = sshForwards.get(args.forwardId);
    if (!row || row.info.sessionId !== args.sessionId) {
      return;
    }
    await row.forward.close();
    sshForwards.delete(args.forwardId);
  });

  ipcMain.handle(IpcChannels.SSH_LIST_FORWARDS, async (_event, args: { sessionId: string }) => {
    return [...sshForwards.values()].filter((r) => r.info.sessionId === args.sessionId).map((r) => r.info);
  });

  ipcMain.handle(IpcChannels.SSH_HOST_KEY_VERIFY, async () => undefined);
  ipcMain.handle(IpcChannels.SSH_HOST_KEY_ACCEPT, async () => undefined);

  ipcMain.handle(
    IpcChannels.SFTP_LIST,
    async (_event, args: { sessionId: string; remotePath: string }) => {
      const ch = await getOrOpenSftp(args.sessionId);
      if (!ch) {
        throw new Error('SFTP not available for this session');
      }
      const entries = await ch.list(args.remotePath);
      return entries.map(fileEntryToApi);
    },
  );

  ipcMain.handle(
    IpcChannels.SFTP_STAT,
    async (_event, args: { sessionId: string; remotePath: string }) => {
      const ch = await getOrOpenSftp(args.sessionId);
      if (!ch) {
        throw new Error('SFTP not available for this session');
      }
      const st = await ch.stat(args.remotePath);
      return {
        mode: st.mode,
        uid: st.uid,
        gid: st.gid,
        size: st.size,
        atime: st.atime,
        mtime: st.mtime,
      };
    },
  );

  ipcMain.handle(
    IpcChannels.SFTP_MKDIR,
    async (_event, args: { sessionId: string; remotePath: string }) => {
      const ch = await getOrOpenSftp(args.sessionId);
      if (!ch) {
        throw new Error('SFTP not available for this session');
      }
      await ch.mkdir(args.remotePath);
    },
  );

  ipcMain.handle(
    IpcChannels.SFTP_RMDIR,
    async (_event, args: { sessionId: string; remotePath: string }) => {
      const ch = await getOrOpenSftp(args.sessionId);
      if (!ch) {
        throw new Error('SFTP not available for this session');
      }
      await ch.rmdir(args.remotePath);
    },
  );

  ipcMain.handle(
    IpcChannels.SFTP_UNLINK,
    async (_event, args: { sessionId: string; remotePath: string }) => {
      const ch = await getOrOpenSftp(args.sessionId);
      if (!ch) {
        throw new Error('SFTP not available for this session');
      }
      await ch.unlink(args.remotePath);
    },
  );

  ipcMain.handle(
    IpcChannels.SFTP_RENAME,
    async (_event, args: { sessionId: string; fromPath: string; toPath: string }) => {
      const ch = await getOrOpenSftp(args.sessionId);
      if (!ch) {
        throw new Error('SFTP not available for this session');
      }
      await ch.rename(args.fromPath, args.toPath);
    },
  );

  ipcMain.handle(IpcChannels.SFTP_UPLOAD, async (_event, opts: SFTPTransferOptions) => {
    const id = transferQueue.enqueue({
      sshSessionId: opts.sessionId,
      direction: 'upload',
      localPath: opts.localPath,
      remotePath: opts.remotePath,
    });
    return { transferId: id, success: true } satisfies SFTPTransferResult;
  });

  ipcMain.handle(IpcChannels.SFTP_DOWNLOAD, async (_event, opts: SFTPTransferOptions) => {
    const id = transferQueue.enqueue({
      sshSessionId: opts.sessionId,
      direction: 'download',
      localPath: opts.localPath,
      remotePath: opts.remotePath,
    });
    return { transferId: id, success: true } satisfies SFTPTransferResult;
  });

  ipcMain.handle(IpcChannels.SFTP_CANCEL_TRANSFER, async (_event, args: { transferId: string }) => {
    transferQueue.cancel(args.transferId);
  });

  ipcMain.handle(IpcChannels.SFTP_RETRY_TRANSFER, async (_event, args: { transferId: string }) => {
    transferQueue.retry(args.transferId);
    return { transferId: args.transferId, success: true } satisfies SFTPTransferResult;
  });

  ipcMain.handle(IpcChannels.SFTP_LIST_TRANSFERS, async () => {
    return transferQueue.listTasks().map(taskToQueueInfo);
  });

  ipcMain.handle(IpcChannels.SFTP_CLEAR_COMPLETED, async () => {
    transferQueue.clearCompleted();
  });

  ipcMain.handle(IpcChannels.LOCAL_READ_DIRECTORY, async (_event, args: { absolutePath: string }) => {
    const entries = await readdir(args.absolutePath, { withFileTypes: true });
    const out: LocalDirEntry[] = [];
    for (const e of entries) {
      const full = join(args.absolutePath, e.name);
      try {
        const s = await stat(full);
        out.push({
          name: e.name,
          isDirectory: e.isDirectory(),
          size: s.isDirectory() ? 0 : s.size,
          mtimeMs: s.mtimeMs,
        });
      } catch {
        /* skip broken entries */
      }
    }
    out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    return out;
  });

  ipcMain.handle(IpcChannels.CONNECTIONS_LIST, async () => connectionStore.list());

  ipcMain.handle(IpcChannels.CONNECTIONS_GET, async (_event, args: { profileId: string }) => {
    const profile = await connectionStore.get(args.profileId);
    return profile ?? null;
  });

  ipcMain.handle(IpcChannels.CONNECTIONS_SAVE, async (_event, profile: unknown) => {
    await connectionStore.save(normalizeSavedConnectionProfile(profile));
  });

  ipcMain.handle(IpcChannels.CONNECTIONS_REMOVE, async (_event, args: { profileId: string }) => {
    await connectionStore.remove(args.profileId);
  });

  ipcMain.handle(IpcChannels.CONNECTIONS_IMPORT, async (_event, args: { data: string }) => {
    await connectionStore.import(args.data, 'json');
  });

  ipcMain.handle(IpcChannels.CONNECTIONS_EXPORT, async () => {
    const all = await connectionStore.list();
    return connectionStore.export(
      all.map((p: ServiceConnectionProfile) => p.id),
      'json',
    );
  });

  ipcMain.handle(IpcChannels.AI_COMPLETE, async (_event, request: AICompletionRequest) => {
    const s = readAiSettings(ai.config);
    const base = stripClientSignal(request);
    const merged: AICompletionRequest = {
      ...base,
      model: base.model || s.defaultModel,
      temperature: base.temperature ?? s.temperature,
      maxTokens: base.maxTokens ?? s.maxTokens,
      systemPrompt:
        base.systemPrompt ?? (s.systemPrompt.trim().length > 0 ? s.systemPrompt : undefined),
    };
    return ai.aiProvider.complete(merged);
  });

  ipcMain.handle(
    IpcChannels.AI_GENERATE_COMMAND,
    async (
      _event,
      args: Readonly<{ prompt: string; context?: AICommandContext; sessionId?: string }>,
    ) => {
      const settings = readAiSettings(ai.config);
      const ctx =
        settings.includeContext === true
          ? await buildTerminalAiContext({
              sessionId: args.sessionId,
              settings,
              contextCollector: ai.contextCollector,
              terminalService,
              sshTerminals,
            })
          : args.context;
      return ai.pipelineEngine.execute(ai.commandPipeline, {
        prompt: args.prompt,
        context: ctx,
        model: settings.defaultModel,
      });
    },
  );

  ipcMain.handle(IpcChannels.AI_STREAM_START, async (_event, request: AICompletionRequest) => {
    const streamId = randomUUID();
    const s = readAiSettings(ai.config);
    const base = stripClientSignal(request);
    const merged: AICompletionRequest = {
      ...base,
      model: base.model || s.defaultModel,
      temperature: base.temperature ?? s.temperature,
      maxTokens: base.maxTokens ?? s.maxTokens,
      systemPrompt:
        base.systemPrompt ?? (s.systemPrompt.trim().length > 0 ? s.systemPrompt : undefined),
    };
    const ac = new AbortController();
    activeAiStreams.set(streamId, ac);
    void runAiStream(mainWindow, streamId, merged, ac.signal, ai.aiProvider);
    return streamId;
  });

  ipcMain.handle(IpcChannels.AI_STREAM_CANCEL, async (_event, args: Readonly<{ streamId: string }>) => {
    activeAiStreams.get(args.streamId)?.abort();
  });

  ipcMain.handle(IpcChannels.AI_LIST_PROVIDERS, async () => [...ai.aiProvider.listProviders()]);

  ipcMain.handle(
    IpcChannels.AI_SET_ACTIVE_PROVIDER,
    async (_event, args: Readonly<{ providerId: string }>) => {
      ai.aiProvider.setActiveProvider(args.providerId);
    },
  );

  ipcMain.handle(IpcChannels.AI_LIST_MODELS, async () => {
    const p = ai.aiProvider.getActiveProvider();
    if (p instanceof OpenRouterProvider) {
      try {
        await p.listModels();
      } catch {
        /* return cached or empty */
      }
    }
    return [...p.models];
  });

  ipcMain.handle(
    IpcChannels.AI_SET_API_KEY,
    async (_event, args: Readonly<{ providerId: string; apiKey: string }>) => {
      await ai.aiSecrets.setApiKey(args.providerId, args.apiKey);
    },
  );

  ipcMain.handle(IpcChannels.AI_GET_SETTINGS, async () => readAiSettings(ai.config));

  ipcMain.handle(
    IpcChannels.AI_UPDATE_SETTINGS,
    async (_event, partial: Readonly<Partial<AISettings>>) => {
      const entries: [keyof AISettings, string][] = [
        ['activeProviderId', 'ai.activeProviderId'],
        ['defaultModel', 'ai.defaultModel'],
        ['temperature', 'ai.temperature'],
        ['maxTokens', 'ai.maxTokens'],
        ['systemPrompt', 'ai.systemPrompt'],
        ['includeContext', 'ai.includeContext'],
        ['recentCommandsCount', 'ai.recentCommandsCount'],
        ['includeRecentOutput', 'ai.includeRecentOutput'],
      ];
      for (const [field, key] of entries) {
        if (partial[field] !== undefined) {
          await ai.config.set(key, partial[field]);
        }
      }
      if (partial.activeProviderId !== undefined) {
        try {
          ai.aiProvider.setActiveProvider(partial.activeProviderId);
        } catch {
          /* provider may not exist */
        }
      }
    },
  );

  ipcMain.handle(IpcChannels.AI_LIST_CONVERSATIONS, async () => ai.conversationStore.list());

  ipcMain.handle(IpcChannels.AI_GET_CONVERSATION, async (_event, args: Readonly<{ id: string }>) => {
    const doc = ai.conversationStore.get(args.id);
    if (!doc) {
      return null;
    }
    return { id: doc.id, messages: [...doc.messages] };
  });

  ipcMain.handle(IpcChannels.AI_DELETE_CONVERSATION, async (_event, args: Readonly<{ id: string }>) => {
    ai.conversationStore.delete(args.id);
  });

  ipcMain.handle(
    IpcChannels.MARKETPLACE_SEARCH,
    async (_event, args: Readonly<{ query: string; page?: number }>) => {
      return marketplaceService.search(args.query, args.page);
    },
  );

  ipcMain.handle(IpcChannels.MARKETPLACE_GET_DETAILS, async (_event, args: Readonly<{ name: string }>) => {
    return marketplaceService.getDetails(args.name);
  });

  ipcMain.handle(
    IpcChannels.MARKETPLACE_INSTALL,
    async (_event, args: Readonly<{ name: string; version?: string }>) => {
      await marketplaceService.install(args.name, args.version);
    },
  );

  ipcMain.handle(
    IpcChannels.MARKETPLACE_UNINSTALL,
    async (_event, args: Readonly<{ extensionId: string }>) => {
      await marketplaceService.uninstall(args.extensionId);
    },
  );

  ipcMain.handle(
    IpcChannels.MARKETPLACE_UPDATE,
    async (_event, args: Readonly<{ extensionId: string }>) => {
      await marketplaceService.update(args.extensionId);
    },
  );

  ipcMain.handle(IpcChannels.EXTENSION_LIST, async () => [
    ...BUILTIN_INSTALLED_EXTENSIONS,
    ...marketplaceService.listInstalled(),
  ]);

  ipcMain.handle(
    IpcChannels.EXTENSION_ENABLE,
    async (_event, args: Readonly<{ extensionId: string }>) => {
      if (BUILTIN_EXTENSION_IDS.has(args.extensionId)) {
        return;
      }
      await marketplaceService.enable(args.extensionId);
    },
  );

  ipcMain.handle(
    IpcChannels.EXTENSION_DISABLE,
    async (_event, args: Readonly<{ extensionId: string }>) => {
      if (BUILTIN_EXTENSION_IDS.has(args.extensionId)) {
        return;
      }
      await marketplaceService.disable(args.extensionId);
    },
  );

  ipcMain.handle(
    IpcChannels.EXTENSION_GET_PERMISSIONS,
    async (_event, args: Readonly<{ extensionId: string }>) => {
      return permissionManager.getGrants(args.extensionId);
    },
  );

  ipcMain.handle(
    IpcChannels.EXTENSION_REVOKE_PERMISSION,
    async (_event, args: Readonly<{ extensionId: string; permission: Permission }>) => {
      permissionManager.revoke(args.extensionId, args.permission);
    },
  );
}
