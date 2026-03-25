import type { IEventBus } from '@terminalmind/core';
import type { ISSHService, SSHConnectionConfig, SSHSession } from './ssh-types';
import { ManagedSSHSession } from './ssh-session';

export class SSHService implements ISSHService {
  private readonly sessions = new Map<string, ManagedSSHSession>();

  constructor(private readonly eventBus: IEventBus) {}

  async connect(config: Readonly<SSHConnectionConfig>): Promise<SSHSession> {
    const id = crypto.randomUUID();
    this.eventBus.emit('ssh.connecting', { sessionId: id, host: config.host });
    const session = new ManagedSSHSession(id, config, this.eventBus, () => {
      this.sessions.delete(id);
    });
    await session.connect();
    this.sessions.set(id, session);
    return session;
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    await session.disconnect();
  }

  getSession(id: string): SSHSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): readonly SSHSession[] {
    return [...this.sessions.values()];
  }
}
