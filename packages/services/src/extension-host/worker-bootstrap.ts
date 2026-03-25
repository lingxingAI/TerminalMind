import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import type { Disposable } from '@terminalmind/core';
import type { EventType, EventPayloadMap } from '@terminalmind/core';
import type {
  AINamespace,
  ConfigNamespace,
  ConnectionsNamespace,
  ExtensionContext,
  FSNamespace,
  PanelViewProvider,
  PipelineNamespace,
  SidebarViewProvider,
  StatusBarItemProvider,
  TerminalMindAPI,
  TerminalNamespace,
  WindowNamespace,
} from '@terminalmind/api';
import type { WorkerMessage } from './worker-protocol.js';

const WORKER_NS = '__worker';
const RUN_COMMAND = 'runCommand';

function post(msg: WorkerMessage): void {
  parentPort?.postMessage(msg);
}

function assertParentPort(): NonNullable<typeof parentPort> {
  if (!parentPort) {
    throw new Error('worker-bootstrap must run inside a Node.js Worker thread');
  }
  return parentPort;
}

const port = assertParentPort();

/**
 * API surface inside the worker; calls are proxied to the main thread via {@link WorkerMessage}.
 */
export function createWorkerApiProxy(): TerminalMindAPI {
  let callSeq = 0;
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const commandHandlers = new Map<string, (args?: unknown) => Promise<unknown>>();
  const eventHandlerBySubId = new Map<string, (payload: unknown) => void>();
  const locallyRegisteredCommandIds = new Set<string>();

  function invokeAsync(namespace: string, method: string, args: unknown[]): Promise<unknown> {
    const callId = `w${++callSeq}`;
    return new Promise((resolve, reject) => {
      pending.set(callId, { resolve, reject });
      post({ type: 'api.invoke', callId, namespace, method, args });
    });
  }

  function createNamespaceProxy<N>(namespace: string): N {
    return new Proxy({} as object, {
      get(_, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        return (...args: unknown[]) => invokeAsync(namespace, prop, args);
      },
    }) as N;
  }

  port.on('message', (raw: unknown) => {
    if (raw === null || typeof raw !== 'object' || !('type' in raw)) return;
    const msg = raw as WorkerMessage;
    if (msg.type === 'api.result') {
      const p = pending.get(msg.callId);
      if (p) {
        pending.delete(msg.callId);
        p.resolve(msg.result);
      }
      return;
    }
    if (msg.type === 'api.error') {
      const p = pending.get(msg.callId);
      if (p) {
        pending.delete(msg.callId);
        p.reject(new Error(msg.error));
      }
      return;
    }
    if (msg.type === 'api.invoke' && msg.namespace === WORKER_NS && msg.method === RUN_COMMAND) {
      void handleRunCommand(msg);
      return;
    }
    if (msg.type === 'event') {
      const envelope = msg.payload as { __tm?: { subId?: string }; data?: unknown };
      const subId = envelope?.__tm?.subId;
      if (subId) {
        const h = eventHandlerBySubId.get(subId);
        if (h) {
          h(envelope.data ?? envelope);
        }
      }
      return;
    }
  });

  async function handleRunCommand(msg: Extract<WorkerMessage, { type: 'api.invoke' }>): Promise<void> {
    const [commandId, cmdArgs] = msg.args as [string, unknown];
    const handler = commandHandlers.get(commandId);
    try {
      const result = handler ? await handler(cmdArgs as unknown) : undefined;
      post({ type: 'api.result', callId: msg.callId, result });
    } catch (e) {
      post({
        type: 'api.error',
        callId: msg.callId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const commands: TerminalMindAPI['commands'] = {
    register: (id: string, handler: (args?: unknown) => Promise<unknown>): Disposable => {
      commandHandlers.set(id, handler);
      locallyRegisteredCommandIds.add(id);
      void invokeAsync('commands', 'register', [id]).catch(() => {
        commandHandlers.delete(id);
        locallyRegisteredCommandIds.delete(id);
      });
      return {
        dispose: () => {
          commandHandlers.delete(id);
          locallyRegisteredCommandIds.delete(id);
          void invokeAsync('commands', 'disposeRegistered', [id]);
        },
      };
    },
    execute: <T = unknown>(id: string, args?: unknown): Promise<T> =>
      invokeAsync('commands', 'execute', [id, args]) as Promise<T>,
    getRegisteredCommands: (): readonly string[] => [...locallyRegisteredCommandIds],
  };

  const views: TerminalMindAPI['views'] = {
    registerSidebarView: (viewId: string, provider: SidebarViewProvider): Disposable => {
      void invokeAsync('views', 'registerSidebarView', [viewId, provider]);
      return {
        dispose: () => {
          void invokeAsync('views', 'disposeRegisteredView', [viewId]);
        },
      };
    },
    registerPanelView: (viewId: string, provider: PanelViewProvider): Disposable => {
      void invokeAsync('views', 'registerPanelView', [viewId, provider]);
      return {
        dispose: () => {
          void invokeAsync('views', 'disposeRegisteredPanelView', [viewId]);
        },
      };
    },
    registerStatusBarItem: (itemId: string, provider: StatusBarItemProvider): Disposable => {
      void invokeAsync('views', 'registerStatusBarItem', [itemId, provider]);
      return {
        dispose: () => {
          void invokeAsync('views', 'disposeRegisteredStatusBarItem', [itemId]);
        },
      };
    },
  };

  const events: TerminalMindAPI['events'] = {
    on: <T extends EventType>(
      type: T,
      handler: (payload: Readonly<EventPayloadMap[T]>) => void,
    ): Disposable => {
      const subId = `ev${++callSeq}`;
      eventHandlerBySubId.set(subId, (p) => {
        handler(p as Readonly<EventPayloadMap[T]>);
      });
      void invokeAsync('events', 'subscribe', [type, subId]);
      return {
        dispose: () => {
          eventHandlerBySubId.delete(subId);
          void invokeAsync('events', 'unsubscribe', [subId]);
        },
      };
    },
  };

  return {
    commands,
    views,
    events,
    terminal: createNamespaceProxy<TerminalNamespace>('terminal'),
    connections: createNamespaceProxy<ConnectionsNamespace>('connections'),
    ai: createNamespaceProxy<AINamespace>('ai'),
    fs: createNamespaceProxy<FSNamespace>('fs'),
    pipeline: createNamespaceProxy<PipelineNamespace>('pipeline'),
    config: createNamespaceProxy<ConfigNamespace>('config'),
    window: createNamespaceProxy<WindowNamespace>('window'),
  };
}

port.on('message', (raw: unknown) => {
  if (raw === null || typeof raw !== 'object' || !('type' in raw)) return;
  const msg = raw as WorkerMessage;
  if (msg.type === 'terminate') {
    process.exit(0);
    return;
  }
  if (msg.type !== 'init') return;

  void (async () => {
    const api = createWorkerApiProxy();
    const entryUrl = pathToFileURL(msg.entryPath).href;
    try {
      const mod = (await import(entryUrl)) as {
        activate?: (ctx: ExtensionContext, a: TerminalMindAPI) => void | Promise<void>;
      };
      if (typeof mod.activate !== 'function') {
        post({ type: 'error', error: 'Extension module must export activate()' });
        return;
      }
      const ctx: ExtensionContext = {
        extensionId: msg.extensionId,
        subscriptions: [],
      };
      await mod.activate(ctx, api);
      post({ type: 'ready' });
    } catch (e) {
      post({ type: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  })();
});
