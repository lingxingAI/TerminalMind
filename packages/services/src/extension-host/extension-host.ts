import type {
  Command,
  CommandContext,
  Disposable,
  ICommandRegistry,
  IEventBus,
  EventType,
  EventPayloadMap,
} from '@terminalmind/core';
import type {
  ExtensionModule,
  ExtensionContext,
  TerminalMindAPI,
  CommandsNamespace,
  ViewsNamespace,
  EventsNamespace,
  SidebarViewProvider,
} from '@terminalmind/api';

interface ExtensionEntry {
  readonly id: string;
  readonly module: ExtensionModule;
  readonly context: ExtensionContext;
  active: boolean;
}

export class ExtensionHost {
  private readonly extensions = new Map<string, ExtensionEntry>();
  private readonly sidebarViews = new Map<string, SidebarViewProvider>();

  constructor(
    private readonly commandRegistry: ICommandRegistry,
    private readonly eventBus: IEventBus,
  ) {}

  registerExtension(id: string, module: ExtensionModule): void {
    if (this.extensions.has(id)) {
      throw new Error(`Extension "${id}" is already registered`);
    }

    const context: ExtensionContext = {
      extensionId: id,
      subscriptions: [],
    };

    const api = this.createAPI(context);

    this.extensions.set(id, { id, module, context, active: false });

    module.activate(context, api);

    const entry = this.extensions.get(id)!;
    entry.active = true;

    this.eventBus.emit('extension.activated', { extensionId: id });
  }

  async deactivateExtension(id: string): Promise<void> {
    const entry = this.extensions.get(id);
    if (!entry) {
      throw new Error(`Extension "${id}" not found`);
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
    for (const [id] of this.extensions) {
      await this.deactivateExtension(id);
    }
  }

  getRegisteredViews(): ReadonlyMap<string, SidebarViewProvider> {
    return this.sidebarViews;
  }

  private createAPI(context: ExtensionContext): TerminalMindAPI {
    const commands = this.createCommandsNamespace(context);
    const views = this.createViewsNamespace(context);
    const events = this.createEventsNamespace(context);
    return { commands, views, events };
  }

  private createCommandsNamespace(context: ExtensionContext): CommandsNamespace {
    const registry = this.commandRegistry;
    return {
      register: (id: string, handler: (args?: unknown) => Promise<unknown>): Disposable => {
        const command: Command = {
          id,
          title: id,
          category: context.extensionId,
          handler: async (args: Readonly<unknown>, _ctx: Readonly<CommandContext>) => handler(args),
        };
        const disposable = registry.register(command);
        context.subscriptions.push(disposable);
        return disposable;
      },
      execute: <T = unknown>(id: string, args?: unknown): Promise<T> => {
        return registry.execute<T>(id, args);
      },
      getRegisteredCommands: (): readonly string[] => {
        return registry.getCommands().map((c) => c.id);
      },
    };
  }

  private createViewsNamespace(context: ExtensionContext): ViewsNamespace {
    const views = this.sidebarViews;
    return {
      registerSidebarView: (viewId: string, provider: SidebarViewProvider): Disposable => {
        views.set(viewId, provider);
        const disposable: Disposable = {
          dispose: () => {
            views.delete(viewId);
          },
        };
        context.subscriptions.push(disposable);
        return disposable;
      },
    };
  }

  private createEventsNamespace(context: ExtensionContext): EventsNamespace {
    const bus = this.eventBus;
    return {
      on: <T extends EventType>(
        type: T,
        handler: (payload: Readonly<EventPayloadMap[T]>) => void,
      ): Disposable => {
        const disposable = bus.on(type, handler);
        context.subscriptions.push(disposable);
        return disposable;
      },
    };
  }
}
