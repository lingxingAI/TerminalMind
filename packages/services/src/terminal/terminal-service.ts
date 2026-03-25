import type { TerminalCreateOptions } from '@terminalmind/api';
import type { Event, IEventBus } from '@terminalmind/core';
import { EventEmitter } from '@terminalmind/core';
import type { IShellDiscoveryAdapter } from './shell-discovery';

export interface TerminalSession {
  readonly id: string;
  readonly title: string;
  readonly pid: number;
  readonly shellPath: string;
  /** Resolved working directory when the session was created. */
  readonly cwd: string;
  readonly status: 'running' | 'exited';
  readonly exitCode: number | undefined;
  readonly createdAt: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  readonly onData: Event<string>;
  readonly onExit: Event<{ readonly exitCode: number }>;
}

export interface ITerminalService {
  create(options: Readonly<TerminalCreateOptions>): Promise<TerminalSession>;
  getSession(id: string): TerminalSession | undefined;
  listSessions(): readonly TerminalSession[];
  destroy(id: string): Promise<void>;
}

export class TerminalService implements ITerminalService {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(
    private readonly shellDiscovery: IShellDiscoveryAdapter,
    private readonly eventBus: IEventBus,
  ) {}

  async create(options: Readonly<TerminalCreateOptions>): Promise<TerminalSession> {
    const pty = await import('node-pty');

    let shellPath = options.shell;
    if (!shellPath) {
      const defaultShell = await this.shellDiscovery.getDefaultShell();
      shellPath = defaultShell.path;
    }

    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;
    const id = crypto.randomUUID();
    const cwd = options.cwd ?? process.cwd();

    const ptyProcess = pty.spawn(shellPath, options.args ? [...options.args] : [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: options.env
        ? ({ ...process.env, ...options.env } as Record<string, string>)
        : (process.env as Record<string, string>),
    });

    const session = new ManagedSession(id, options.title ?? shellPath, ptyProcess, shellPath, cwd);
    this.sessions.set(id, session);

    session.onExit(() => {
      this.eventBus.emit('terminal.exited', {
        sessionId: id,
        exitCode: session.exitCode ?? -1,
      });
    });

    this.eventBus.emit('terminal.created', { sessionId: id, title: session.title });

    return session;
  }

  getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): readonly TerminalSession[] {
    return [...this.sessions.values()];
  }

  async destroy(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    session.kill();
    this.sessions.delete(id);
    this.eventBus.emit('terminal.destroyed', { sessionId: id });
  }
}

class ManagedSession implements TerminalSession {
  private readonly _onData = new EventEmitter<string>();
  private readonly _onExit = new EventEmitter<{ readonly exitCode: number }>();
  private _status: 'running' | 'exited' = 'running';
  private _exitCode: number | undefined;
  readonly createdAt = Date.now();

  constructor(
    readonly id: string,
    readonly title: string,
    private readonly ptyProcess: {
      write: (data: string) => void;
      resize: (cols: number, rows: number) => void;
      onData: {
        (cb: (data: string) => void): { dispose: () => void };
      };
      onExit: {
        (cb: (e: { exitCode: number }) => void): { dispose: () => void };
      };
      pid: number;
      kill: () => void;
    },
    readonly shellPath: string,
    readonly cwd: string,
  ) {
    ptyProcess.onData((data: string) => {
      this._onData.fire(data);
    });

    ptyProcess.onExit((e: { exitCode: number }) => {
      this._status = 'exited';
      this._exitCode = e.exitCode;
      this._onExit.fire({ exitCode: e.exitCode });
    });
  }

  get pid(): number {
    return this.ptyProcess.pid;
  }

  get status(): 'running' | 'exited' {
    return this._status;
  }

  get exitCode(): number | undefined {
    return this._exitCode;
  }

  get onData(): Event<string> {
    return this._onData.event;
  }

  get onExit(): Event<{ readonly exitCode: number }> {
    return this._onExit.event;
  }

  write(data: string): void {
    if (this._status === 'running') {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this._status === 'running') {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill(): void {
    if (this._status === 'running') {
      this.ptyProcess.kill();
    }
    this._onData.dispose();
    this._onExit.dispose();
  }
}
