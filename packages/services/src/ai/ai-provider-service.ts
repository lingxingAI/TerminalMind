import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
  AIProviderInfo,
  AIStreamChunk,
  IAIProviderService,
} from '@terminalmind/api';
import type { Disposable, IEventBus } from '@terminalmind/core';
import { randomUUID } from 'node:crypto';

function toProviderInfo(p: AIProvider): AIProviderInfo {
  return {
    id: p.id,
    name: p.name,
    models: [...p.models],
  };
}

export class AIProviderService implements IAIProviderService {
  private readonly providers = new Map<string, AIProvider>();

  private activeId: string | null = null;

  constructor(private readonly events: IEventBus) {}

  registerProvider(provider: AIProvider): Disposable {
    if (this.providers.has(provider.id)) {
      throw new Error(`AI provider "${provider.id}" is already registered`);
    }
    this.providers.set(provider.id, provider);
    if (this.activeId === null) {
      this.activeId = provider.id;
    }
    this.events.emit('ai.providerChanged', { providerId: provider.id });
    return {
      dispose: () => {
        this.providers.delete(provider.id);
        if (this.activeId === provider.id) {
          const remaining = [...this.providers.keys()];
          this.activeId = remaining[0] ?? null;
        }
        if (this.activeId !== null) {
          this.events.emit('ai.providerChanged', { providerId: this.activeId });
        }
      },
    };
  }

  listProviders(): readonly AIProviderInfo[] {
    return [...this.providers.values()].map(toProviderInfo);
  }

  getActiveProvider(): AIProvider {
    const id = this.activeId;
    if (id === null) {
      throw new Error('No AI provider registered');
    }
    const p = this.providers.get(id);
    if (!p) {
      throw new Error(`Active AI provider "${id}" is not registered`);
    }
    return p;
  }

  setActiveProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`AI provider "${providerId}" is not registered`);
    }
    this.activeId = providerId;
    this.events.emit('ai.providerChanged', { providerId });
  }

  async complete(request: Readonly<AICompletionRequest>): Promise<AICompletionResponse> {
    const requestId = randomUUID();
    const provider = this.getActiveProvider();
    this.events.emit('ai.requestStart', { requestId, model: request.model });
    try {
      const res = await provider.complete(request);
      const tokensUsed = res.usage?.totalTokens ?? 0;
      this.events.emit('ai.requestComplete', {
        requestId,
        model: res.model,
        tokensUsed,
      });
      return res;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.events.emit('ai.requestError', { requestId, error });
      throw e;
    }
  }

  stream(request: Readonly<AICompletionRequest>): AsyncIterable<AIStreamChunk> {
    return this.getActiveProvider().stream(request);
  }
}
