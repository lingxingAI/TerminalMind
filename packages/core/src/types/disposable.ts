export interface Disposable {
  dispose(): void;
}

export type Event<T> = (handler: (payload: Readonly<T>) => void) => Disposable;

export class EventEmitter<T> {
  private handlers = new Set<(payload: Readonly<T>) => void>();

  readonly event: Event<T> = (handler) => {
    this.handlers.add(handler);
    return {
      dispose: () => {
        this.handlers.delete(handler);
      },
    };
  };

  fire(payload: Readonly<T>): void {
    for (const handler of this.handlers) {
      handler(payload);
    }
  }

  dispose(): void {
    this.handlers.clear();
  }
}
