import type { Disposable } from './types/disposable';

export type EventType =
  | 'terminal.created'
  | 'terminal.destroyed'
  | 'terminal.titleChanged'
  | 'terminal.exited'
  | 'extension.activated'
  | 'extension.deactivated'
  | 'command.registered';

export interface EventPayloadMap {
  'terminal.created': { readonly sessionId: string; readonly title: string };
  'terminal.destroyed': { readonly sessionId: string };
  'terminal.titleChanged': { readonly sessionId: string; readonly title: string };
  'terminal.exited': { readonly sessionId: string; readonly exitCode: number };
  'extension.activated': { readonly extensionId: string };
  'extension.deactivated': { readonly extensionId: string };
  'command.registered': { readonly commandId: string };
}

export interface IEventBus {
  emit<T extends EventType>(type: T, payload: Readonly<EventPayloadMap[T]>): void;
  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable;
}

export type EventBus = IEventBus;

export class EventBusImpl implements IEventBus {
  private readonly handlers = new Map<EventType, Set<(payload: Readonly<EventPayloadMap[EventType]>) => void>>();

  emit<T extends EventType>(type: T, payload: Readonly<EventPayloadMap[T]>): void {
    const set = this.handlers.get(type);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(payload);
    }
  }

  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable {
    let bucket = this.handlers.get(type);
    if (!bucket) {
      bucket = new Set();
      this.handlers.set(type, bucket);
    }
    const wrapped = handler as (payload: Readonly<EventPayloadMap[EventType]>) => void;
    bucket.add(wrapped);
    return {
      dispose: () => {
        bucket.delete(wrapped);
        if (bucket.size === 0) {
          this.handlers.delete(type);
        }
      },
    };
  }
}
