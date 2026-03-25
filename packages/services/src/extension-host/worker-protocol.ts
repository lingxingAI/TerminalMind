/**
 * Structured messages exchanged between {@link WorkerExtensionHost} and worker threads.
 */
export type WorkerMessage =
  | { type: 'init'; entryPath: string; extensionId: string }
  | { type: 'ready' }
  | { type: 'api.invoke'; callId: string; namespace: string; method: string; args: unknown[] }
  | { type: 'api.result'; callId: string; result: unknown }
  | { type: 'api.error'; callId: string; error: string }
  | { type: 'event'; eventType: string; payload: unknown }
  | { type: 'terminate' }
  | { type: 'error'; error: string };

export function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (value === null || typeof value !== 'object' || !('type' in value)) {
    return false;
  }
  const t = (value as { type: unknown }).type;
  return (
    t === 'init' ||
    t === 'ready' ||
    t === 'api.invoke' ||
    t === 'api.result' ||
    t === 'api.error' ||
    t === 'event' ||
    t === 'terminate' ||
    t === 'error'
  );
}
