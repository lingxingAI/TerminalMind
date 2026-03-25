import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';

export function activate(ctx: ExtensionContext, api: TerminalMindAPI): void {
  void api.terminal.list();

  ctx.subscriptions.push(
    api.commands.register('terminal.new', async () => {
      return { command: 'terminal.new' };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('terminal.close', async (args) => {
      return { command: 'terminal.close', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('terminal.list', async () => {
      return { command: 'terminal.list' };
    }),
  );

  ctx.subscriptions.push(
    api.views.registerSidebarView('terminal-list', {
      viewId: 'terminal-list',
      title: 'Terminals',
      icon: 'terminal',
    }),
  );
}

export function deactivate(): void {}
