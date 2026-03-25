/// <reference types="vitest/globals" />

import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';
import { activate } from '../index';

function createMocks() {
  const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
  const registerSidebarView = vi.fn(() => ({ dispose: vi.fn() }));
  const api = {
    commands: {
      register: registerCommand,
      execute: vi.fn(),
      getRegisteredCommands: vi.fn(() => []),
    },
    views: {
      registerSidebarView,
    },
    events: {
      on: vi.fn(() => ({ dispose: vi.fn() })),
    },
  } as unknown as TerminalMindAPI;

  const ctx: ExtensionContext = {
    extensionId: 'ext-sftp',
    subscriptions: [],
  };

  return { ctx, api, registerCommand, registerSidebarView };
}

describe('ext-sftp activate', () => {
  it('registers sftp.open, sftp.upload, and sftp.download commands', () => {
    const { ctx, api, registerCommand } = createMocks();

    activate(ctx, api);

    expect(registerCommand).toHaveBeenCalledTimes(3);
    expect(registerCommand).toHaveBeenCalledWith('sftp.open', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('sftp.upload', expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith('sftp.download', expect.any(Function));
  });

  it('registers sftp-browser sidebar view', () => {
    const { ctx, api, registerSidebarView } = createMocks();

    activate(ctx, api);

    expect(registerSidebarView).toHaveBeenCalledOnce();
    expect(registerSidebarView).toHaveBeenCalledWith(
      'sftp-browser',
      expect.objectContaining({
        viewId: 'sftp-browser',
        title: 'File Browser',
        icon: 'folder',
      }),
    );
  });

  it('pushes one subscription per registration', () => {
    const { ctx, api } = createMocks();

    activate(ctx, api);

    expect(ctx.subscriptions).toHaveLength(4);
  });
});
