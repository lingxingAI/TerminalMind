/// <reference types="vitest/globals" />

import { ExtensionHost } from '../extension-host';
import { CommandRegistryImpl, EventBusImpl, ServiceContainer, PipelineEngineStub } from '@terminalmind/core';
import type { ExtensionModule, ExtensionContext, TerminalMindAPI } from '@terminalmind/api';

function createHost() {
  const services = new ServiceContainer();
  const events = new EventBusImpl();
  const pipeline = new PipelineEngineStub();
  const registry = new CommandRegistryImpl({ services, events, pipeline });
  const host = new ExtensionHost(registry, events);
  return { host, registry, events };
}

describe('ExtensionHost', () => {
  it('should activate an extension and call activate()', () => {
    const { host } = createHost();
    const activate = vi.fn();
    const module: ExtensionModule = { activate };
    host.registerExtension('test-ext', module);
    expect(activate).toHaveBeenCalledOnce();
    expect(activate.mock.calls[0][0].extensionId).toBe('test-ext');
  });

  it('should allow extensions to register commands via api.commands.register', async () => {
    const { host, registry } = createHost();
    const module: ExtensionModule = {
      activate(_ctx: ExtensionContext, api: TerminalMindAPI) {
        _ctx.subscriptions.push(
          api.commands.register('ext.hello', async () => 'hi from ext'),
        );
      },
    };
    host.registerExtension('cmd-ext', module);
    const result = await registry.execute<string>('ext.hello');
    expect(result).toBe('hi from ext');
  });

  it('should allow extensions to register sidebar views', () => {
    const { host } = createHost();
    const module: ExtensionModule = {
      activate(_ctx: ExtensionContext, api: TerminalMindAPI) {
        _ctx.subscriptions.push(
          api.views.registerSidebarView('my-view', {
            viewId: 'my-view',
            title: 'My View',
            icon: 'star',
          }),
        );
      },
    };
    host.registerExtension('view-ext', module);
    expect(host.getRegisteredViews().has('my-view')).toBe(true);
  });

  it('should clean up subscriptions on deactivate', async () => {
    const { host, registry } = createHost();
    const deactivate = vi.fn();
    const module: ExtensionModule = {
      activate(_ctx: ExtensionContext, api: TerminalMindAPI) {
        _ctx.subscriptions.push(
          api.commands.register('temp.cmd', async () => 'temp'),
        );
      },
      deactivate,
    };
    host.registerExtension('cleanup-ext', module);
    expect(registry.getCommand('temp.cmd')).toBeDefined();

    await host.deactivateExtension('cleanup-ext');
    expect(deactivate).toHaveBeenCalledOnce();
    expect(registry.getCommand('temp.cmd')).toBeUndefined();
  });

  it('should emit extension.activated and extension.deactivated events', async () => {
    const { host, events } = createHost();
    const activatedSpy = vi.fn();
    const deactivatedSpy = vi.fn();
    events.on('extension.activated', activatedSpy);
    events.on('extension.deactivated', deactivatedSpy);

    const module: ExtensionModule = { activate() {} };
    host.registerExtension('evt-ext', module);
    expect(activatedSpy).toHaveBeenCalledWith({ extensionId: 'evt-ext' });

    await host.deactivateExtension('evt-ext');
    expect(deactivatedSpy).toHaveBeenCalledWith({ extensionId: 'evt-ext' });
  });

  it('should throw when registering duplicate extension', () => {
    const { host } = createHost();
    const module: ExtensionModule = { activate() {} };
    host.registerExtension('dup-ext', module);
    expect(() => host.registerExtension('dup-ext', module)).toThrow('already registered');
  });
});
