import type { ExtensionContext, ExtensionModule, TerminalMindAPI } from '@terminalmind/api';

export const activate: ExtensionModule['activate'] = (ctx: ExtensionContext, api: TerminalMindAPI) => {
  ctx.subscriptions.push(
    api.commands.register('ssh.connect', async () => {
      // Stub: will be wired to SSHService via IPC in GUI phase
    }),
  );

  ctx.subscriptions.push(api.commands.register('ssh.disconnect', async () => {}));

  ctx.subscriptions.push(api.commands.register('ssh.quick-connect', async () => {}));

  ctx.subscriptions.push(api.commands.register('ssh.forward-port', async () => {}));

  ctx.subscriptions.push(
    api.views.registerSidebarView('ssh-sessions', {
      viewId: 'ssh-sessions',
      title: 'SSH Sessions',
      icon: 'link',
    }),
  );
};

export const deactivate: ExtensionModule['deactivate'] = () => {};
