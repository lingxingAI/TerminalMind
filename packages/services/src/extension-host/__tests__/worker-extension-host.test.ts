/// <reference types="vitest/globals" />

import { Worker } from 'node:worker_threads';
import {
  CommandRegistryImpl,
  EventBusImpl,
  PipelineEngineStub,
  ServiceContainer,
} from '@terminalmind/core';
import type { ExtensionManifest } from '@terminalmind/api';
import { registerTestServicesForExtensionAPI } from '../test-utils';
import { WorkerExtensionHost } from '../worker-extension-host';

vi.mock('node:worker_threads', () => ({
  Worker: vi.fn(),
}));

type MockWorker = {
  filename: string;
  sent: unknown[];
  on: (ev: string, fn: (...args: unknown[]) => void) => void;
  off: (ev: string, fn: (...args: unknown[]) => void) => void;
  emit: (ev: string, ...args: unknown[]) => void;
  postMessage: (msg: unknown) => void;
  terminate: ReturnType<typeof vi.fn>;
};

function createMockWorker(filename: string): MockWorker {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const mock: MockWorker = {
    filename,
    sent: [],
    on(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(fn);
    },
    off(ev, fn) {
      listeners.get(ev)?.delete(fn);
    },
    emit(ev, ...args) {
      for (const fn of listeners.get(ev) ?? []) fn(...args);
    },
    postMessage(msg) {
      mock.sent.push(msg);
      queueMicrotask(() => {
        const m = msg as { type?: string };
        if (m.type === 'init') {
          mock.emit('message', { type: 'ready' });
        }
      });
    },
    terminate: vi.fn(() => Promise.resolve()),
  };
  return mock;
}

let currentMock: MockWorker;

function minimalManifest(): ExtensionManifest {
  return {
    name: 'x',
    version: '1.0.0',
    terminalmind: {
      entry: 'index.js',
      activationEvents: ['*'],
    },
  };
}

function createWorkerHost() {
  const services = new ServiceContainer();
  registerTestServicesForExtensionAPI(services);
  const events = new EventBusImpl();
  const pipeline = new PipelineEngineStub();
  const registry = new CommandRegistryImpl({ services, events, pipeline });
  const host = new WorkerExtensionHost(registry, events, services, undefined, {
    bootstrapScriptPath: 'D:\\mock\\worker-bootstrap.js',
    apiInvokeTimeoutMs: 5000,
  });
  return { host, registry, events };
}

describe('WorkerExtensionHost', () => {
  beforeEach(() => {
    vi.mocked(Worker).mockImplementation((filename: string | URL) => {
      const path = typeof filename === 'string' ? filename : filename.href;
      currentMock = createMockWorker(path);
      return currentMock as unknown as InstanceType<typeof Worker>;
    });
  });

  it('spawnWorker creates a worker with the bootstrap script path', async () => {
    const { host } = createWorkerHost();
    await host.spawnWorker('ext-1', minimalManifest(), '/install/ext');
    expect(Worker).toHaveBeenCalledWith('D:\\mock\\worker-bootstrap.js', { type: 'module' });
    expect(currentMock.filename).toBe('D:\\mock\\worker-bootstrap.js');
  });

  it('terminateWorker sends terminate and disposes the worker', async () => {
    const { host } = createWorkerHost();
    await host.spawnWorker('ext-1', minimalManifest(), '/install/ext');
    currentMock.sent.length = 0;
    await host.terminateWorker('ext-1');
    expect(currentMock.sent.some((m) => (m as { type?: string }).type === 'terminate')).toBe(true);
    expect(currentMock.terminate).toHaveBeenCalled();
  });

  it('terminateWorker on unknown id is a no-op', async () => {
    const { host } = createWorkerHost();
    await expect(host.terminateWorker('missing')).resolves.toBeUndefined();
  });

  it('emits extension.workerCrashed when the worker exits with non-zero code', async () => {
    const { host, events } = createWorkerHost();
    const spy = vi.fn();
    events.on('extension.workerCrashed', spy);
    await host.spawnWorker('ext-crash', minimalManifest(), '/install/ext');
    currentMock.emit('exit', 1);
    expect(spy).toHaveBeenCalledWith({
      extensionId: 'ext-crash',
      error: 'Worker exited with code 1',
    });
  });

  it('routes api.invoke to api.result for getRegisteredCommands', async () => {
    const { host, registry } = createWorkerHost();
    await host.spawnWorker('ext-api', minimalManifest(), '/install/ext');
    registry.register({
      id: 'x',
      title: 'x',
      category: 'c',
      handler: async () => undefined,
    });
    currentMock.emit('message', {
      type: 'api.invoke',
      callId: 'wtest',
      namespace: 'commands',
      method: 'getRegisteredCommands',
      args: [],
    });
    await new Promise<void>((r) => setImmediate(r));
    await vi.waitFor(
      () => {
        const m = currentMock.sent.find(
          (msg) =>
            (msg as { type?: string; callId?: string }).type === 'api.result' &&
            (msg as { callId?: string }).callId === 'wtest',
        );
        return m !== undefined;
      },
      { timeout: 2000 },
    );
    const resultMsg = currentMock.sent.find(
      (m) => (m as { type?: string }).type === 'api.result' && (m as { callId?: string }).callId === 'wtest',
    ) as { type: 'api.result'; result: unknown };
    expect(resultMsg).toBeDefined();
    expect(Array.isArray(resultMsg.result)).toBe(true);
    expect((resultMsg.result as string[]).includes('x')).toBe(true);
  });

  it('rejects spawnWorker when a worker is already running for the extension', async () => {
    const { host } = createWorkerHost();
    await host.spawnWorker('ext-dup', minimalManifest(), '/install/ext');
    await expect(host.spawnWorker('ext-dup', minimalManifest(), '/install/ext')).rejects.toThrow(
      'already running',
    );
  });
});
