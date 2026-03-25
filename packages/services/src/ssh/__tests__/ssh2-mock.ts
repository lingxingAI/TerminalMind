import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export const ssh2MockInstances: Ssh2MockClient[] = [];
export const ssh2MockFlags = { failConnect: false };

export class Ssh2MockClient extends EventEmitter {
  constructor() {
    super();
    ssh2MockInstances.push(this);
  }

  connect(_opts?: unknown): void {
    queueMicrotask(() => {
      if (ssh2MockFlags.failConnect) {
        this.emit('error', new Error('connect failed'));
        return;
      }
      this.emit('ready');
    });
  }

  forwardOut(
    _srcIP: string,
    _srcPort: number,
    _dstHost: string,
    _dstPort: number,
    cb: (err: Error | undefined, stream?: PassThrough) => void,
  ): void {
    cb(undefined, new PassThrough());
  }

  shell(_opts: unknown, cb: (err: Error | undefined, stream?: PassThrough) => void): void {
    cb(undefined, new PassThrough());
  }

  exec(
    _command: string,
    cb: (err: Error | undefined, stream?: PassThrough & { stderr: PassThrough }) => void,
  ): void {
    const stream = new PassThrough() as PassThrough & { stderr: PassThrough };
    stream.stderr = new PassThrough();
    cb(undefined, stream);
    stream.write('hello');
    stream.stderr.write('world');
    queueMicrotask(() => stream.emit('close', 0));
  }

  sftp(cb: (err: Error | undefined, sftp?: { end: () => void }) => void): void {
    cb(undefined, { end: () => {} });
  }

  end(): void {
    this.removeAllListeners();
  }
}
