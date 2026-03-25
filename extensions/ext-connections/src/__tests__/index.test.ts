import { describe, it, expect } from 'vitest';
import { ExtensionHost, registerTestServicesForExtensionAPI } from '@terminalmind/services';
import { CommandRegistryImpl, EventBusImpl, ServiceContainer, PipelineEngineStub } from '@terminalmind/core';
import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';
import { activate } from '../index.js';

const CONNECTION_COMMANDS = [
  'connections.create',
  'connections.edit',
  'connections.delete',
  'connections.search',
  'connections.import',
  'connections.export',
] as const;

function createHost() {
  const services = new ServiceContainer();
  registerTestServicesForExtensionAPI(services);
  const events = new EventBusImpl();
  const pipeline = new PipelineEngineStub();
  const registry = new CommandRegistryImpl({ services, events, pipeline });
  const host = new ExtensionHost(registry, events, services);
  return { host, registry };
}

describe('ext-connections activate', () => {
  it('registers all connection commands and the connections-tree sidebar view', () => {
    const { host, registry } = createHost();
    const module = {
      activate(ctx: ExtensionContext, api: TerminalMindAPI) {
        activate(ctx, api);
      },
    };
    host.registerExtension('ext-connections', module);

    for (const id of CONNECTION_COMMANDS) {
      expect(registry.getCommand(id), `command ${id}`).toBeDefined();
    }
    expect(host.getRegisteredViews().has('connections-tree')).toBe(true);
  });
});
