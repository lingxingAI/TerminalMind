import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';

export function activate(ctx: ExtensionContext, api: TerminalMindAPI): void {
  ctx.subscriptions.push(
    api.commands.register('connections.create', async () => {
      return { command: 'connections.create' };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('connections.edit', async (args) => {
      return { command: 'connections.edit', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('connections.delete', async (args) => {
      return { command: 'connections.delete', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('connections.search', async (args) => {
      return { command: 'connections.search', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('connections.import', async (args) => {
      return { command: 'connections.import', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('connections.export', async (args) => {
      return { command: 'connections.export', args };
    }),
  );

  ctx.subscriptions.push(
    api.views.registerSidebarView('connections-tree', {
      viewId: 'connections-tree',
      title: 'Connections',
      icon: 'link',
    }),
  );
}

export function deactivate(): void {}
