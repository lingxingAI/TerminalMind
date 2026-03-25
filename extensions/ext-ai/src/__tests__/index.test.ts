import { describe, it, expect, vi } from 'vitest';
import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';
import { activate, deactivate } from '../index';

function createApiMock() {
  const register = vi.fn(() => ({ dispose: vi.fn() }));
  const registerSidebarView = vi.fn(() => ({ dispose: vi.fn() }));
  const api: TerminalMindAPI = {
    commands: {
      register,
      execute: vi.fn(),
      getRegisteredCommands: vi.fn(),
    },
    views: {
      registerSidebarView,
    },
    events: {
      on: vi.fn(() => ({ dispose: vi.fn() })),
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
