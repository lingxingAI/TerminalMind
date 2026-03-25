/**
 * Phase 2 IPC 通道扩展契约
 * 新增 SSH、SFTP、Connection 相关通道
 */

// ─── Request-Response 通道（ipcMain.handle）──────

export const Phase2IpcChannels = {
  // SSH 连接管理
  SSH_CONNECT: 'ssh:connect',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_LIST_SESSIONS: 'ssh:list-sessions',
  SSH_GET_SESSION: 'ssh:get-session',
  SSH_EXEC: 'ssh:exec',

  // 端口转发
  SSH_FORWARD_PORT: 'ssh:forward-port',
  SSH_CLOSE_FORWARD: 'ssh:close-forward',
  SSH_LIST_FORWARDS: 'ssh:list-forwards',

  // 主机密钥
  SSH_HOST_KEY_VERIFY: 'ssh:host-key-verify',
  SSH_HOST_KEY_ACCEPT: 'ssh:host-key-accept',

  // SFTP 文件操作
  SFTP_LIST: 'sftp:list',
  SFTP_STAT: 'sftp:stat',
  SFTP_MKDIR: 'sftp:mkdir',
  SFTP_RMDIR: 'sftp:rmdir',
  SFTP_UNLINK: 'sftp:unlink',
  SFTP_RENAME: 'sftp:rename',
  SFTP_UPLOAD: 'sftp:upload',
  SFTP_DOWNLOAD: 'sftp:download',

  // 传输队列
  SFTP_CANCEL_TRANSFER: 'sftp:cancel-transfer',
  SFTP_RETRY_TRANSFER: 'sftp:retry-transfer',
  SFTP_LIST_TRANSFERS: 'sftp:list-transfers',
  SFTP_CLEAR_COMPLETED: 'sftp:clear-completed',

  // 连接配置管理
  CONNECTIONS_LIST: 'connections:list',
  CONNECTIONS_GET: 'connections:get',
  CONNECTIONS_SAVE: 'connections:save',
  CONNECTIONS_REMOVE: 'connections:remove',
  CONNECTIONS_IMPORT: 'connections:import',
  CONNECTIONS_EXPORT: 'connections:export',
} as const;

// ─── Event 通道（ipcMain.send / ipcRenderer.on）──

export const Phase2IpcEventChannels = {
  SSH_STATUS_CHANGE: 'ssh:status-change',
  SSH_HOST_KEY_PROMPT: 'ssh:host-key-prompt',
  SSH_PASSWORD_PROMPT: 'ssh:password-prompt',
  SFTP_TRANSFER_PROGRESS: 'sftp:transfer-progress',
  SFTP_TRANSFER_COMPLETE: 'sftp:transfer-complete',
  CONNECTION_CHANGED: 'connection:changed',
} as const;
