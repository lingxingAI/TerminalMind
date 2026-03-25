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
};

contextBridge.exposeInMainWorld('api', api);
