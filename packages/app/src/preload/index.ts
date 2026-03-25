import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, IpcEventChannels } from '@terminalmind/api';
import type { PreloadAPI } from '@terminalmind/api';
import type { EventType, EventPayloadMap } from '@terminalmind/core';

const api: PreloadAPI = {
  terminal: {
    create: (options) => ipcRenderer.invoke(IpcChannels.TERMINAL_CREATE, options),
    destroy: (sessionId) => ipcRenderer.invoke(IpcChannels.TERMINAL_DESTROY, { sessionId }),
    list: () => ipcRenderer.invoke(IpcChannels.TERMINAL_LIST),
    resize: (sessionId, cols, rows) =>
      ipcRenderer.invoke(IpcChannels.TERMINAL_RESIZE, { sessionId, cols, rows }),
    getSession: (sessionId) =>
      ipcRenderer.invoke(IpcChannels.TERMINAL_GET_SESSION, { sessionId }),
    sendInput: (sessionId, data) => {
      ipcRenderer.send(IpcEventChannels.PTY_INPUT, { sessionId, data });
    },
    onData: (sessionId, callback) => {
      const handler = (_event: unknown, payload: { sessionId: string; data: string }) => {
        if (payload.sessionId === sessionId) {
          callback(payload.data);
        }
      };
      ipcRenderer.on(IpcEventChannels.PTY_DATA, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.PTY_DATA, handler);
      };
    },
  },
  shell: {
    discover: () => ipcRenderer.invoke(IpcChannels.SHELL_DISCOVER),
    getDefault: () => ipcRenderer.invoke(IpcChannels.SHELL_GET_DEFAULT),
  },
  commands: {
    execute: (id, args) => ipcRenderer.invoke(IpcChannels.COMMAND_EXECUTE, { id, args }),
    list: () => ipcRenderer.invoke(IpcChannels.COMMAND_LIST),
  },
  config: {
    get: (key, defaultValue) => ipcRenderer.invoke(IpcChannels.CONFIG_GET, { key, defaultValue }),
    set: (key, value) => ipcRenderer.invoke(IpcChannels.CONFIG_SET, { key, value }),
  },
  ssh: {
    connect: (options) => ipcRenderer.invoke(IpcChannels.SSH_CONNECT, options),
    disconnect: (sessionId) => ipcRenderer.invoke(IpcChannels.SSH_DISCONNECT, { sessionId }),
    listSessions: () => ipcRenderer.invoke(IpcChannels.SSH_LIST_SESSIONS),
    getSession: (sessionId) => ipcRenderer.invoke(IpcChannels.SSH_GET_SESSION, { sessionId }),
    exec: (sessionId, command) => ipcRenderer.invoke(IpcChannels.SSH_EXEC, { sessionId, command }),
    forwardPort: (options) => ipcRenderer.invoke(IpcChannels.SSH_FORWARD_PORT, options),
    closeForward: (sessionId, forwardId) =>
      ipcRenderer.invoke(IpcChannels.SSH_CLOSE_FORWARD, { sessionId, forwardId }),
    listForwards: (sessionId) => ipcRenderer.invoke(IpcChannels.SSH_LIST_FORWARDS, { sessionId }),
    hostKeyVerify: (request) => ipcRenderer.invoke(IpcChannels.SSH_HOST_KEY_VERIFY, request),
    hostKeyAccept: (request) => ipcRenderer.invoke(IpcChannels.SSH_HOST_KEY_ACCEPT, request),
    onStatusChange: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.SSH_STATUS_CHANGE, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.SSH_STATUS_CHANGE, handler);
      };
    },
    onHostKeyPrompt: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.SSH_HOST_KEY_PROMPT, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.SSH_HOST_KEY_PROMPT, handler);
      };
    },
    onPasswordPrompt: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.SSH_PASSWORD_PROMPT, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.SSH_PASSWORD_PROMPT, handler);
      };
    },
  },
  sftp: {
    list: (request) => ipcRenderer.invoke(IpcChannels.SFTP_LIST, request),
    stat: (request) => ipcRenderer.invoke(IpcChannels.SFTP_STAT, request),
    mkdir: (request) => ipcRenderer.invoke(IpcChannels.SFTP_MKDIR, request),
    rmdir: (request) => ipcRenderer.invoke(IpcChannels.SFTP_RMDIR, request),
    unlink: (request) => ipcRenderer.invoke(IpcChannels.SFTP_UNLINK, request),
    rename: (request) => ipcRenderer.invoke(IpcChannels.SFTP_RENAME, request),
    upload: (options) => ipcRenderer.invoke(IpcChannels.SFTP_UPLOAD, options),
    download: (options) => ipcRenderer.invoke(IpcChannels.SFTP_DOWNLOAD, options),
    cancelTransfer: (transferId) => ipcRenderer.invoke(IpcChannels.SFTP_CANCEL_TRANSFER, { transferId }),
    retryTransfer: (transferId) => ipcRenderer.invoke(IpcChannels.SFTP_RETRY_TRANSFER, { transferId }),
    listTransfers: () => ipcRenderer.invoke(IpcChannels.SFTP_LIST_TRANSFERS),
    clearCompleted: () => ipcRenderer.invoke(IpcChannels.SFTP_CLEAR_COMPLETED),
    onTransferProgress: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.SFTP_TRANSFER_PROGRESS, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.SFTP_TRANSFER_PROGRESS, handler);
      };
    },
    onTransferComplete: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.SFTP_TRANSFER_COMPLETE, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.SFTP_TRANSFER_COMPLETE, handler);
      };
    },
  },
  local: {
    readDirectory: (absolutePath) => ipcRenderer.invoke(IpcChannels.LOCAL_READ_DIRECTORY, { absolutePath }),
  },
  connections: {
    list: () => ipcRenderer.invoke(IpcChannels.CONNECTIONS_LIST),
    get: (profileId) => ipcRenderer.invoke(IpcChannels.CONNECTIONS_GET, { profileId }),
    save: (profile) => ipcRenderer.invoke(IpcChannels.CONNECTIONS_SAVE, profile),
    remove: (profileId) => ipcRenderer.invoke(IpcChannels.CONNECTIONS_REMOVE, { profileId }),
    importData: (data) => ipcRenderer.invoke(IpcChannels.CONNECTIONS_IMPORT, { data }),
    exportData: () => ipcRenderer.invoke(IpcChannels.CONNECTIONS_EXPORT),
    onChanged: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.CONNECTION_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.CONNECTION_CHANGED, handler);
      };
    },
  },
  events: {
    onEvent: <T extends EventType>(type: T, callback: (payload: EventPayloadMap[T]) => void) => {
      const handler = (_event: unknown, payload: { type: string; payload: unknown }) => {
        if (payload.type === type) {
          callback(payload.payload as EventPayloadMap[T]);
        }
      };
      ipcRenderer.on(IpcEventChannels.EVENT_BROADCAST, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.EVENT_BROADCAST, handler);
      };
    },
  },
  ai: {
    complete: (request) => ipcRenderer.invoke(IpcChannels.AI_COMPLETE, request),
    generateCommand: (prompt, context) =>
      ipcRenderer.invoke(IpcChannels.AI_GENERATE_COMMAND, { prompt, context }),
    streamStart: (request) => ipcRenderer.invoke(IpcChannels.AI_STREAM_START, request),
    streamCancel: (streamId) => ipcRenderer.invoke(IpcChannels.AI_STREAM_CANCEL, { streamId }),
    onStreamChunk: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.AI_STREAM_CHUNK, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.AI_STREAM_CHUNK, handler);
      };
    },
    listProviders: () => ipcRenderer.invoke(IpcChannels.AI_LIST_PROVIDERS),
    setActiveProvider: (providerId) => ipcRenderer.invoke(IpcChannels.AI_SET_ACTIVE_PROVIDER, { providerId }),
    listModels: () => ipcRenderer.invoke(IpcChannels.AI_LIST_MODELS),
    setApiKey: (providerId, apiKey) => ipcRenderer.invoke(IpcChannels.AI_SET_API_KEY, { providerId, apiKey }),
    getSettings: () => ipcRenderer.invoke(IpcChannels.AI_GET_SETTINGS),
    updateSettings: (settings) => ipcRenderer.invoke(IpcChannels.AI_UPDATE_SETTINGS, settings),
    listConversations: () => ipcRenderer.invoke(IpcChannels.AI_LIST_CONVERSATIONS),
    getConversation: (id) => ipcRenderer.invoke(IpcChannels.AI_GET_CONVERSATION, { id }),
    deleteConversation: (id) => ipcRenderer.invoke(IpcChannels.AI_DELETE_CONVERSATION, { id }),
  },
  marketplace: {
    search: (query, page) => ipcRenderer.invoke(IpcChannels.MARKETPLACE_SEARCH, { query, page }),
    getDetails: (name) => ipcRenderer.invoke(IpcChannels.MARKETPLACE_GET_DETAILS, { name }),
    install: (name, version) => ipcRenderer.invoke(IpcChannels.MARKETPLACE_INSTALL, { name, version }),
    uninstall: (extensionId) => ipcRenderer.invoke(IpcChannels.MARKETPLACE_UNINSTALL, { extensionId }),
    update: (extensionId) => ipcRenderer.invoke(IpcChannels.MARKETPLACE_UPDATE, { extensionId }),
    onInstallProgress: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.MARKETPLACE_INSTALL_PROGRESS, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.MARKETPLACE_INSTALL_PROGRESS, handler);
      };
    },
  },
  extensions: {
    list: () => ipcRenderer.invoke(IpcChannels.EXTENSION_LIST),
    enable: (extensionId) => ipcRenderer.invoke(IpcChannels.EXTENSION_ENABLE, { extensionId }),
    disable: (extensionId) => ipcRenderer.invoke(IpcChannels.EXTENSION_DISABLE, { extensionId }),
    getPermissions: (extensionId) => ipcRenderer.invoke(IpcChannels.EXTENSION_GET_PERMISSIONS, { extensionId }),
    revokePermission: (extensionId, permission) =>
      ipcRenderer.invoke(IpcChannels.EXTENSION_REVOKE_PERMISSION, { extensionId, permission }),
    onPermissionPrompt: (callback) => {
      const handler = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(IpcEventChannels.PERMISSION_PROMPT, handler);
      return () => {
        ipcRenderer.removeListener(IpcEventChannels.PERMISSION_PROMPT, handler);
      };
    },
    respondToPermissionPrompt: (extensionId, granted) =>
      ipcRenderer.invoke(IpcChannels.PERMISSION_PROMPT_RESULT, { extensionId, granted }),
  },
};

contextBridge.exposeInMainWorld('api', api);
