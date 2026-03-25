import type { ICommandRegistry, IEventBus } from '@terminalmind/core';
import type { ServiceContainer } from '@terminalmind/core';
import type {
  ExtensionManifest,
  ExtensionModule,
  ExtensionContext,
  SidebarViewProvider,
  IPermissionManager,
} from '@terminalmind/api';
import { parseExtensionManifestFromPackageJson } from './manifest.js';
import { createTerminalMindAPI } from '../extension-api/create-api.js';
import type { ViewRegistries } from '../extension-api/create-api.js';
import type { IWorkerExtensionHost } from './worker-extension-host.js';

export interface ExtensionHostWorkerOptions {
  readonly workerExtensionHost?: IWorkerExtensionHost;
  readonly builtinExtensionIds?: readonly string[];
}

interface ExtensionEntry {
  readonly id: string;
  readonly module: ExtensionModule;
  readonly context: ExtensionContext;
  active: boolean;
}

export interface RegisterExtensionOptions {
  /** When false, permission-gated API methods require {@link IPermissionManager} grants. Default true (built-in). */
  readonly isBuiltin?: boolean;
}

export class ExtensionHost {
  private readonly extensions = new Map<string, ExtensionEntry>();
  private readonly workerManagedExtensions = new Set<string>();
  private readonly viewRegistries: ViewRegistries = {
    sidebar: new Map(),
    panel: new Map(),
    statusBar: new Map(),
  };

  private readonly workerExtensionHost: IWorkerExtensionHost | undefined;
  private readonly builtinExtensionIds: Set<string>;

  constructor(
    private readonly commandRegistry: ICommandRegistry,
    private readonly eventBus: IEventBus,
    private readonly services: ServiceContainer,
    private readonly permissionManager?: IPermissionManager,
    workerOptions?: ExtensionHostWorkerOptions,
  ) {
    this.workerExtensionHost = workerOptions?.workerExtensionHost;
    const ids = workerOptions?.builtinExtensionIds;
    this.builtinExtensionIds = new Set(
      ids ?? ['ext-terminal', 'ext-ai', 'ext-ssh', 'ext-sftp', 'ext-connections'],
    );
    this.eventBus.on('extension.workerCrashed', ({ extensionId }) => {
      this.workerManagedExtensions.delete(extensionId);
    });
  }

  /** Mark an extension ID as builtin (in-process only). */
  addBuiltinExtensionId(id: string): void {
    this.builtinExtensionIds.add(id);
  }

  /**
   * Parses a `package.json` object into a Phase 4 extension manifest (`terminalmind`, permissions, contributes).
   */
  static parsePackageJsonManifest(json: unknown): ExtensionManifest {
    return parseExtensionManifestFromPackageJson(json);
  }

  registerExtension(id: string, module: ExtensionModule, options?: RegisterExtensionOptions): void {
    if (this.extensions.has(id) || this.workerManagedExtensions.has(id)) {
      throw new Error(`Extension "${id}" is already registered`);
    }

    const context: ExtensionContext = {
      extensionId: id,
      subscriptions: [],
    };

    const isBuiltin = options?.isBuiltin ?? true;

    const api = createTerminalMindAPI({
      extensionId: id,
      context,
      services: this.services,
      eventBus: this.eventBus,
      commandRegistry: this.commandRegistry,
      permissionManager: this.permissionManager,
      isBuiltin,
      viewRegistries: this.viewRegistries,
    });

    this.extensions.set(id, { id, module, context, active: false });

    module.activate(context, api);

    const entry = this.extensions.get(id)!;
    entry.active = true;

    this.eventBus.emit('extension.activated', { extensionId: id });
  }

  /**
   * Activates from install dir: builtins stay in-process; others use the worker host when configured.
   */
  async activateExtension(
    id: string,
    manifest: ExtensionManifest,
    installPath: string,
    module?: ExtensionModule,
  ): Promise<void> {
    if (this.extensions.has(id) || this.workerManagedExtensions.has(id)) {
      throw new Error(`Extension "${id}" is already registered`);
    }
    if (this.builtinExtensionIds.has(id)) {
      if (!module) {
        throw new Error(`Builtin extension "${id}" requires an in-process ExtensionModule`);
      }
      this.registerExtension(id, module, { isBuiltin: true });
      return;
    }
    if (!this.workerExtensionHost) {
      throw new Error(
        `Extension "${id}" is not builtin and no worker extension host is configured`,
      );
    }
    await this.workerExtensionHost.spawnWorker(id, manifest, installPath);
    this.workerManagedExtensions.add(id);
    this.eventBus.emit('extension.activated', { extensionId: id });
  }

  async deactivateExtension(id: string): Promise<void> {
    if (this.workerManagedExtensions.has(id)) {
      await this.workerExtensionHost?.terminateWorker(id);
      this.workerManagedExtensions.delete(id);
      this.eventBus.emit('extension.deactivated', { extensionId: id });
      return;
    }

    const entry = this.extensions.get(id);
    if (!entry) {
      throw new Error(`Extension "${id}" is not found`);
    }
    if (!entry.active) return;

    if (entry.module.deactivate) {
      entry.module.deactivate();
    }

    for (const sub of entry.context.subscriptions) {
      sub.dispose();
    }
    entry.context.subscriptions.length = 0;
    entry.active = false;

    this.eventBus.emit('extension.deactivated', { extensionId: id });
  }

  async deactivateAll(): Promise<void> {
    const workerIds = [...this.workerManagedExtensions];
    for (const id of workerIds) {
      await this.deactivateExtension(id);
    }
    const inProcess = [...this.extensions.keys()];
    for (const id of inProcess) {
      await this.deactivateExtension(id);
    }
  }

  getRegisteredViews(): ReadonlyMap<string, SidebarViewProvider> {
    return this.viewRegistries.sidebar;
  }

  getRegisteredPanelViews() {
    return this.viewRegistries.panel;
  }

  getRegisteredStatusBarItems() {
    return this.viewRegistries.statusBar;
  }
}
