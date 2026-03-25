import { once } from 'node:events';
import { createServer, type Server as NetServer, type Socket } from 'node:net';
import { readFile } from 'node:fs/promises';
import type { Duplex } from 'node:stream';
import { Client } from 'ssh2';
import type { Client as SSH2Client, ClientChannel, ConnectConfig } from 'ssh2';
import type { Event } from '@terminalmind/core';
import { EventEmitter } from '@terminalmind/core';
import type { IEventBus } from '@terminalmind/core';
import { SFTPChannel as SFTPChannelImpl } from '../sftp/sftp-channel';
import type { TerminalSession } from '../terminal/terminal-service';
import type {
  ExecResult,
  PortForward,
  PortForwardOptions,
  SFTPChannel,
  SSHConnectionConfig,
  SSHSession,
} from './ssh-types';

type HopConfig = Readonly<{
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SSHConnectionConfig['auth'];
}>;

function flattenHops(config: Readonly<SSHConnectionConfig>): readonly HopConfig[] {
  const jumps = (config.jumpHosts ?? []).map(
    (j): HopConfig => ({
      host: j.host,
      port: j.port,
      username: j.username,
      auth: j.auth,
    }),
  );
  return [
    ...jumps,
    { host: config.host, port: config.port, username: config.username, auth: config.auth },
  ];
}

async function buildConnectConfig(
  hop: HopConfig,
  extras: Readonly<{
    readonly sock?: Duplex;
    readonly keepaliveInterval?: number;
    readonly keepaliveCountMax?: number;
    readonly readyTimeout?: number;
  }>,
): Promise<ConnectConfig> {
  const base: ConnectConfig = {
    username: hop.username,
    ...(extras.sock !== undefined
      ? { sock: extras.sock }
      : { host: hop.host, port: hop.port }),
  };

  if (extras.keepaliveInterval !== undefined) {
    base.keepaliveInterval = extras.keepaliveInterval;
  }
  if (extras.keepaliveCountMax !== undefined) {
    base.keepaliveCountMax = extras.keepaliveCountMax;
  }
  if (extras.readyTimeout !== undefined) {
    base.readyTimeout = extras.readyTimeout;
  }

  switch (hop.auth.type) {
    case 'password':
      base.password = hop.auth.password;
      break;
    case 'publicKey': {
      const pk = await readFile(hop.auth.privateKeyPath);
      base.privateKey = pk;
      if (hop.auth.passphrase !== undefined) {
        base.passphrase = hop.auth.passphrase;
      }
      break;
    }
    case 'agent': {
      const sockPath = process.env['SSH_AUTH_SOCK'];
      if (!sockPath) {
        throw new Error('SSH_AUTH_SOCK is not set for agent authentication');
      }
      base.agent = sockPath;
      break;
    }
    default:
      break;
  }

  return base;
}

function forwardOutStream(
  client: SSH2Client,
  dstHost: string,
  dstPort: number,
): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, dstHost, dstPort, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stream!);
    });
  });
}

async function waitReady(client: SSH2Client, connectOpts: ConnectConfig): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      client.off('ready', onReady);
      reject(err);
    };
    const onReady = () => {
      client.off('error', onError);
      resolve();
    };
    client.once('error', onError);
    client.once('ready', onReady);
    client.connect(connectOpts);
  });
}

class SSHTerminalSession implements TerminalSession {
  private readonly _onData = new EventEmitter<string>();
  private readonly _onExit = new EventEmitter<{ readonly exitCode: number }>();
  private _status: 'running' | 'exited' = 'running';
  private _exitCode: number | undefined;
  readonly createdAt = Date.now();

  constructor(
    readonly id: string,
    readonly title: string,
    readonly shellPath: string,
    private readonly channel: ClientChannel,
  ) {
    channel.on('data', (chunk: Buffer) => {
      this._onData.fire(chunk.toString('utf8'));
    });
    channel.on('close', (code: number) => {
      const exitCode = typeof code === 'number' ? code : 0;
      this._status = 'exited';
      this._exitCode = exitCode;
      this._onExit.fire({ exitCode });
      this.dispose();
    });
  }

  get pid(): number {
    return -1;
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
      this.channel.write(data);
    }
  }

  kill(): void {
    if (this._status === 'running') {
      this.channel.end();
    }
  }

  resize(cols: number, rows: number): void {
    if (this._status === 'running') {
      const widthPx = Math.max(cols * 8, 1);
      const heightPx = Math.max(rows * 16, 1);
      this.channel.setWindow(rows, cols, heightPx, widthPx);
    }
  }

  private dispose(): void {
    this._onData.dispose();
    this._onExit.dispose();
  }
}

export class ManagedSSHSession implements SSHSession {
  private readonly clientChain: SSH2Client[] = [];
  private readonly forwardServers: NetServer[] = [];
  private _status: SSHSession['status'] = 'connecting';
  private _connectedAt?: number;
  private _error?: string;
  private _wasEverReady = false;
  private _lifecycleClosed = false;
  private _resourcesTornDown = false;

  constructor(
    readonly id: string,
    readonly config: Readonly<SSHConnectionConfig>,
    private readonly eventBus: IEventBus,
    private readonly onDisposed: () => void,
  ) {}

  get status(): SSHSession['status'] {
    return this._status;
  }

  get connectedAt(): number | undefined {
    return this._connectedAt;
  }

  get error(): string | undefined {
    return this._error;
  }

  async connect(): Promise<void> {
    const hops = flattenHops(this.config);
    let sock: Duplex | undefined;

    try {
      for (let i = 0; i < hops.length; i++) {
        const hop = hops[i]!;
        const client: SSH2Client = new Client();
        this.clientChain.push(client);

        const connectOpts = await buildConnectConfig(hop, {
          sock,
          keepaliveInterval: this.config.keepAliveInterval,
          keepaliveCountMax: this.config.keepaliveCountMax,
          readyTimeout: this.config.readyTimeout,
        });

        await waitReady(client, connectOpts);

        if (i < hops.length - 1) {
          const next = hops[i + 1]!;
          sock = await forwardOutStream(client, next.host, next.port);
        }
      }

      this.attachPrimaryListeners();
      this._status = 'connected';
      this._connectedAt = Date.now();
      this._wasEverReady = true;
      this.eventBus.emit('ssh.connected', {
        sessionId: this.id,
        host: this.config.host,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this._status = 'error';
      this._error = msg;
      this.disposeFailedClients();
      this.eventBus.emit('ssh.error', {
        sessionId: this.id,
        host: this.config.host,
        error: msg,
      });
      throw e;
    }
  }

  private attachPrimaryListeners(): void {
    const primary = this.clientChain[this.clientChain.length - 1];
    if (!primary) {
      return;
    }

    primary.on('error', (err: Error) => {
      if (this._lifecycleClosed) {
        return;
      }
      this._lifecycleClosed = true;
      this._status = 'error';
      this._error = err.message;
      this.eventBus.emit('ssh.error', {
        sessionId: this.id,
        host: this.config.host,
        error: err.message,
      });
      this.eventBus.emit('ssh.disconnected', {
        sessionId: this.id,
        host: this.config.host,
        reason: err.message,
      });
      void this.teardownResources();
      if (this._wasEverReady) {
        this.onDisposed();
      }
    });

    primary.on('close', () => {
      if (this._lifecycleClosed) {
        return;
      }
      this._lifecycleClosed = true;
      this._status = 'disconnected';
      this.eventBus.emit('ssh.disconnected', {
        sessionId: this.id,
        host: this.config.host,
        reason: 'connection closed',
      });
      void this.teardownResources();
      if (this._wasEverReady) {
        this.onDisposed();
      }
    });
  }

  private disposeFailedClients(): void {
    for (const c of this.clientChain) {
      c.end();
    }
    this.clientChain.length = 0;
  }

  private async teardownResources(): Promise<void> {
    if (this._resourcesTornDown) {
      return;
    }
    this._resourcesTornDown = true;
    for (const s of this.forwardServers) {
      await new Promise<void>((resolve) => {
        s.close(() => resolve());
      });
    }
    this.forwardServers.length = 0;
    for (const c of this.clientChain) {
      c.end();
    }
    this.clientChain.length = 0;
  }

  private requirePrimary(): SSH2Client {
    const primary = this.clientChain[this.clientChain.length - 1];
    if (!primary || this._status !== 'connected') {
      throw new Error('SSH session is not connected');
    }
    return primary;
  }

  async shell(): Promise<TerminalSession> {
    const primary = this.requirePrimary();
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      primary.shell({ term: 'xterm-256color' }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stream!);
      });
    });
    const title = `${this.config.username}@${this.config.host}`;
    return new SSHTerminalSession(
      crypto.randomUUID(),
      title,
      `ssh://${this.config.host}`,
      channel,
    );
  }

  async exec(command: string): Promise<ExecResult> {
    const primary = this.requirePrimary();
    return new Promise((resolve, reject) => {
      primary.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        const ch = stream!;
        let stdout = '';
        let stderr = '';
        ch.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });
        ch.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });
        ch.on('close', (code: number, signal: NodeJS.Signals | undefined) => {
          const exitCode = code ?? (signal ? 1 : 0);
          resolve({ exitCode, stdout, stderr });
        });
      });
    });
  }

  async sftp(): Promise<SFTPChannel> {
    const primary = this.requirePrimary();
    return new Promise((resolve, reject) => {
      primary.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(new SFTPChannelImpl(this.id, sftp!));
      });
    });
  }

  async forwardPort(options: Readonly<PortForwardOptions>): Promise<PortForward> {
    const primary = this.requirePrimary();
    const forwardId = crypto.randomUUID();
    const server = createServer((localSocket: Socket) => {
      const srcIP = localSocket.remoteAddress ?? '127.0.0.1';
      const srcPort = localSocket.remotePort ?? 0;
      primary.forwardOut(
        srcIP,
        srcPort,
        options.remoteHost,
        options.remotePort,
        (fwdErr, stream) => {
          if (fwdErr || !stream) {
            localSocket.destroy();
            return;
          }
          const duplex = stream as Duplex;
          localSocket.pipe(duplex).pipe(localSocket);
        },
      );
    });

    const srvEmitter = server as unknown as NodeJS.EventEmitter;
    const listening = once(srvEmitter, 'listening');
    const failed = once(srvEmitter, 'error');
    server.listen(options.localPort);
    await Promise.race([
      listening,
      failed.then(([e]) => {
        throw e instanceof Error ? e : new Error(String(e));
      }),
    ]);

    this.forwardServers.push(server);

    return {
      id: forwardId,
      localPort: options.localPort,
      remoteHost: options.remoteHost,
      remotePort: options.remotePort,
      close: async () => {
        await new Promise<void>((resolve, reject) => {
          server.close((closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }
            resolve();
          });
        });
        const idx = this.forwardServers.indexOf(server);
        if (idx >= 0) {
          this.forwardServers.splice(idx, 1);
        }
      },
    };
  }

  async disconnect(): Promise<void> {
    if (!this._wasEverReady || this._lifecycleClosed) {
      return;
    }
    this._lifecycleClosed = true;
    this._status = 'disconnected';
    this.eventBus.emit('ssh.disconnected', {
      sessionId: this.id,
      host: this.config.host,
      reason: 'disconnected',
    });
    await this.teardownResources();
    this.onDisposed();
  }
}
