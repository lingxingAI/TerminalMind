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

describe('ext-ssh', () => {
  it('activate registers all four ssh commands', () => {
    const { api, register } = createApiMock();
    const ctx: ExtensionContext = { extensionId: 'ext-ssh', subscriptions: [] };

    activate(ctx, api);

    expect(register).toHaveBeenCalledTimes(4);
    expect(register).toHaveBeenCalledWith('ssh.connect', expect.any(Function));
    expect(register).toHaveBeenCalledWith('ssh.disconnect', expect.any(Function));
    expect(register).toHaveBeenCalledWith('ssh.quick-connect', expect.any(Function));
    expect(register).toHaveBeenCalledWith('ssh.forward-port', expect.any(Function));
  });

  it('activate registers the ssh-sessions sidebar view', () => {
    const { api, registerSidebarView } = createApiMock();
    const ctx: ExtensionContext = { extensionId: 'ext-ssh', subscriptions: [] };

    activate(ctx, api);

    expect(registerSidebarView).toHaveBeenCalledOnce();
    expect(registerSidebarView).toHaveBeenCalledWith(
      'ssh-sessions',
      expect.objectContaining({
        viewId: 'ssh-sessions',
        title: 'SSH Sessions',
        icon: 'link',
      }),
    );
  });

  it('deactivate is callable', () => {
    expect(() => deactivate?.()).not.toThrow();
  });
});
