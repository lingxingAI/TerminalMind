import { EventEmitter } from 'node:events';
import { Worker as NodeWorkerThread, type WorkerOptions } from 'node:worker_threads';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import type { Disposable, ICommandRegistry, IEventBus, EventType } from '@terminalmind/core';
import type { ServiceContainer } from '@terminalmind/core';
import type {
  ExtensionContext,
  ExtensionManifest,
  IPermissionManager,
  PanelViewProvider,
  SidebarViewProvider,
  StatusBarItemProvider,
  TerminalMindAPI,
} from '@terminalmind/api';
import { createTerminalMindAPI } from '../extension-api/create-api.js';
import type { ViewRegistries } from '../extension-api/create-api.js';
import type { WorkerMessage } from './worker-protocol.js';
import { isWorkerMessage } from './worker-protocol.js';

export type WorkerExtensionStatus = 'running' | 'crashed' | 'terminated';

export interface IWorkerExtensionHost {
  spawnWorker(extensionId: string, manifest: ExtensionManifest, installPath: string): Promise<void>;
  terminateWorker(extensionId: string): Promise<void>;
  isWorkerRunning(extensionId: string): boolean;
  listWorkers(): { extensionId: string; status: WorkerExtensionStatus }[];
}

export type WorkerApiPermissionCheck = (
  extensionId: string,
  manifest: ExtensionManifest,
  namespace: string,
  method: string,
) => void | Promise<void>;

export interface WorkerExtensionHostOptions {
  /** Absolute path to compiled `worker-bootstrap.js`. Defaults next to this module in `dist`. */
  readonly bootstrapScriptPath?: string;
  readonly apiInvokeTimeoutMs?: number;
  /** When true, respawn worker after a crash. Default false. */
  readonly autoRetryOnCrash?: boolean;
  readonly assertApiPermission?: WorkerApiPermissionCheck;
}

interface WorkerRecord {
  extensionId: string;
  worker: NodeWorkerThread | undefined;
  status: WorkerExtensionStatus;
  manifest: ExtensionManifest;
  installPath: string;
  context: ExtensionContext;
  intentionalTerminate: boolean;
  commandBridge: Map<string, Disposable>;
  eventBridge: Map<string, Disposable>;
  viewBridge: Map<string, Disposable>;
  api: TerminalMindAPI;
}

function defaultBootstrapPath(): string {
  return join(fileURLToPath(new URL('.', import.meta.url)), 'worker-bootstrap.js');
}

/** `Worker` from `worker_threads` (DOM `Worker` also exists when `lib` includes DOM). */
function workerEmitter(worker: NodeWorkerThread): EventEmitter {
  return worker as unknown as EventEmitter;
}

export class WorkerExtensionHost implements IWorkerExtensionHost {
  private readonly workers = new Map<string, WorkerRecord>();
  private readonly pendingReverseFromWorker = new Map<
    string,
    Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>
  >();
  private reverseCallSeq = 0;

  private readonly bootstrapPath: string;
  private readonly apiInvokeTimeoutMs: number;
  private readonly autoRetryOnCrash: boolean;
  private readonly assertApiPermission?: WorkerApiPermissionCheck;

  constructor(
    private readonly commandRegistry: ICommandRegistry,
    private readonly eventBus: IEventBus,
    private readonly services: ServiceContainer,
    private readonly permissionManager: IPermissionManager | undefined,
    options: WorkerExtensionHostOptions = {},
  ) {
    this.bootstrapPath = options.bootstrapScriptPath ?? defaultBootstrapPath();
    this.apiInvokeTimeoutMs = options.apiInvokeTimeoutMs ?? 30_000;
    this.autoRetryOnCrash = options.autoRetryOnCrash ?? false;
    this.assertApiPermission = options.assertApiPermission;
  }

  listWorkers(): { extensionId: string; status: WorkerExtensionStatus }[] {
    return [...this.workers.entries()].map(([extensionId, w]) => ({
      extensionId,
      status: w.status,
    }));
  }

  isWorkerRunning(extensionId: string): boolean {
    const w = this.workers.get(extensionId);
    return w !== undefined && w.status === 'running';
  }

  async spawnWorker(
    extensionId: string,
    manifest: ExtensionManifest,
    installPath: string,
  ): Promise<void> {
    const existing = this.workers.get(extensionId);
    if (existing?.status === 'running') {
      throw new Error(`Worker for extension "${extensionId}" is already running`);
    }
    if (existing) {
      this.workers.delete(extensionId);
    }

    const entryPath = join(installPath, manifest.terminalmind.entry);
    const entryFileUrl = pathToFileURL(entryPath).href;

    const context: ExtensionContext = {
      extensionId,
      subscriptions: [],
    };

    const viewRegistries: ViewRegistries = {
      sidebar: new Map(),
      panel: new Map(),
      statusBar: new Map(),
    };

    const api = createTerminalMindAPI({
      extensionId,
      context,
      services: this.services,
      eventBus: this.eventBus,
      commandRegistry: this.commandRegistry,
      permissionManager: this.permissionManager,
      isBuiltin: false,
      viewRegistries,
    });

    const worker = new NodeWorkerThread(this.bootstrapPath, { type: 'module' } as WorkerOptions);

    const record: WorkerRecord = {
      extensionId,
      worker,
      status: 'running',
      manifest,
      installPath,
      context,
      intentionalTerminate: false,
      commandBridge: new Map(),
      eventBridge: new Map(),
      viewBridge: new Map(),
      api,
    };
    this.workers.set(extensionId, record);

    const onMessage = (raw: unknown): void => {
      void this.handleWorkerMessage(extensionId, raw);
    };
    const we = workerEmitter(worker);
    we.on('message', onMessage);

    we.on('error', (err: unknown) => {
      this.failWorker(extensionId, err instanceof Error ? err.message : String(err));
    });

    we.on('exit', (code: number) => {
      const rec = this.workers.get(extensionId);
      if (!rec) return;

      rec.worker = undefined;

      if (rec.intentionalTerminate) {
        rec.status = 'terminated';
        this.disposeBridges(rec);
        return;
      }

      if (code !== 0) {
        rec.status = 'crashed';
        this.eventBus.emit('extension.workerCrashed', {
          extensionId,
          error: `Worker exited with code ${code}`,
        });
        this.disposeBridges(rec);
        void this.maybeRetry(extensionId, manifest, installPath);
      } else {
        rec.status = 'terminated';
        this.disposeBridges(rec);
      }
    });

    const init: WorkerMessage = {
      type: 'init',
      entryPath: entryFileUrl,
      extensionId,
    };
    worker.postMessage(init);

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker "${extensionId}" timed out waiting for ready`));
        }, this.apiInvokeTimeoutMs);

        const once = (raw: unknown): void => {
          if (!isWorkerMessage(raw)) return;
          if (raw.type === 'ready') {
            clearTimeout(timeout);
            we.off('message', once);
            resolve();
            return;
          }
          if (raw.type === 'error') {
            clearTimeout(timeout);
            we.off('message', once);
            reject(new Error(raw.error));
          }
        };
        we.on('message', once);
      });
    } catch (e) {
      record.intentionalTerminate = true;
      await worker.terminate().catch(() => undefined);
      this.workers.delete(extensionId);
      throw e;
    }
  }

  async terminateWorker(extensionId: string): Promise<void> {
    const rec = this.workers.get(extensionId);
    if (!rec) {
      return;
    }
    rec.intentionalTerminate = true;
    if (rec.worker) {
      rec.worker.postMessage({ type: 'terminate' } satisfies WorkerMessage);
      await rec.worker.terminate();
    }
    rec.status = 'terminated';
    this.disposeBridges(rec);
    this.rejectAllReversePending(extensionId, new Error(`Worker "${extensionId}" terminated`));
    this.workers.delete(extensionId);
  }

  private async maybeRetry(
    extensionId: string,
    manifest: ExtensionManifest,
    installPath: string,
  ): Promise<void> {
    if (!this.autoRetryOnCrash) return;
    this.workers.delete(extensionId);
    try {
      await this.spawnWorker(extensionId, manifest, installPath);
    } catch {
      /* best-effort retry */
    }
  }

  private disposeBridges(rec: WorkerRecord): void {
    for (const d of rec.commandBridge.values()) d.dispose();
    for (const d of rec.eventBridge.values()) d.dispose();
    for (const d of rec.viewBridge.values()) d.dispose();
    rec.commandBridge.clear();
    rec.eventBridge.clear();
    rec.viewBridge.clear();
    for (const sub of rec.context.subscriptions) {
      sub.dispose();
    }
    rec.context.subscriptions.length = 0;
    this.rejectAllReversePending(rec.extensionId, new Error(`Worker "${rec.extensionId}" stopped`));
  }

  private rejectAllReversePending(extensionId: string, err: Error): void {
    const sub = this.pendingReverseFromWorker.get(extensionId);
    if (!sub) return;
    for (const p of sub.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    sub.clear();
    this.pendingReverseFromWorker.delete(extensionId);
  }

  private async handleWorkerMessage(extensionId: string, raw: unknown): Promise<void> {
    if (!isWorkerMessage(raw)) return;
    const rec = this.workers.get(extensionId);
    if (!rec) return;

    if (raw.type === 'api.result' || raw.type === 'api.error') {
      const sub = this.pendingReverseFromWorker.get(extensionId);
      const p = sub?.get(raw.callId);
      if (p) {
        clearTimeout(p.timer);
        sub!.delete(raw.callId);
        if (raw.type === 'api.result') p.resolve(raw.result);
        else p.reject(new Error(raw.error));
      }
      return;
    }

    if (raw.type === 'api.invoke') {
      try {
        await this.assertApiPermission?.(extensionId, rec.manifest, raw.namespace, raw.method);
        const w = rec.worker;
        if (!w) {
          throw new Error(`Worker "${extensionId}" is not running`);
        }
        const result = await this.dispatchApiInvoke(rec, raw);
        w.postMessage({ type: 'api.result', callId: raw.callId, result } satisfies WorkerMessage);
      } catch (e) {
        const w = rec.worker;
        if (w) {
          w.postMessage({
            type: 'api.error',
            callId: raw.callId,
            error: e instanceof Error ? e.message : String(e),
          } satisfies WorkerMessage);
        }
      }
      return;
    }
  }

  private async dispatchGeneric(
    rec: WorkerRecord,
    namespace: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    const ns = rec.api[namespace as keyof TerminalMindAPI] as unknown as
      | Record<string, unknown>
      | undefined;
    if (ns === undefined || typeof ns !== 'object') {
      throw new Error(`Unknown namespace: ${namespace}`);
    }
    const fn = ns[method];
    if (typeof fn !== 'function') {
      throw new Error(`Unknown API method: ${namespace}.${method}`);
    }
    return await (fn as (...a: unknown[]) => unknown)(...args);
  }

  private async dispatchApiInvoke(
    rec: WorkerRecord,
    msg: Extract<WorkerMessage, { type: 'api.invoke' }>,
  ): Promise<unknown> {
    const { namespace, method, args } = msg;

    if (namespace === 'commands' && method === 'register') {
      const [id] = args as [string];
      const existing = rec.commandBridge.get(id);
      existing?.dispose();
      const disposable = rec.api.commands.register(id, async (cmdArgs) =>
        this.reverseInvoke(rec.extensionId, id, cmdArgs),
      );
      rec.commandBridge.set(id, disposable);
      return undefined;
    }

    if (namespace === 'commands' && method === 'disposeRegistered') {
      const [id] = args as [string];
      const d = rec.commandBridge.get(id);
      d?.dispose();
      rec.commandBridge.delete(id);
      return undefined;
    }

    if (namespace === 'events' && method === 'subscribe') {
      const [type, subId] = args as [EventType, string];
      const disposable = rec.api.events.on(type, (payload) => {
        const w = rec.worker;
        if (!w) return;
        w.postMessage({
          type: 'event',
          eventType: type,
          payload: { __tm: { subId }, data: payload },
        } satisfies WorkerMessage);
      });
      rec.eventBridge.set(subId, disposable);
      return undefined;
    }

    if (namespace === 'events' && method === 'unsubscribe') {
      const [subId] = args as [string];
      const d = rec.eventBridge.get(subId);
      d?.dispose();
      rec.eventBridge.delete(subId);
      return undefined;
    }

    if (namespace === 'views' && method === 'registerSidebarView') {
      const [viewId, provider] = args as [string, SidebarViewProvider];
      const key = `sidebar:${viewId}`;
      rec.viewBridge.get(key)?.dispose();
      const d = rec.api.views.registerSidebarView(viewId, provider);
      rec.viewBridge.set(key, d);
      return undefined;
    }

    if (namespace === 'views' && method === 'registerPanelView') {
      const [viewId, provider] = args as [string, PanelViewProvider];
      const key = `panel:${viewId}`;
      rec.viewBridge.get(key)?.dispose();
      const d = rec.api.views.registerPanelView(viewId, provider);
      rec.viewBridge.set(key, d);
      return undefined;
    }

    if (namespace === 'views' && method === 'registerStatusBarItem') {
      const [itemId, provider] = args as [string, StatusBarItemProvider];
      const key = `status:${itemId}`;
      rec.viewBridge.get(key)?.dispose();
      const d = rec.api.views.registerStatusBarItem(itemId, provider);
      rec.viewBridge.set(key, d);
      return undefined;
    }

    if (namespace === 'views' && method === 'disposeRegisteredView') {
      const [viewId] = args as [string];
      const key = `sidebar:${viewId}`;
      rec.viewBridge.get(key)?.dispose();
      rec.viewBridge.delete(key);
      return undefined;
    }

    if (namespace === 'views' && method === 'disposeRegisteredPanelView') {
      const [viewId] = args as [string];
      const key = `panel:${viewId}`;
      rec.viewBridge.get(key)?.dispose();
      rec.viewBridge.delete(key);
      return undefined;
    }

    if (namespace === 'views' && method === 'disposeRegisteredStatusBarItem') {
      const [itemId] = args as [string];
      const key = `status:${itemId}`;
      rec.viewBridge.get(key)?.dispose();
      rec.viewBridge.delete(key);
      return undefined;
    }

    return this.dispatchGeneric(rec, namespace, method, args);
  }

  private reverseInvoke(extensionId: string, commandId: string, cmdArgs: unknown): Promise<unknown> {
    const rec = this.workers.get(extensionId);
    if (!rec || rec.status !== 'running' || !rec.worker) {
      return Promise.reject(new Error(`Worker "${extensionId}" is not running`));
    }
    const callId = `r${++this.reverseCallSeq}`;
    return new Promise((resolve, reject) => {
      let sub = this.pendingReverseFromWorker.get(extensionId);
      if (!sub) {
        sub = new Map();
        this.pendingReverseFromWorker.set(extensionId, sub);
      }
      const timer = setTimeout(() => {
        sub!.delete(callId);
        reject(new Error(`Reverse API invoke timed out after ${this.apiInvokeTimeoutMs}ms`));
      }, this.apiInvokeTimeoutMs);
      sub.set(callId, { resolve, reject, timer });
      rec.worker!.postMessage({
        type: 'api.invoke',
        callId,
        namespace: '__worker',
        method: 'runCommand',
        args: [commandId, cmdArgs],
      } satisfies WorkerMessage);
    });
  }

  private failWorker(extensionId: string, error: string): void {
    const rec = this.workers.get(extensionId);
    if (!rec) return;
    if (!rec.intentionalTerminate) {
      rec.status = 'crashed';
      this.eventBus.emit('extension.workerCrashed', { extensionId, error });
    }
    this.rejectAllReversePending(extensionId, new Error(error));
    void rec.worker?.terminate();
    rec.worker = undefined;
    this.disposeBridges(rec);
  }
}
