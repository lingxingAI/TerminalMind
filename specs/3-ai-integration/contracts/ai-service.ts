/**
 * Phase 3 AI 服务契约
 * IAIProviderService、AIProvider、OpenRouter 配置与补全 DTO
 */

// ─── 基础 ────────────────────────────────────────────────

export interface Disposable {
  dispose(): void;
}

// ─── 消息与上下文 ────────────────────────────────────────

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIMessage {
  readonly role: AIMessageRole;
  readonly content: string;
  readonly name?: string;
}

export interface AICommandContext {
  readonly shell: string;
  readonly os: string;
  readonly cwd: string;
  readonly recentCommands?: readonly string[];
  readonly recentOutput?: string;
  readonly sessionId?: string;
  readonly remote?: boolean;
}

// ─── 请求 / 响应 / 流式分片 ──────────────────────────────

export interface AICompletionRequest {
  readonly model: string;
  readonly messages: readonly AIMessage[];
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly context?: AICommandContext;
}

export interface AICompletionResponse {
  readonly id: string;
  readonly model: string;
  readonly content: string;
  readonly finishReason?: string;
  readonly usage?: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
  };
}

export interface AIStreamChunk {
  readonly delta: string;
  readonly done: boolean;
  readonly finishReason?: string;
}

// ─── 模型与提供方信息 ────────────────────────────────────

export interface AIModelInfo {
  readonly id: string;
  readonly name: string;
  readonly contextLength?: number;
}

export interface AIProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly models: readonly AIModelInfo[];
}

// ─── AIProvider ──────────────────────────────────────────

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly models: readonly AIModelInfo[];

  complete(
    request: Readonly<AICompletionRequest>
  ): Promise<AICompletionResponse>;

  stream(
    request: Readonly<AICompletionRequest>
  ): AsyncIterable<AIStreamChunk>;
}

// ─── OpenRouter ──────────────────────────────────────────

export interface OpenRouterProviderConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
}

export interface OpenRouterProvider extends AIProvider {
  readonly config: Readonly<OpenRouterProviderConfig>;

  /** Optional: refresh models from GET /models */
  refreshModels?(): Promise<readonly AIModelInfo[]>;
}

// ─── AIProviderService ───────────────────────────────────

export interface IAIProviderService {
  registerProvider(provider: AIProvider): Disposable;

  listProviders(): readonly AIProviderInfo[];

  getActiveProvider(): AIProvider;

  setActiveProvider(providerId: string): void;

  complete(
    request: Readonly<AICompletionRequest>
  ): Promise<AICompletionResponse>;

  stream(
    request: Readonly<AICompletionRequest>
  ): AsyncIterable<AIStreamChunk>;
}

// ─── ConversationStore ─────────────────────────────────

export interface ConversationMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly createdAt: number;
  readonly model?: string;
  readonly meta?: Readonly<Record<string, string>>;
}

export interface ConversationHistory {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
}

export interface ConversationListEntry {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
}

export interface ConversationStore {
  list(): Promise<readonly ConversationListEntry[]>;

  get(id: string): Promise<ConversationHistory | undefined>;

  save(history: Readonly<ConversationHistory>): Promise<void>;

  create(title?: string): Promise<ConversationHistory>;

  appendMessage(
    conversationId: string,
    message: Readonly<Omit<ConversationMessage, 'id' | 'createdAt'>> & {
      readonly id?: string;
      readonly createdAt?: number;
    }
  ): Promise<ConversationMessage>;

  remove(id: string): Promise<void>;
}
