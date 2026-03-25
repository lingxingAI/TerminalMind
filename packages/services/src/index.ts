export {
  ExtensionHost,
  parseExtensionManifestFromPackageJson,
  WorkerExtensionHost,
  isWorkerMessage,
} from './extension-host/index';
export type {
  ExtensionHostWorkerOptions,
  RegisterExtensionOptions,
  IWorkerExtensionHost,
  WorkerExtensionHostOptions,
  WorkerExtensionStatus,
  WorkerApiPermissionCheck,
  WorkerMessage,
} from './extension-host/index';
export { registerTestServicesForExtensionAPI } from './extension-host/test-utils';
export {
  createTerminalMindAPI,
  requirePermission,
  EXTENSION_AI_PROVIDER_SERVICE,
  EXTENSION_CONFIG_SERVICE,
  EXTENSION_CONNECTION_STORE,
  EXTENSION_PIPELINE_ENGINE,
  EXTENSION_TERMINAL_SERVICE,
} from './extension-api/index';
export type { CreateTerminalMindAPIOptions, ViewRegistries } from './extension-api/index';
export type { IShellDiscoveryAdapter } from './terminal/index';
export { Win32ShellDiscovery, UnixShellDiscovery, createShellDiscovery } from './terminal/index';
export type { TerminalSession, ITerminalService } from './terminal/index';
export { TerminalService } from './terminal/index';
export type { IConfigService } from './config/index';
export { ConfigService } from './config/index';
export type {
  ConnectionProfile,
  ConnectionStoreChangeEvent,
  ConnectionTerminalConfig,
  IConnectionStore,
  ISecretStore,
  SSHAuthMethod,
  SSHConnectOptions,
} from './connection/index';
export { ConnectionStore, InMemorySecretStore, createSecretStore } from './connection/index';
export type {
  ExecResult,
  HostKeyEntry,
  IHostKeyStore,
  ISSHService,
  PortForward,
  PortForwardOptions,
  SSHConnectionConfig,
  SSHSession,
} from './ssh/index';
export { HostKeyStore, SSHService } from './ssh/index';
export type {
  FileEntry,
  FileStat,
  ISFTPChannel,
  ITransferQueue,
  TransferOptions,
  TransferProgress,
  TransferResult,
  TransferTask,
} from './sftp/index';
export { SFTPChannel, toFileStat, TransferQueue } from './sftp/index';
export type {
  OpenRouterProviderOptions,
  ContextCollectorInput,
  IAIProviderService,
  AICommandPipelineInput,
  EnrichedAICommandState,
  IPipelineEngine,
} from './ai/index';
export {
  AIProviderService,
  OpenRouterProvider,
  parseSseToAiStreamChunks,
  AiSecretStore,
  aiProviderApiKeySecretKey,
  ContextCollector,
  PipelineEngineImpl,
  createAICommandPipeline,
  parseCommandFromAIResponse,
  ConversationStore,
} from './ai/index';
export type { StoredConversation } from './ai/index';
export type { IPermissionManager } from '@terminalmind/api';
export type { PermissionManagerDeps } from './permissions/index';
export { PermissionManager } from './permissions/index';
export { PermissionDeniedError, withPermissionCheck } from './extension-api/index';
