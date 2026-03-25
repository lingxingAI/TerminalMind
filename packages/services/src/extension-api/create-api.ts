import type {
  CommandsNamespace,
  EventsNamespace,
  ExtensionContext,
  PanelViewProvider,
  SidebarViewProvider,
  StatusBarItemProvider,
  TerminalMindAPI,
  ViewsNamespace,
} from '@terminalmind/api';
import type { IPermissionManager } from '@terminalmind/api';
import type { ICommandRegistry, IEventBus, EventType, EventPayloadMap } from '@terminalmind/core';
import type { ServiceContainer } from '@terminalmind/core';
import type { Command } from '@terminalmind/core';
import { createTerminalNamespace } from './namespaces/terminal.js';
import { createConnectionsNamespace } from './namespaces/connections.js';
import { createAINamespace } from './namespaces/ai.js';
import { createFSNamespace } from './namespaces/fs.js';
import { createPipelineNamespace } from './namespaces/pipeline.js';
import { createConfigNamespace } from './namespaces/config.js';
import { createWindowNamespace } from './namespaces/window.js';
import {
  EXTENSION_AI_PROVIDER_SERVICE,
  EXTENSION_CONFIG_SERVICE,
  EXTENSION_CONNECTION_STORE,
  EXTENSION_PIPELINE_ENGINE,
  EXTENSION_TERMINAL_SERVICE,
} from './service-tokens.js';

export interface ViewRegistries {
  readonly sidebar: Map<string, SidebarViewProvider>;
  readonly panel: Map<string, PanelViewProvider>;
  readonly statusBar: Map<string, StatusBarItemProvider>;
}

export interface CreateTerminalMindAPIOptions {
  readonly extensionId: string;
  readonly context: ExtensionContext;
  readonly services: ServiceContainer;
  readonly eventBus: IEventBus;
  readonly commandRegistry: ICommandRegistry;
  readonly permissionManager?: IPermissionManager;
  readonly isBuiltin: boolean;
  readonly viewRegistries: ViewRegistries;
}

function createCommandsNamespace(
  extensionId: string,
  context: ExtensionContext,
  commandRegistry: ICommandRegistry,
  eventBus: IEventBus
): CommandsNamespace {
  return {
    register: (id: string, handler: (args?: unknown) => Promise<unknown>) => {
      const command: Command = {
        id,
        title: id,
        category: extensionId,
        sourceExtensionId: extensionId,
        handler: async (args: Readonly<unknown>, _ctx) => handler(args),
      };
      const disposable = commandRegistry.register(command);
      eventBus.emit('command.registered', { commandId: id, extensionId });
      context.subscriptions.push(disposable);
      return disposable;
    },
    execute: <T = unknown>(id: string, args?: unknown) => commandRegistry.execute<T>(id, args),
    getRegisteredCommands: () => commandRegistry.getCommands().map((c) => c.id),
  };
}

function createViewsNamespace(context: ExtensionContext, viewRegistries: ViewRegistries): ViewsNamespace {
  function registerOnMap<T>(map: Map<string, T>, key: string, provider: T) {
    map.set(key, provider);
    const disposable = {
      dispose: () => {
        map.delete(key);
      },
    };
    context.subscriptions.push(disposable);
    return disposable;
  }

  return {
    registerSidebarView: (viewId, provider) => registerOnMap(viewRegistries.sidebar, viewId, provider),
    registerPanelView: (viewId, provider) => registerOnMap(viewRegistries.panel, viewId, provider),
    registerStatusBarItem: (itemId, provider) => registerOnMap(viewRegistries.statusBar, itemId, provider),
  };
}

function createEventsNamespace(context: ExtensionContext, eventBus: IEventBus): EventsNamespace {
  return {
    on: <T extends EventType>(
      type: T,
      handler: (payload: Readonly<EventPayloadMap[T]>) => void
    ) => {
      const disposable = eventBus.on(type, handler);
      context.subscriptions.push(disposable);
      return disposable;
    },
  };
}

export function createTerminalMindAPI(options: CreateTerminalMindAPIOptions): TerminalMindAPI {
  const {
    extensionId,
    context,
    services,
    eventBus,
    commandRegistry,
    permissionManager,
    isBuiltin,
    viewRegistries,
  } = options;

  const terminal = services.get(EXTENSION_TERMINAL_SERVICE);
  const connectionStore = services.get(EXTENSION_CONNECTION_STORE);
  const aiProvider = services.get(EXTENSION_AI_PROVIDER_SERVICE);
  const pipelineEngine = services.get(EXTENSION_PIPELINE_ENGINE);
  const config = services.get(EXTENSION_CONFIG_SERVICE);

  return {
    commands: createCommandsNamespace(extensionId, context, commandRegistry, eventBus),
    views: createViewsNamespace(context, viewRegistries),
    events: createEventsNamespace(context, eventBus),
    terminal: createTerminalNamespace(terminal, extensionId, isBuiltin, permissionManager),
    connections: createConnectionsNamespace(connectionStore, extensionId, isBuiltin, permissionManager),
    ai: createAINamespace(aiProvider, extensionId, isBuiltin, permissionManager),
    fs: createFSNamespace(extensionId, isBuiltin, permissionManager),
    pipeline: createPipelineNamespace(pipelineEngine),
    config: createConfigNamespace(config, extensionId, isBuiltin),
    window: createWindowNamespace(),
  };
}
