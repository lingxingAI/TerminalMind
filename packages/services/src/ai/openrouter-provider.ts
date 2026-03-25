import type {
  AICompletionRequest,
  AICompletionResponse,
  AIModelInfo,
  AIProvider,
  AIStreamChunk,
} from '@terminalmind/api';
import { parseSseToAiStreamChunks } from './sse-parser';

const LIST_MODELS_TTL_MS = 3_600_000;

export interface OpenRouterProviderOptions {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly getApiKey: () => Promise<string | null | undefined>;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function buildMessages(
  request: Readonly<AICompletionRequest>
): readonly { readonly role: string; readonly content: string }[] {
  const out: { readonly role: string; readonly content: string }[] = [];
  if (request.systemPrompt?.trim()) {
    out.push({ role: 'system', content: request.systemPrompt });
  }
  for (const m of request.messages) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      if (j.error?.message) {
        return j.error.message;
      }
    } catch {
      /* not JSON */
    }
    return text.slice(0, 500) || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

function mapHttpError(status: number, message: string): Error {
  if (status === 401) {
    return new Error(`OpenRouter authentication failed: invalid or missing API key. ${message}`);
  }
  if (status === 429) {
    return new Error(`OpenRouter rate limit exceeded. ${message}`);
  }
  return new Error(`OpenRouter request failed (${status}): ${message}`);
}

function parseTokenPrice(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

function parsePricing(raw: unknown): { readonly prompt: number; readonly completion: number } | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const prompt = parseTokenPrice(o.prompt);
  const completion = parseTokenPrice(o.completion);
  if (prompt === undefined || completion === undefined) {
    return undefined;
  }
  return { prompt, completion };
}

function mapOpenRouterModel(raw: Record<string, unknown>): AIModelInfo | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) {
    return null;
  }
  const name = typeof raw.name === 'string' ? raw.name : id;
  const clRaw = raw.context_length;
  const contextLength =
    typeof clRaw === 'number'
      ? clRaw
      : typeof clRaw === 'string'
        ? parseInt(clRaw, 10)
        : undefined;
  const pricing = parsePricing(raw.pricing);
  if (typeof contextLength === 'number' && Number.isFinite(contextLength)) {
    return pricing ? { id, name, contextLength, pricing } : { id, name, contextLength };
  }
  return pricing ? { id, name, pricing } : { id, name };
}

function mapChatCompletionResponse(json: Record<string, unknown>): AICompletionResponse {
  const choices = json.choices as unknown[] | undefined;
  const ch0 = choices?.[0] as Record<string, unknown> | undefined;
  const message = ch0?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';
  const model = typeof json.model === 'string' ? json.model : '';
  const fr = ch0?.finish_reason;
  const finishReason = typeof fr === 'string' ? fr : undefined;
  const usageRaw = json.usage as Record<string, unknown> | undefined;
  let usage: AICompletionResponse['usage'];
  if (usageRaw) {
    const pt = usageRaw.prompt_tokens;
    const ct = usageRaw.completion_tokens;
    const tt = usageRaw.total_tokens;
    usage = {
      promptTokens: typeof pt === 'number' ? pt : 0,
      completionTokens: typeof ct === 'number' ? ct : 0,
      totalTokens: typeof tt === 'number' ? tt : 0,
    };
  }
  return {
    content,
    model,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

export class OpenRouterProvider implements AIProvider {
  private readonly normalizedBase: string;
  private _models: AIModelInfo[] = [];
  private modelsCache: { readonly expiresAt: number; readonly models: readonly AIModelInfo[] } | null = null;

  constructor(private readonly options: Readonly<OpenRouterProviderOptions>) {
    this.normalizedBase = normalizeBaseUrl(options.baseUrl);
  }

  get id(): string {
    return this.options.id;
  }

  get name(): string {
    return this.options.name;
  }

  get models(): readonly AIModelInfo[] {
    return this._models;
  }

  /**
   * Fetches models from `GET ${baseUrl}/models`, cached for one hour.
   */
  async listModels(): Promise<readonly AIModelInfo[]> {
    const now = Date.now();
    if (this.modelsCache !== null && now < this.modelsCache.expiresAt) {
      return this.modelsCache.models;
    }
    const key = await this.requireApiKey();
    const res = await fetch(`${this.normalizedBase}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const msg = await readErrorBody(res);
      throw mapHttpError(res.status, msg);
    }
    const json = (await res.json()) as { data?: unknown[] };
    const list = (json.data ?? [])
      .map((x) => mapOpenRouterModel(x as Record<string, unknown>))
      .filter((m): m is AIModelInfo => m !== null);
    this._models = [...list];
    this.modelsCache = { expiresAt: now + LIST_MODELS_TTL_MS, models: [...list] };
    return list;
  }

  private async requireApiKey(): Promise<string> {
    const v = await this.options.getApiKey();
    const key = v?.trim();
    if (!key) {
      throw new Error('OpenRouter API key is missing. Configure an API key for this provider.');
    }
    return key;
  }

  private async authorizedHeaders(): Promise<HeadersInit> {
    const key = await this.requireApiKey();
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
  }

  async complete(request: Readonly<AICompletionRequest>): Promise<AICompletionResponse> {
    const res = await fetch(`${this.normalizedBase}/chat/completions`, {
      method: 'POST',
      headers: await this.authorizedHeaders(),
      body: JSON.stringify({
        model: request.model,
        messages: buildMessages(request),
        temperature: request.temperature ?? undefined,
        max_tokens: request.maxTokens ?? undefined,
        stream: false,
      }),
    });
    if (!res.ok) {
      const msg = await readErrorBody(res);
      throw mapHttpError(res.status, msg);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return mapChatCompletionResponse(json);
  }

  async *stream(request: Readonly<AICompletionRequest>): AsyncIterable<AIStreamChunk> {
    const res = await fetch(`${this.normalizedBase}/chat/completions`, {
      method: 'POST',
      headers: await this.authorizedHeaders(),
      body: JSON.stringify({
        model: request.model,
        messages: buildMessages(request),
        temperature: request.temperature ?? undefined,
        max_tokens: request.maxTokens ?? undefined,
        stream: true,
      }),
    });
    if (!res.ok) {
      const msg = await readErrorBody(res);
      throw mapHttpError(res.status, msg);
    }
    if (!res.body) {
      throw new Error('OpenRouter streaming response has no body');
    }
    yield* parseSseToAiStreamChunks(res.body);
  }
}
