import type { AIStreamChunk } from '@terminalmind/api';

function parseSseDataLine(line: string): AIStreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') {
    return { content: '', done: true };
  }
  try {
    const json = JSON.parse(payload) as Record<string, unknown>;
    const choices = json.choices as unknown[] | undefined;
    const ch0 = choices?.[0] as Record<string, unknown> | undefined;
    const delta = ch0?.delta as Record<string, unknown> | undefined;
    const content = typeof delta?.content === 'string' ? delta.content : '';
    const fr = ch0?.finish_reason;
    const finishReason = typeof fr === 'string' ? fr : undefined;
    const model = typeof json.model === 'string' ? json.model : undefined;
    const done = finishReason != null && finishReason !== '';
    return {
      content,
      done,
      ...(model ? { model } : {}),
      ...(finishReason ? { finishReason } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Parses an OpenRouter-style SSE stream from `fetch` `response.body`.
 */
export async function* parseSseToAiStreamChunks(body: ReadableStream<Uint8Array>): AsyncIterable<AIStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const chunk = parseSseDataLine(line);
        if (chunk) {
          yield chunk;
        }
      }
    }
    if (buffer.trim()) {
      const chunk = parseSseDataLine(buffer);
      if (chunk) {
        yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
