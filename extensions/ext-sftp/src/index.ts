import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';

export function activate(ctx: ExtensionContext, api: TerminalMindAPI): void {
  ctx.subscriptions.push(
    api.commands.register('sftp.open', async () => {
      return { command: 'sftp.open' };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('sftp.upload', async (args?: unknown) => {
      return { command: 'sftp.upload', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('sftp.download', async (args?: unknown) => {
      return { command: 'sftp.download', args };
    }),
  );

  ctx.subscriptions.push(
    api.views.registerSidebarView('sftp-browser', {
      viewId: 'sftp-browser',
      title: 'File Browser',
      icon: 'folder',
    }),
  );
}

export function deactivate(): void {}
