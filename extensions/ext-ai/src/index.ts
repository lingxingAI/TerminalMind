import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';

export function activate(ctx: ExtensionContext, api: TerminalMindAPI): void {
  ctx.subscriptions.push(
    api.commands.register('ai.openSidebar', async () => {
      return { command: 'ai.openSidebar' };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('ai.generateCommand', async (args) => {
      return { command: 'ai.generateCommand', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('ai.clearConversation', async () => {
      return { command: 'ai.clearConversation' };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('ai.sendToTerminal', async (args) => {
      return { command: 'ai.sendToTerminal', args };
    }),
  );

  ctx.subscriptions.push(
    api.commands.register('ai.settings', async () => {
      return { command: 'ai.settings' };
    }),
  );

  ctx.subscriptions.push(
    api.views.registerSidebarView('ai-chat', {
      viewId: 'ai-chat',
      title: 'AI Chat',
      icon: 'sparkles',
    }),
  );
}

export function deactivate(): void {}
