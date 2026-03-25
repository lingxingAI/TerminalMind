import { ipcMain, type BrowserWindow } from 'electron';
import { IpcChannels, IpcEventChannels } from '@terminalmind/api';
import type { TerminalCreateOptions, TerminalSessionInfo, CommandInfo } from '@terminalmind/api';
import type { ITerminalService, TerminalSession } from '@terminalmind/services';
import type { IShellDiscoveryAdapter } from '@terminalmind/services';
import type { ICommandRegistry } from '@terminalmind/core';

const configStore = new Map<string, unknown>();

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

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  terminalService: ITerminalService,
  shellDiscovery: IShellDiscoveryAdapter,
  commandRegistry: ICommandRegistry,
): void {
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
    const session = await terminalService.create(options);

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
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IpcEventChannels.EVENT_BROADCAST, {
          type: 'terminal.exited',
          payload: { sessionId: session.id, exitCode: e.exitCode },
        });
      }
    });

    return toSessionInfo(session);
  });

  ipcMain.handle(IpcChannels.TERMINAL_DESTROY, async (_event, args: { sessionId: string }) => {
    await terminalService.destroy(args.sessionId);
  });

  ipcMain.handle(IpcChannels.TERMINAL_LIST, async () => {
    return terminalService.listSessions().map(toSessionInfo);
  });

  ipcMain.handle(IpcChannels.TERMINAL_RESIZE, async (_event, args: { sessionId: string; cols: number; rows: number }) => {
    const session = terminalService.getSession(args.sessionId);
    if (session) {
      session.resize(args.cols, args.rows);
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
    const session = terminalService.getSession(payload.sessionId);
    if (session) {
      session.write(payload.data);
    }
  });
}
