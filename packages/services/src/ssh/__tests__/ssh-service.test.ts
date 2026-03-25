import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusImpl } from '@terminalmind/core';
import { ssh2MockFlags, ssh2MockInstances, Ssh2MockClient } from './ssh2-mock';

vi.mock('ssh2', () => ({
  Client: Ssh2MockClient,
}));

import { SSHService } from '../ssh-service';

function baseConfig() {
  return {
    host: 'example.com',
    port: 22,
    username: 'me',
    auth: { type: 'password' as const, password: 'secret' },
  };
}

describe('SSHService', () => {
  let events: EventBusImpl;
  let service: SSHService;

  beforeEach(() => {
    ssh2MockInstances.length = 0;
    ssh2MockFlags.failConnect = false;
    events = new EventBusImpl();
    service = new SSHService(events);
  });

  it('connect creates session with connected status', async () => {
    const session = await service.connect(baseConfig());
    expect(session.status).toBe('connected');
    expect(session.config.host).toBe('example.com');
    expect(session.connectedAt).toBeDefined();
  });

  it('disconnect removes session from registry', async () => {
    const session = await service.connect(baseConfig());
    await service.disconnect(session.id);
    expect(service.getSession(session.id)).toBeUndefined();
  });

  it('listSessions returns all active sessions', async () => {
    const a = await service.connect(baseConfig());
    const b = await service.connect({ ...baseConfig(), host: 'other.test' });
    const list = service.listSessions();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('shell returns TerminalSession-like object', async () => {
    const session = await service.connect(baseConfig());
    const term = await session.shell();
    expect(term.pid).toBe(-1);
    expect(term.shellPath).toBe('ssh://example.com');
    expect(term.status).toBe('running');
    const sub = term.onData(vi.fn());
    expect(sub.dispose).toBeTypeOf('function');
    term.write('');
    sub.dispose();
  });

  it('exec returns ExecResult with stdout, stderr, exitCode', async () => {
    const session = await service.connect(baseConfig());
    const result = await session.exec('echo hi');
    expect(result.stdout).toContain('hello');
    expect(result.stderr).toContain('world');
    expect(result.exitCode).toBe(0);
  });

  it('disconnect detection updates status and emits ssh.disconnected', async () => {
    const disconnected = vi.fn();
    events.on('ssh.disconnected', disconnected);
    const session = await service.connect(baseConfig());
    const primary = ssh2MockInstances[ssh2MockInstances.length - 1]!;
    primary.emit('close');
    await new Promise<void>((r) => queueMicrotask(r));
    expect(session.status).toBe('disconnected');
    expect(disconnected).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        host: 'example.com',
        reason: 'connection closed',
      }),
    );
    expect(service.getSession(session.id)).toBeUndefined();
  });

  it('emits ssh.connecting and ssh.connected on successful connect', async () => {
    const connecting = vi.fn();
    const connected = vi.fn();
    events.on('ssh.connecting', connecting);
    events.on('ssh.connected', connected);
    const session = await service.connect(baseConfig());
    expect(connecting).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'example.com', sessionId: session.id }),
    );
    expect(connected).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'example.com', sessionId: session.id }),
    );
  });

  it('failed connect emits ssh.error and does not register session', async () => {
    ssh2MockFlags.failConnect = true;
    const errSpy = vi.fn();
    events.on('ssh.error', errSpy);
    await expect(service.connect(baseConfig())).rejects.toThrow('connect failed');
    expect(errSpy).toHaveBeenCalled();
    expect(service.listSessions()).toHaveLength(0);
  });

  it('uses jump host chain when jumpHosts is set', async () => {
    await service.connect({
      ...baseConfig(),
      jumpHosts: [
        {
          host: 'jump',
          port: 22,
          username: 'j',
          auth: { type: 'password', password: 'j' },
        },
      ],
    });
    expect(ssh2MockInstances).toHaveLength(2);
  });
});
