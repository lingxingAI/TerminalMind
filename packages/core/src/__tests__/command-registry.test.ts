/// <reference types="vitest/globals" />

import { CommandRegistryImpl } from '../command-registry';
import { ServiceContainer } from '../service-container';
import { EventBusImpl } from '../event-bus';
import { PipelineEngineStub } from '../pipeline-engine-stub';

function createRegistry() {
  const services = new ServiceContainer();
  const events = new EventBusImpl();
  const pipeline = new PipelineEngineStub();
  return new CommandRegistryImpl({ services, events, pipeline });
}

describe('CommandRegistryImpl', () => {
  it('should register and execute a command', async () => {
    const registry = createRegistry();
    registry.register({
      id: 'test.hello',
      title: 'Hello',
      category: 'Test',
      handler: async () => 'world',
    });
    const result = await registry.execute<string>('test.hello');
    expect(result).toBe('world');
  });

  it('should pass args to command handler', async () => {
    const registry = createRegistry();
    registry.register({
      id: 'test.echo',
      title: 'Echo',
      category: 'Test',
      handler: async (args: Readonly<{ message: string }>) => args.message,
    });
    const result = await registry.execute<string>('test.echo', { message: 'ping' });
    expect(result).toBe('ping');
  });

  it('should throw on duplicate command registration', () => {
    const registry = createRegistry();
    const command = { id: 'dup', title: 'Dup', category: 'Test', handler: async () => {} };
    registry.register(command);
    expect(() => registry.register(command)).toThrow('Command already registered: dup');
  });

  it('should throw when executing a non-existent command', async () => {
    const registry = createRegistry();
    await expect(registry.execute('nonexistent')).rejects.toThrow('Command not found: nonexistent');
  });

  it('should unregister a command via Disposable', async () => {
    const registry = createRegistry();
    const disposable = registry.register({
      id: 'temp.cmd',
      title: 'Temp',
      category: 'Temp',
      handler: async () => 'ok',
    });
    expect(registry.getCommand('temp.cmd')).toBeDefined();
    disposable.dispose();
    expect(registry.getCommand('temp.cmd')).toBeUndefined();
  });

  it('should query commands by category', () => {
    const registry = createRegistry();
    registry.register({ id: 'a.1', title: 'A1', category: 'A', handler: async () => {} });
    registry.register({ id: 'a.2', title: 'A2', category: 'A', handler: async () => {} });
    registry.register({ id: 'b.1', title: 'B1', category: 'B', handler: async () => {} });
    expect(registry.getCommandsByCategory('A')).toHaveLength(2);
    expect(registry.getCommandsByCategory('B')).toHaveLength(1);
    expect(registry.getCommandsByCategory('C')).toHaveLength(0);
  });

  it('should list all commands', () => {
    const registry = createRegistry();
    registry.register({ id: 'x', title: 'X', category: 'X', handler: async () => {} });
    registry.register({ id: 'y', title: 'Y', category: 'Y', handler: async () => {} });
    expect(registry.getCommands()).toHaveLength(2);
  });
});
