import type { ServiceToken } from './types/service-token';

type Entry = {
  readonly factory: () => unknown;
  instance: unknown | undefined;
};

export interface IServiceContainer {
  register<T>(token: Readonly<ServiceToken<T>>, factory: () => T): void;
  get<T>(token: Readonly<ServiceToken<T>>): T;
}

export class ServiceContainer implements IServiceContainer {
  private readonly entries = new Map<symbol, Entry>();

  register<T>(token: Readonly<ServiceToken<T>>, factory: () => T): void {
    this.entries.set(token.id, { factory: factory as () => unknown, instance: undefined });
  }

  get<T>(token: Readonly<ServiceToken<T>>): T {
    const entry = this.entries.get(token.id);
    if (!entry) {
      throw new Error(`Service not registered for token: ${String(token.id.description ?? token.id.toString())}`);
    }
    if (entry.instance === undefined) {
      entry.instance = entry.factory();
    }
    return entry.instance as T;
  }
}
