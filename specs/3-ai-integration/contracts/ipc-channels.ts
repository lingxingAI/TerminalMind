/**
 * Phase 3 IPC 通道契约
 * AI 提供方、补全、会话与设置
 */

// ─── Request-Response 通道（ipcMain.handle）────────────────

export const Phase3IpcChannels = {
  // Provider / completion
  AI_LIST_PROVIDERS: 'ai:list-providers',
  AI_GET_ACTIVE_PROVIDER: 'ai:get-active-provider',
  AI_SET_ACTIVE_PROVIDER: 'ai:set-active-provider',
  AI_LIST_MODELS: 'ai:list-models',
  AI_SET_ACTIVE_MODEL: 'ai:set-active-model',
  AI_COMPLETE: 'ai:complete',
  AI_STREAM_START: 'ai:stream-start',
  AI_STREAM_CANCEL: 'ai:stream-cancel',

  // Natural language → command (uses PipelineEngine in Main)
  AI_GENERATE_COMMAND: 'ai:generate-command',

  // Conversation store
  AI_CONVERSATION_LIST: 'ai:conversation:list',
  AI_CONVERSATION_GET: 'ai:conversation:get',
  AI_CONVERSATION_CREATE: 'ai:conversation:create',
  AI_CONVERSATION_SAVE: 'ai:conversation:save',
  AI_CONVERSATION_REMOVE: 'ai:conversation:remove',
  AI_CONVERSATION_APPEND: 'ai:conversation:append',

  // Settings (non-secret fields)
  AI_SETTINGS_GET: 'ai:settings:get',
  AI_SETTINGS_SAVE: 'ai:settings:save',

  // API key (backed by SecretStore)
  AI_SECRET_HAS_KEY: 'ai:secret:has-key',
  AI_SECRET_SET_KEY: 'ai:secret:set-key',
  AI_SECRET_DELETE_KEY: 'ai:secret:delete-key',

  // Context from active terminal (Renderer may pass sessionId)
  AI_CONTEXT_GET: 'ai:context:get',
} as const;

// ─── Event 通道（ipcMain.send / ipcRenderer.on）────────────

export const Phase3IpcEventChannels = {
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_END: 'ai:stream-end',
  AI_STREAM_ERROR: 'ai:stream-error',

  AI_PROVIDER_CHANGED: 'ai:provider-changed',
  AI_MODEL_CHANGED: 'ai:model-changed',

  AI_CONVERSATION_UPDATED: 'ai:conversation-updated',
} as const;
