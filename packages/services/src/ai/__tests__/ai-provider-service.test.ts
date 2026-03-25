import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
  AIStreamChunk,
  AIModelInfo,
} from '@terminalmind/api';
import { EventBusImpl } from '@terminalmind/core';
import { AIProviderService } from '../ai-provider-service';
import { OpenRouterProvider } from '../openrouter-provider';
import { parseSseToAiStreamChunks } from '../sse-parser';
import { AiSecretStore, aiProviderApiKeySecretKey } from '../ai-secret';
import { ContextCollector } from '../context-collector';
import { InMemorySecretStore } from '../../connection/secret-store';

function streamFromString(s: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(s));
      controller.close();
    },
  });
}

function mockProvider(
  overrides: Partial<{
    id: string;
    name: string;
    models: readonly AIModelInfo[];
    complete: (r: Readonly<AICompletionRequest>) => Promise<AICompletionResponse>;
    stream: (r: Readonly<AICompletionRequest>) => AsyncIterable<AIStreamChunk>;
  }> = {}
): AIProvider {
  const models: readonly AIModelInfo[] = overrides.models ?? [
    { id: 'm1', name: 'Model 1' },
  ];
  return {
    id: overrides.id ?? 'mock',
    name: overrides.name ?? 'Mock',
    models,
    complete:
      overrides.complete ??
      (async () => ({
        content: 'ok',
        model: 'm1',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      })),
    stream:
      overrides.stream ??
      (async function* () {
        yield { content: 'a', done: false };
        yield { content: '', done: true, finishReason: 'stop' };
      }),
  };
}

describe('AIProviderService', () => {
  let bus: EventBusImpl;
  let service: AIProviderService;

  beforeEach(() => {
    bus = new EventBusImpl();
    service = new AIProviderService(bus);
  });

  it('registerProvider, listProviders, setActiveProvider, complete delegates to active', async () => {
    const p1 = mockProvider({ id: 'a', name: 'A' });
    const p2 = mockProvider({
      id: 'b',
      name: 'B',
      complete: async () => ({ content: 'from-b', model: 'x' }),
    });
    const reg1 = service.registerProvider(p1);
    service.registerProvider(p2);

    expect(service.listProviders().map((x) => x.id)).toEqual(['a', 'b']);
    expect(service.getActiveProvider().id).toBe('a');

    service.setActiveProvider('b');
    const res = await service.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.content).toBe('from-b');

    reg1.dispose();
    expect(service.listProviders().map((x) => x.id)).toEqual(['b']);
    expect(service.getActiveProvider().id).toBe('b');
  });

  it('stream returns AsyncIterable chunks from active provider', async () => {
    service.registerProvider(mockProvider());
    const chunks: AIStreamChunk[] = [];
    for await (const c of service.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c);
    }
    expect(chunks.map((x) => x.content).join('')).toBe('a');
    expect(chunks.some((x) => x.done)).toBe(true);
  });

  it('throws when no provider registered', async () => {
    expect(() => service.getActiveProvider()).toThrow(/No AI provider registered/);
    await expect(
      service.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow(/No AI provider registered/);
  });

  it('emits ai.requestStart, ai.requestComplete on complete', async () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();
    bus.on('ai.requestStart', onStart);
    bus.on('ai.requestComplete', onComplete);
    service.registerProvider(mockProvider());
    await service.complete({ model: 'm1', messages: [{ role: 'user', content: 'x' }] });
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'm1', requestId: expect.any(String) })
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'm1', tokensUsed: 3 })
    );
  });

  it('emits ai.requestError on complete failure', async () => {
    const onErr = vi.fn();
    bus.on('ai.requestError', onErr);
    service.registerProvider(
      mockProvider({
        complete: async () => {
          throw new Error('boom');
        },
      })
    );
    await expect(
      service.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow('boom');
    expect(onErr).toHaveBeenCalledWith(expect.objectContaining({ error: 'boom' }));
  });
});

describe('OpenRouterProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST chat/completions non-stream and maps response', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'r1',
          model: 'openai/gpt-4',
          choices: [
            {
              message: { role: 'assistant', content: 'hello' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenRouterProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://api.example/v1/',
      getApiKey: async () => 'sk-test',
    });

    const res = await provider.complete({
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sys',
    });

    expect(res.content).toBe('hello');
    expect(res.model).toBe('openai/gpt-4');
    expect(res.usage?.totalTokens).toBe(15);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toBe('https://api.example/v1/chat/completions');
    const init = firstCall[1];
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('throws descriptive error on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }))
    );
    const provider = new OpenRouterProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://api.example/v1',
      getApiKey: async () => 'wrong',
    });
    await expect(
      provider.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow(/invalid or missing API key/);
  });

  it('throws descriptive error on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'slow down' } }), { status: 429 }))
    );
    const provider = new OpenRouterProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://api.example/v1',
      getApiKey: async () => 'sk',
    });
    await expect(
      provider.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow(/rate limit/);
  });

  it('listModels caches GET /models for one hour', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'anthropic/claude',
              name: 'Claude',
              context_length: 100000,
              pricing: { prompt: '0.001', completion: '0.002' },
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenRouterProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://api.example/v1',
      getApiKey: async () => 'sk',
    });

    const m1 = await provider.listModels();
    const m2 = await provider.listModels();
    expect(m1).toEqual(m2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const listCall = fetchMock.mock.calls[0] as unknown as [string];
    expect(listCall[0]).toBe('https://api.example/v1/models');
    expect(m1[0]).toMatchObject({
      id: 'anthropic/claude',
      name: 'Claude',
      contextLength: 100000,
      pricing: { prompt: 0.001, completion: 0.002 },
    });
  });
});

describe('parseSseToAiStreamChunks', () => {
  it('parses OpenRouter-style SSE including [DONE] and comments', async () => {
    const sse = [
      ': ping',
      '',
      'retry: 3000',
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      '',
      'data: {"model":"m1","choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    const chunks: AIStreamChunk[] = [];
    for await (const c of parseSseToAiStreamChunks(streamFromString(sse))) {
      chunks.push(c);
    }

    const text = chunks.map((c) => c.content).join('');
    expect(text).toBe('Hi!');
    expect(chunks.some((c) => c.done)).toBe(true);
  });
});

describe('AiSecretStore', () => {
  it('uses ai:${providerId}:apiKey key format', async () => {
    const mem = new InMemorySecretStore();
    const ai = new AiSecretStore(mem);
    await ai.setApiKey('openrouter', 'secret');
    expect(await mem.get(aiProviderApiKeySecretKey('openrouter'))).toBe('secret');
    expect(await ai.getApiKey('openrouter')).toBe('secret');
  });
});

describe('ContextCollector', () => {
  it('builds AICommandContext from platform and shell adapter', async () => {
    const adapter = {
      discoverShells: vi.fn(),
      getDefaultShell: vi.fn(async () => ({
        id: 'pwsh',
        name: 'PowerShell',
        path: 'C:\\\\Program Files\\\\pwsh.exe',
        args: [],
        platform: 'win32' as const,
        isDefault: true,
      })),
    };
    const collector = new ContextCollector(adapter);
    const ctx = await collector.collect({
      cwd: 'D:\\\\proj',
      recentCommands: ['git status'],
      recentOutput: 'On branch main',
    });
    expect(ctx.cwd).toBe('D:\\\\proj');
    expect(ctx.recentCommands).toEqual(['git status']);
    expect(ctx.recentOutput).toBe('On branch main');
    expect(ctx.shell).toContain('pwsh');
    expect(ctx.os).toBe(process.platform);
  });
});
