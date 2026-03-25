import type { Disposable } from '@terminalmind/core';
import type { EventType, EventPayloadMap } from '@terminalmind/core';

export interface ExtensionModule {
  activate(ctx: ExtensionContext, api: TerminalMindAPI): void;
  deactivate?(): void;
}

export interface ExtensionContext {
  readonly extensionId: string;
  readonly subscriptions: Disposable[];
}

export interface ExtensionManifest {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly entry: string;
  readonly activationEvents: readonly string[];
  readonly contributes: ExtensionContributions;
}

export interface ExtensionContributions {
  readonly commands?: readonly CommandContribution[];
  readonly views?: readonly ViewContribution[];
}

export interface CommandContribution {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
}

export interface ViewContribution {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly location: 'sidebar' | 'panel';
}

export interface TerminalMindAPI {
  readonly commands: CommandsNamespace;
  readonly views: ViewsNamespace;
  readonly events: EventsNamespace;
}

export interface CommandsNamespace {
  register(id: string, handler: (args?: unknown) => Promise<unknown>): Disposable;
  execute<T = unknown>(id: string, args?: unknown): Promise<T>;
  getRegisteredCommands(): readonly string[];
}

export interface SidebarViewProvider {
  readonly viewId: string;
  readonly title: string;
  readonly icon: string;
}

export interface ViewsNamespace {
  registerSidebarView(viewId: string, provider: SidebarViewProvider): Disposable;
}

export interface EventsNamespace {
  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable;
}
