import type { Disposable } from './types/disposable';

export type EventType =
  | 'terminal.created'
  | 'terminal.destroyed'
  | 'terminal.titleChanged'
  | 'terminal.exited'
  | 'extension.activated'
  | 'extension.deactivated'
  | 'extension.installed'
  | 'extension.uninstalled'
  | 'extension.workerCrashed'
  | 'extension.enabled'
  | 'extension.disabled'
  | 'permission.granted'
  | 'permission.denied'
  | 'permission.revoked'
  | 'marketplace.installStart'
  | 'marketplace.installComplete'
  | 'marketplace.installError'
  | 'command.registered'
  | 'ssh.connecting'
  | 'ssh.connected'
  | 'ssh.disconnected'
  | 'ssh.error'
  | 'ssh.hostKeyNew'
  | 'ssh.hostKeyChanged'
  | 'sftp.transferStart'
  | 'sftp.transferProgress'
  | 'sftp.transferComplete'
  | 'connection.changed'
  | 'ai.requestStart'
  | 'ai.requestComplete'
  | 'ai.requestError'
  | 'ai.streamChunk'
  | 'ai.streamDone'
  | 'ai.providerChanged';

export interface EventPayloadMap {
  'terminal.created': { readonly sessionId: string; readonly title: string };
  'terminal.destroyed': { readonly sessionId: string };
  'terminal.titleChanged': { readonly sessionId: string; readonly title: string };
  'terminal.exited': { readonly sessionId: string; readonly exitCode: number };
  'extension.activated': { readonly extensionId: string };
  'extension.deactivated': { readonly extensionId: string };
  'extension.installed': { readonly extensionId: string; readonly version: string };
  'extension.uninstalled': { readonly extensionId: string };
  'extension.workerCrashed': { readonly extensionId: string; readonly error: string };
  'extension.enabled': { readonly extensionId: string };
  'extension.disabled': { readonly extensionId: string };
  'permission.granted': { readonly extensionId: string; readonly permission: string };
  'permission.denied': { readonly extensionId: string; readonly permission: string };
  'permission.revoked': { readonly extensionId: string; readonly permission: string };
  'marketplace.installStart': { readonly extensionId: string };
  'marketplace.installComplete': { readonly extensionId: string; readonly version: string };
  'marketplace.installError': { readonly extensionId: string; readonly error: string };
  'command.registered': { readonly commandId: string; readonly extensionId?: string };
  'ssh.connecting': { readonly sessionId: string; readonly host: string };
  'ssh.connected': { readonly sessionId: string; readonly host: string };
  'ssh.disconnected': { readonly sessionId: string; readonly host: string; readonly reason?: string };
  'ssh.error': { readonly sessionId: string; readonly host: string; readonly error: string };
  'ssh.hostKeyNew': { readonly host: string; readonly port: number; readonly fingerprint: string };
  'ssh.hostKeyChanged': {
    readonly host: string;
    readonly port: number;
    readonly oldFingerprint: string;
    readonly newFingerprint: string;
  };
  'sftp.transferStart': {
    readonly transferId: string;
    readonly direction: 'upload' | 'download';
    readonly filename: string;
  };
  'sftp.transferProgress': {
    readonly transferId: string;
    readonly filename: string;
    readonly direction: 'upload' | 'download';
    readonly bytesTransferred: number;
    readonly totalBytes: number;
    readonly percentage: number;
  };
  'sftp.transferComplete': { readonly transferId: string; readonly success: boolean; readonly error?: string };
  'connection.changed': { readonly type: 'added' | 'updated' | 'removed'; readonly profileId: string };
  'ai.requestStart': { readonly requestId: string; readonly model: string };
  'ai.requestComplete': { readonly requestId: string; readonly model: string; readonly tokensUsed: number };
  'ai.requestError': { readonly requestId: string; readonly error: string };
  'ai.streamChunk': { readonly streamId: string; readonly content: string };
  'ai.streamDone': { readonly streamId: string };
  'ai.providerChanged': { readonly providerId: string };
}

export interface IEventBus {
  emit<T extends EventType>(type: T, payload: Readonly<EventPayloadMap[T]>): void;
  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable;
}

export type EventBus = IEventBus;

export class EventBusImpl implements IEventBus {
  private readonly handlers = new Map<EventType, Set<(payload: Readonly<EventPayloadMap[EventType]>) => void>>();

  emit<T extends EventType>(type: T, payload: Readonly<EventPayloadMap[T]>): void {
    const set = this.handlers.get(type);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(payload);
    }
  }

  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable {
    let bucket = this.handlers.get(type);
    if (!bucket) {
      bucket = new Set();
      this.handlers.set(type, bucket);
    }
    const wrapped = handler as (payload: Readonly<EventPayloadMap[EventType]>) => void;
    bucket.add(wrapped);
    return {
      dispose: () => {
        bucket.delete(wrapped);
        if (bucket.size === 0) {
          this.handlers.delete(type);
        }
      },
    };
  }
}
