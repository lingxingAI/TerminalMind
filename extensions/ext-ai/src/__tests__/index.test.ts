import { describe, it, expect, vi } from 'vitest';
import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';
import { activate, deactivate } from '../index';

function createApiMock() {
  const register = vi.fn(() => ({ dispose: vi.fn() }));
  const registerSidebarView = vi.fn(() => ({ dispose: vi.fn() }));
  const d = () => ({ dispose: vi.fn() });
  const api: TerminalMindAPI = {
    commands: {
      register,
      execute: vi.fn(),
      getRegisteredCommands: vi.fn(),
    },
    views: {
      registerSidebarView,
      registerPanelView: vi.fn(d),
      registerStatusBarItem: vi.fn(d),
    },
    events: {
      on: vi.fn(d),
    },
    terminal: {
      create: vi.fn(),
      list: vi.fn(() => []),
      sendInput: vi.fn(),
      destroy: vi.fn(),
      onData: vi.fn(d),
      onExit: vi.fn(d),
    },
    connections: {
      list: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    },
    ai: {
      complete: vi.fn(),
      stream: vi.fn(),
      registerProvider: vi.fn(d),
      listProviders: vi.fn(() => []),
    },
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readDir: vi.fn(),
      stat: vi.fn(),
      exists: vi.fn(),
      mkdir: vi.fn(),
      remove: vi.fn(),
    },
    pipeline: {
      registerStep: vi.fn(d),
      pipe: vi.fn(),
      execute: vi.fn(),
    },
    config: {
      get: vi.fn(),
      set: vi.fn(),
      onDidChange: vi.fn(d),
    },
    window: {
      showNotification: vi.fn(),
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
    },
  };
  return { api, register, registerSidebarView };
}

describe('ext-ai', () => {
  it('activate registers all five ai commands', () => {
    const { api, register } = createApiMock();
    const ctx: ExtensionContext = { extensionId: 'ext-ai', subscriptions: [] };

    activate(ctx, api);

    expect(register).toHaveBeenCalledTimes(5);
    expect(register).toHaveBeenCalledWith('ai.openSidebar', expect.any(Function));
    expect(register).toHaveBeenCalledWith('ai.generateCommand', expect.any(Function));
    expect(register).toHaveBeenCalledWith('ai.clearConversation', expect.any(Function));
    expect(register).toHaveBeenCalledWith('ai.sendToTerminal', expect.any(Function));
    expect(register).toHaveBeenCalledWith('ai.settings', expect.any(Function));
  });

  it('activate registers the ai-chat sidebar view', () => {
    const { api, registerSidebarView } = createApiMock();
    const ctx: ExtensionContext = { extensionId: 'ext-ai', subscriptions: [] };

    activate(ctx, api);

    expect(registerSidebarView).toHaveBeenCalledOnce();
    expect(registerSidebarView).toHaveBeenCalledWith(
      'ai-chat',
      expect.objectContaining({
        viewId: 'ai-chat',
        title: 'AI Chat',
        icon: 'sparkles',
      }),
    );
  });

  it('deactivate is callable', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
