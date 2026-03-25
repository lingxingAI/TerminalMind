# AI 集成 — 数据模型

> 分支：3-ai-integration
> 创建日期：2026-03-25

## 核心实体

### AIMessage

单条对话消息，用于 `AICompletionRequest.messages` 与会话持久化。

```typescript
type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

interface AIMessage {
  readonly role: AIMessageRole;
  readonly content: string;
  readonly name?: string;
}
```

### AICommandContext

终端侧注入的上下文，附加到 `AICompletionRequest.context`。

```typescript
interface AICommandContext {
  readonly shell: string;
  readonly os: string;
  readonly cwd: string;
  readonly recentCommands?: readonly string[];
  readonly recentOutput?: string;
  readonly sessionId?: string;
  readonly remote?: boolean;
}
```

### AICompletionRequest / AICompletionResponse / AIStreamChunk

Provider 层请求与响应（与 `contracts/ai-service.ts` 对齐）。

```typescript
interface AICompletionRequest {
  readonly model: string;
  readonly messages: readonly AIMessage[];
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly context?: AICommandContext;
}

interface AICompletionResponse {
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

interface AIStreamChunk {
  readonly delta: string;
  readonly done: boolean;
  readonly finishReason?: string;
}
```

### AIModelInfo / AIProviderInfo

提供方与模型元数据。

```typescript
interface AIModelInfo {
  readonly id: string;
  readonly name: string;
  readonly contextLength?: number;
}

interface AIProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly models: readonly AIModelInfo[];
}
```

### AIProvider（逻辑实体）

与接口 `AIProvider` 一致；持久化层仅存储 `activeProviderId` 与用户配置，不存储接口实例。

### ConversationMessage

侧边栏会话中的单条消息。

```typescript
interface ConversationMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly createdAt: number;
  readonly model?: string;
  readonly meta?: Readonly<Record<string, string>>;
}
```

### ConversationHistory

一次侧边栏会话。

```typescript
interface ConversationHistory {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
}
```

### PipelineStep / Pipeline

与 `contracts/pipeline-engine.ts` 一致。

```typescript
interface PipelineStep<TIn, TOut> {
  readonly name: string;
  readonly transform: (input: Readonly<TIn>) => Promise<TOut>;
}

interface Pipeline<TIn, TOut> {
  readonly steps: readonly PipelineStep<unknown, unknown>[];
}
```

### AI 设置快照（持久化）

```typescript
interface AIUserSettings {
  readonly version: 1;
  readonly activeProviderId: string;
  readonly activeModelId: string;
  readonly openRouter?: {
    readonly baseUrl: string;
    readonly defaultModel: string;
  };
  readonly customSystemPrompt?: string;
  readonly includeRecentOutput: boolean;
  readonly recentOutputMaxChars: number;
  readonly recentCommandsMax: number;
}
```

## 存储结构

### 目录 `~/.terminalmind/ai/`

| 路径 | 说明 |
|---|---|
| `settings.json` | `AIUserSettings`（不含 API Key 明文） |
| `index.json` | 会话索引：`{ version, sessions: { id, title, updatedAt }[] }` |
| `conversations/<sessionId>.json` | 单个 `ConversationHistory` |
| `models-cache.json` | OpenRouter 模型列表缓存（可选，含 `fetchedAt`） |

### `settings.json` 示例

```json
{
  "version": 1,
  "activeProviderId": "openrouter",
  "activeModelId": "anthropic/claude-3.5-sonnet",
  "openRouter": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "defaultModel": "anthropic/claude-3.5-sonnet"
  },
  "customSystemPrompt": "You are a terminal assistant for {{os}} / {{shell}}.",
  "includeRecentOutput": true,
  "recentOutputMaxChars": 4096,
  "recentCommandsMax": 15
}
```

### `conversations/<sessionId>.json` 示例

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "调试 npm 安装失败",
  "createdAt": 1711296000000,
  "updatedAt": 1711299600000,
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "pnpm install 报错 ECONNRESET，怎么排查？",
      "createdAt": 1711296001000
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": "可先检查代理与环境变量……",
      "createdAt": 1711296010000,
      "model": "anthropic/claude-3.5-sonnet"
    }
  ]
}
```

### API Key 存储

- 与 Phase 2 一致：使用系统 Keychain（`keytar`）保存，例如 `account = ai:openrouter:apiKey`，`service = terminalmind`。
- 不得在 `settings.json` 或 `conversations/*.json` 中存储明文 API Key。

## 事件类型扩展（EventPayloadMap）

Phase 3 建议新增事件（具体键名以实现为准，应与 `packages/core` 中 `EventType` 联合类型同步扩展）：

```typescript
interface EventPayloadMap {
  // Phase 1 / 2 已有事件略

  'ai.providerChanged': {
    readonly providerId: string;
  };
  'ai.modelChanged': {
    readonly modelId: string;
  };
  'ai.requestStarted': {
    readonly requestId: string;
    readonly sessionId?: string;
    readonly source: 'inline' | 'sidebar';
  };
  'ai.streamChunk': {
    readonly requestId: string;
    readonly delta: string;
  };
  'ai.requestCompleted': {
    readonly requestId: string;
    readonly model: string;
    readonly usage?: AICompletionResponse['usage'];
  };
  'ai.requestFailed': {
    readonly requestId: string;
    readonly error: string;
    readonly code?: string;
  };
  'ai.pipelineError': {
    readonly pipelineName: string;
    readonly stepName: string;
    readonly error: string;
  };
  'ai.conversationUpdated': {
    readonly conversationId: string;
    readonly reason: 'created' | 'messageAppended' | 'deleted';
  };
}
```

## 与 IPC / Extension 的边界

- DTO 应在 `packages/api` 的 IPC 类型中与上述结构对齐，避免 Renderer 直接依赖 `packages/services` 内部类。
- `ext-ai` 仅通过 Extension API 与 IPC 触发 AI 流程，不直接发起网络请求。
