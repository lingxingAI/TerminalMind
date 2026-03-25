/**
 * Phase 4 IPC 通道契约
 * 插件市场、Registry、权限、Worker 宿主协调
 */

// ─── Request-Response（ipcMain.handle）──────────────────────

export const Phase4IpcChannels = {
  // Marketplace
  MARKETPLACE_SEARCH: 'marketplace:search',
  MARKETPLACE_GET_DETAILS: 'marketplace:get-details',
  MARKETPLACE_INSTALL: 'marketplace:install',
  MARKETPLACE_UNINSTALL: 'marketplace:uninstall',
  MARKETPLACE_UPDATE: 'marketplace:update',
  MARKETPLACE_LIST_INSTALLED: 'marketplace:list-installed',
  MARKETPLACE_REFRESH_INDEX: 'marketplace:refresh-index',

  // Permissions
  PERMISSION_CHECK: 'permission:check',
  PERMISSION_REQUEST: 'permission:request',
  PERMISSION_REVOKE: 'permission:revoke',
  PERMISSION_GET_GRANT: 'permission:get-grant',

  // Extension host / worker (Main 内省，Renderer 仅调安全子集)
  EXTENSION_LIST: 'extension:list',
  EXTENSION_ACTIVATE: 'extension:activate',
  EXTENSION_DEACTIVATE: 'extension:deactivate',
  EXTENSION_GET_STATE: 'extension:get-state',
  EXTENSION_RELOAD: 'extension:reload',

  // Registry 配置（URL、镜像、缓存 TTL）
  REGISTRY_GET_CONFIG: 'registry:get-config',
  REGISTRY_SET_CONFIG: 'registry:set-config',
} as const;

// ─── Event（ipcMain.send / ipcRenderer.on）──────────────────

export const Phase4IpcEventChannels = {
  MARKETPLACE_INSTALL_PROGRESS: 'marketplace:install-progress',
  MARKETPLACE_INDEX_UPDATED: 'marketplace:index-updated',

  PERMISSION_PROMPT: 'permission:prompt',
  PERMISSION_PROMPT_RESULT: 'permission:prompt-result',

  EXTENSION_WORKER_CRASHED: 'extension:worker-crashed',
  EXTENSION_STATE_CHANGED: 'extension:state-changed',
} as const;

export type Phase4IpcChannel =
  (typeof Phase4IpcChannels)[keyof typeof Phase4IpcChannels];

export type Phase4IpcEventChannel =
  (typeof Phase4IpcEventChannels)[keyof typeof Phase4IpcEventChannels];
