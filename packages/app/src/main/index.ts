import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import {
  ServiceContainer,
  CommandRegistryImpl,
  EventBusImpl,
  PipelineEngineStub,
} from '@terminalmind/core';
import { ExtensionHost, TerminalService, createShellDiscovery } from '@terminalmind/services';
import { registerIpcHandlers } from './ipc-handlers';
import * as extTerminal from '@terminalmind/ext-terminal';

const services = new ServiceContainer();
const eventBus = new EventBusImpl();
const pipeline = new PipelineEngineStub();
const commandRegistry = new CommandRegistryImpl({ services, events: eventBus, pipeline });
const shellDiscovery = createShellDiscovery();
const terminalService = new TerminalService(shellDiscovery, eventBus);
const extensionHost = new ExtensionHost(commandRegistry, eventBus);

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  const mainWindow = createWindow();

  registerIpcHandlers(mainWindow, terminalService, shellDiscovery, commandRegistry);

  extensionHost.registerExtension('ext-terminal', extTerminal);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void extensionHost.deactivateAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
