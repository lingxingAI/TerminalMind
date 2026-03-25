import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from '@terminalmind/core';
import type { ServiceContainer } from '@terminalmind/core';
import type { AIProviderService } from '../ai/ai-provider-service.js';
import { PipelineEngineImpl } from '../ai/pipeline/pipeline-engine.js';
import { ConfigService } from '../config/index.js';
import type { IConnectionStore } from '../connection/index.js';
import type { ITerminalService, TerminalSession } from '../terminal/terminal-service.js';
import {
  EXTENSION_AI_PROVIDER_SERVICE,
  EXTENSION_CONFIG_SERVICE,
  EXTENSION_CONNECTION_STORE,
  EXTENSION_PIPELINE_ENGINE,
  EXTENSION_TERMINAL_SERVICE,
} from '../extension-api/service-tokens.js';

function createStubTerminalService(): ITerminalService {
  const sessions = new Map<string, TerminalSession>();

  return {
    async create(options) {
      const id = randomUUID();
      const onData = new EventEmitter<string>();
      const onExit = new EventEmitter<{ readonly exitCode: number }>();
      const session: TerminalSession = {
        id,
        title: options.title ?? 'stub',
        pid: 0,
        shellPath: options.shell ?? '/bin/sh',
        cwd: options.cwd ?? '/',
        status: 'running',
        exitCode: undefined,
        createdAt: Date.now(),
        write() {},
        resize() {},
        kill() {},
        onData: onData.event,
        onExit: onExit.event,
      };
      sessions.set(id, session);
      return session;
    },
    getSession(id) {
      return sessions.get(id);
    },
    listSessions() {
      return [...sessions.values()];
    },
    async destroy(id) {
      sessions.delete(id);
    },
  };
}

function createStubConnectionStore(): IConnectionStore {
  const onChangeEmitter = new EventEmitter<{
    readonly type: 'added' | 'updated' | 'removed';
    readonly profileId: string;
  }>();
  return {
    list: async () => [],
    get: async () => undefined,
    save: async () => {},
    remove: async () => {},
    import: async () => [],
    export: async () => '[]',
    onChange: onChangeEmitter.event,
  };
}

function createStubAIProviderService(): Pick<
  AIProviderService,
  'complete' | 'stream' | 'registerProvider' | 'listProviders'
> {
  return {
    async complete() {
      return { content: '', model: 'stub' };
    },
    async *stream() {
      yield { content: '', done: true };
    },
    registerProvider() {
      return { dispose: () => {} };
    },
    listProviders() {
      return [];
    },
  };
}

/** Registers services required by {@link createTerminalMindAPI} (for tests and in-process harnesses). */
export function registerTestServicesForExtensionAPI(services: ServiceContainer): void {
  services.register(EXTENSION_TERMINAL_SERVICE, () => createStubTerminalService());
  services.register(EXTENSION_CONNECTION_STORE, () => createStubConnectionStore());
  services.register(EXTENSION_AI_PROVIDER_SERVICE, () => createStubAIProviderService() as AIProviderService);
  services.register(EXTENSION_PIPELINE_ENGINE, () => new PipelineEngineImpl());
  services.register(EXTENSION_CONFIG_SERVICE, () => new ConfigService(join(tmpdir(), `tm-ext-test-${randomUUID()}`)));
}
