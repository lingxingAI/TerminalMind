import { app, BrowserWindow, shell } from 'electron';
import { homedir } from 'os';
import { join } from 'path';
import {
  ServiceContainer,
  CommandRegistryImpl,
  EventBusImpl,
  PipelineEngineStub,
  createServiceToken,
} from '@terminalmind/core';
import type { IConnectionStore, IHostKeyStore, ISSHService } from '@terminalmind/services';
import { IpcEventChannels } from '@terminalmind/api';
import type { InstallProgress, PermissionPrompt } from '@terminalmind/api';
import {
  AIProviderService,
  AiSecretStore,
  ConfigService,
  ConnectionStore,
  ContextCollector,
  ConversationStore,
  createAICommandPipeline,
  EXTENSION_AI_PROVIDER_SERVICE,
  EXTENSION_CONFIG_SERVICE,
  EXTENSION_CONNECTION_STORE,
  EXTENSION_PIPELINE_ENGINE,
  EXTENSION_TERMINAL_SERVICE,
  ExtensionHost,
  HostKeyStore,
  MarketplaceService,
  OpenRouterProvider,
  PermissionManager,
  PipelineEngineImpl,
  RegistryClient,
  SSHService,
  TerminalService,
  createSecretStore,
  createShellDiscovery,
  type IConfigService,
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

let extensionHost: ExtensionHost | undefined;

const sshServiceToken = createServiceToken<ISSHService>('ISSHService');
const connectionStoreToken = createServiceToken<IConnectionStore>('IConnectionStore');
const hostKeyStoreToken = createServiceToken<IHostKeyStore>('IHostKeyStore');
const configServiceToken = createServiceToken<IConfigService>('IConfigService');
const aiProviderServiceToken = createServiceToken<AIProviderService>('AIProviderService');
const conversationStoreToken = createServiceToken<ConversationStore>('ConversationStore');
const aiPipelineEngineToken = createServiceToken<PipelineEngineImpl>('AIPipelineEngine');

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

  const tmRoot = join(homedir(), '.terminalmind');
  const configService = new ConfigService(tmRoot);
  const aiSecrets = new AiSecretStore(secretStore);
  const openRouter = new OpenRouterProvider({
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    getApiKey: () => aiSecrets.getApiKey('openrouter'),
  });
  const aiProviderService = new AIProviderService(eventBus);
  aiProviderService.registerProvider(openRouter);
  const aiPipelineEngine = new PipelineEngineImpl();
  const conversationStore = new ConversationStore(tmRoot);
  const contextCollector = new ContextCollector(shellDiscovery);
  const aiCommandPipeline = createAICommandPipeline(aiProviderService);

  const key = await aiSecrets.getApiKey('openrouter');
  if (key?.trim()) {
    try {
      await openRouter.listModels();
    } catch {
      /* offline or invalid key at startup */
    }
  }

  services.register(connectionStoreToken, () => connectionStore);
  services.register(hostKeyStoreToken, () => hostKeyStore);
  services.register(configServiceToken, () => configService);
  services.register(aiProviderServiceToken, () => aiProviderService);
  services.register(conversationStoreToken, () => conversationStore);
  services.register(aiPipelineEngineToken, () => aiPipelineEngine);

  services.register(EXTENSION_TERMINAL_SERVICE, () => terminalService);
  services.register(EXTENSION_CONNECTION_STORE, () => connectionStore);
  services.register(EXTENSION_CONFIG_SERVICE, () => configService);
  services.register(EXTENSION_AI_PROVIDER_SERVICE, () => aiProviderService);
  services.register(EXTENSION_PIPELINE_ENGINE, () => aiPipelineEngine);

  const permissionManager = new PermissionManager({
    permissionsFilePath: join(tmRoot, 'permissions.json'),
    eventBus,
    notifyPermissionPrompt: (prompt: PermissionPrompt) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IpcEventChannels.PERMISSION_PROMPT, prompt);
      }
    },
  });
  for (const id of ['ext-terminal', 'ext-ai', 'ext-ssh', 'ext-sftp', 'ext-connections'] as const) {
    permissionManager.registerBuiltin(id);
  }

  extensionHost = new ExtensionHost(commandRegistry, eventBus, services, permissionManager);

  const registryClient = new RegistryClient();
  const marketplaceService = new MarketplaceService({
    registryClient,
    extensionHost: extensionHost!,
    eventBus,
    extensionsRoot: join(tmRoot, 'extensions'),
    onInstallProgress: (progress: InstallProgress) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IpcEventChannels.MARKETPLACE_INSTALL_PROGRESS, progress);
      }
    },
  });

  const forwardExtensionState = (extensionId: string): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcEventChannels.EXTENSION_STATE_CHANGED, { extensionId });
    }
  };
  eventBus.on('extension.installed', (p) => forwardExtensionState(p.extensionId));
  eventBus.on('extension.uninstalled', (p) => forwardExtensionState(p.extensionId));
  eventBus.on('extension.enabled', (p) => forwardExtensionState(p.extensionId));
  eventBus.on('extension.disabled', (p) => forwardExtensionState(p.extensionId));

  registerIpcHandlers(
    mainWindow,
    terminalService,
    shellDiscovery,
    commandRegistry,
    sshService,
    eventBus,
    connectionStore,
    hostKeyStore,
    permissionManager,
    {
      aiProvider: aiProviderService,
      aiSecrets,
      conversationStore,
      contextCollector,
      config: configService,
      pipelineEngine: aiPipelineEngine,
      commandPipeline: aiCommandPipeline,
    },
    marketplaceService,
  );

  extensionHost!.registerExtension('ext-terminal', extTerminal);
  extensionHost!.registerExtension('ext-ai', extAi);
  extensionHost!.registerExtension('ext-ssh', extSsh);
  extensionHost!.registerExtension('ext-sftp', extSftp);
  extensionHost!.registerExtension('ext-connections', extConnections);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void extensionHost?.deactivateAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
