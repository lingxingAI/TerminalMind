import { basename, join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { ipcMain, type BrowserWindow } from 'electron';
import { IpcChannels, IpcEventChannels } from '@terminalmind/api';
import type {
  CommandInfo,
  ConnectionStoreChangeEvent,
  ExecResult,
  LocalDirEntry,
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
import { TransferQueue } from '@terminalmind/services';

const configStore = new Map<string, unknown>();

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
): void {
  let buffer = '';
  let flushScheduled = false;
  session.onData((data) => {
    buffer += data;
    if (!flushScheduled) {
      flushScheduled = true;
      setImmediate(() => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IpcEventChannels.PTY_DATA, {
            sessionId: session.id,
            data: buffer,
          });
        }
        buffer = '';
        flushScheduled = false;
      });
    }
  });
  session.onExit((e) => {
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
): void {
  connectionStore.onChange((event: Readonly<ConnectionStoreChangeEvent>) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcEventChannels.CONNECTION_CHANGED, event);
    }
  });

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

  ipcMain.handle(IpcChannels.TERMINAL_CREATE, async (_event, options: TerminalCreateOptions) => {
    try {
      const session = await terminalService.create(options);
      wireTerminalSessionToRenderer(mainWindow, sshService, session);
      return toSessionInfo(session);
    } catch (err) {
      console.error('Failed to create terminal session:', err);
      throw err;
    }
  });

  ipcMain.handle(IpcChannels.TERMINAL_DESTROY, async (_event, args: { sessionId: string }) => {
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
      wireTerminalSessionToRenderer(mainWindow, sshService, term, disposeSftp);
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
}
