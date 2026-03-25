/// <reference types="vitest/globals" />

import { ServiceContainer } from '../service-container';
import { createServiceToken } from '../types/service-token';

describe('ServiceContainer', () => {
  it('should register and retrieve a service', () => {
    const container = new ServiceContainer();
    const token = createServiceToken<string>('TestService');
    container.register(token, () => 'hello');
    expect(container.get(token)).toBe('hello');
  });

  it('should return the same instance on subsequent gets (singleton)', () => {
    const container = new ServiceContainer();
    const token = createServiceToken<{ value: number }>('Counter');
    let count = 0;
    container.register(token, () => ({ value: ++count }));
    const first = container.get(token);
    const second = container.get(token);
    expect(first).toBe(second);
    expect(first.value).toBe(1);
  });

  it('should throw when getting an unregistered token', () => {
    const container = new ServiceContainer();
    const token = createServiceToken<string>('Missing');
    expect(() => container.get(token)).toThrow();
  });

  it('should allow re-registering to replace a service (mock replacement)', () => {
    const container = new ServiceContainer();
    const token = createServiceToken<string>('Replaceable');
    container.register(token, () => 'original');
    expect(container.get(token)).toBe('original');
    container.register(token, () => 'mock');
    expect(container.get(token)).toBe('mock');
  });

  it('should maintain type safety across different tokens', () => {
    const container = new ServiceContainer();
    const strToken = createServiceToken<string>('Str');
    const numToken = createServiceToken<number>('Num');
    container.register(strToken, () => 'text');
    container.register(numToken, () => 42);
    expect(container.get(strToken)).toBe('text');
    expect(container.get(numToken)).toBe(42);
  });
});
