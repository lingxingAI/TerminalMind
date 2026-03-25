export interface ServiceToken<T> {
  readonly id: symbol;
  readonly _brand: T;
}

export function createServiceToken<T>(description: string): ServiceToken<T> {
  return { id: Symbol(description) } as ServiceToken<T>;
}
