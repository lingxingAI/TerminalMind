/// <reference types="vitest/globals" />

import { EventBusImpl } from '../event-bus';

describe('EventBusImpl', () => {
  it('should deliver events to subscribers', () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();
    bus.on('terminal.created', handler);
    bus.emit('terminal.created', { sessionId: 's1', title: 'Tab 1' });
    expect(handler).toHaveBeenCalledWith({ sessionId: 's1', title: 'Tab 1' });
  });

  it('should support multiple subscribers for the same event', () => {
    const bus = new EventBusImpl();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('terminal.destroyed', h1);
    bus.on('terminal.destroyed', h2);
    bus.emit('terminal.destroyed', { sessionId: 's1' });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should unsubscribe via Disposable', () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();
    const sub = bus.on('terminal.exited', handler);
    sub.dispose();
    bus.emit('terminal.exited', { sessionId: 's1', exitCode: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not call handlers of different event types', () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();
    bus.on('terminal.created', handler);
    bus.emit('terminal.destroyed', { sessionId: 's1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle emit with no subscribers gracefully', () => {
    const bus = new EventBusImpl();
    expect(() => bus.emit('command.registered', { commandId: 'test' })).not.toThrow();
  });
});
