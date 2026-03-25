/**
 * Phase 3 PipelineEngine 契约
 * 替换 Phase 1 桩实现；内置 AI 命令生成相关步骤类型
 */

import type { AICommandContext, AIMessage } from './ai-service';

// ─── 核心引擎 ────────────────────────────────────────────

export interface PipelineStep<TIn, TOut> {
  readonly name: string;
  readonly transform: (input: Readonly<TIn>) => Promise<TOut>;
}

export interface Pipeline<TIn, TOut> {
  readonly id?: string;
  readonly steps: readonly PipelineStep<unknown, unknown>[];
}

export interface PipelineEngine {
  pipe<TIn, TOut>(
    steps: ReadonlyArray<PipelineStep<TIn, TOut>>
  ): Pipeline<TIn, TOut>;

  execute<TIn, TOut>(
    pipeline: Pipeline<TIn, TOut>,
    input: TIn
  ): Promise<TOut>;
}

// ─── AI 命令生成管道 DTO ─────────────────────────────────

/** 用户在内联模式输入的自然语言（已去掉 `? ` 前缀） */
export interface NaturalLanguageCommandInput {
  readonly text: string;
  readonly sessionId: string;
  readonly context: AICommandContext;
}

/** 装配上下文后的内部载体（实现可扩展字段） */
export interface EnrichedCommandContext {
  readonly input: NaturalLanguageCommandInput;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

/** 发送给 Provider 前的请求草稿 */
export interface ProviderRequestDraft {
  readonly enriched: EnrichedCommandContext;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly messages: readonly AIMessage[];
}

/** Provider 原始文本输出 */
export interface RawModelCommandOutput {
  readonly draft: ProviderRequestDraft;
  readonly rawText: string;
}

/** 解析后的可执行命令（单条主命令 + 可选备选） */
export interface ParsedCommandResult {
  readonly primary: string;
  readonly alternatives?: readonly string[];
  readonly warnings?: readonly string[];
}

// ─── 内置步骤工厂（命名约定，实现位于 services 层）────────

export type BuildEnrichedContextStep = PipelineStep<
  NaturalLanguageCommandInput,
  EnrichedCommandContext
>;

export type BuildProviderRequestStep = PipelineStep<
  EnrichedCommandContext,
  ProviderRequestDraft
>;

export type CallAIProviderStep = PipelineStep<
  ProviderRequestDraft,
  RawModelCommandOutput
>;

export type ParseCommandStep = PipelineStep<
  RawModelCommandOutput,
  ParsedCommandResult
>;

/** 默认 AI 自然语言 → 命令 管道标识 */
export const AI_COMMAND_PIPELINE_ID = 'ai.naturalLanguageToCommand' as const;
