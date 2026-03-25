import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import {
  ServiceContainer,
  CommandRegistryImpl,
  EventBusImpl,
  PipelineEngineStub,
  createServiceToken,
} from '@terminalmind/core';
import type { IConnectionStore, IHostKeyStore, ISSHService } from '@terminalmind/services';
import {
  ConnectionStore,
  ExtensionHost,
  HostKeyStore,
  SSHService,
  TerminalService,
  createSecretStore,
  createShellDiscovery,
} from '@terminalmind/services';
import { registerIpcHandlers } from './ipc-handlers';
import * as extAi from '@terminalmind/ext-ai';
import * as extConnections from '@terminalmind/ext-connections';
import * as extSftp from '@terminalmind/ext-sftp';
import * as extSsh from '@terminalmind/ext-ssh';
import * as extTerminal from '@terminalmind/ext-terminal';

const services = new ServiceContainer();
const eventBus = new EventBusImpl();
const pipeline = new PipelineEngineStub();
const commandRegistry = new CommandRegistryImpl({ services, events: eventBus, pipeline });
const shellDiscovery = createShellDiscovery();
const terminalService = new TerminalService(shellDiscovery, eventBus);
const sshService = new SSHService(eventBus);
const extensionHost = new ExtensionHost(commandRegistry, eventBus);

const sshServiceToken = createServiceToken<ISSHService>('ISSHService');
const connectionStoreToken = createServiceToken<IConnectionStore>('IConnectionStore');
const hostKeyStoreToken = createServiceToken<IHostKeyStore>('IHostKeyStore');

services.register(sshServiceToken, () => sshService);

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

app.whenReady().then(async () => {
  const mainWindow = createWindow();
  const userData = app.getPath('userData');
  const secretStore = await createSecretStore();
  const connectionStore = new ConnectionStore(secretStore, userData);
  const hostKeyStore = new HostKeyStore(userData);

  services.register(connectionStoreToken, () => connectionStore);
  services.register(hostKeyStoreToken, () => hostKeyStore);

  registerIpcHandlers(
    mainWindow,
    terminalService,
    shellDiscovery,
    commandRegistry,
    sshService,
    eventBus,
    connectionStore,
    hostKeyStore,
  );

  extensionHost.registerExtension('ext-terminal', extTerminal);
  extensionHost.registerExtension('ext-ai', extAi);
  extensionHost.registerExtension('ext-ssh', extSsh);
  extensionHost.registerExtension('ext-sftp', extSftp);
  extensionHost.registerExtension('ext-connections', extConnections);

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
