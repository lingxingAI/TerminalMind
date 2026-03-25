export { ExtensionHost } from './extension-host';
export type { ExtensionHostWorkerOptions, RegisterExtensionOptions } from './extension-host';
export { parseExtensionManifestFromPackageJson } from './manifest';
export type {
  IWorkerExtensionHost,
  WorkerExtensionHostOptions,
  WorkerExtensionStatus,
  WorkerApiPermissionCheck,
} from './worker-extension-host';
export { WorkerExtensionHost } from './worker-extension-host';
export type { WorkerMessage } from './worker-protocol';
export { isWorkerMessage } from './worker-protocol';
