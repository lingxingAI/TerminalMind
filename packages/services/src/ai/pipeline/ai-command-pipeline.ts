import type {
  AICommandContext,
  AICompletionRequest,
  AICompletionResponse,
  AIGenerateCommandResult,
  AIMessage,
  IAIProviderService,
} from '@terminalmind/api';
import type { Pipeline, PipelineStep } from '@terminalmind/core';
import { PipelineEngineImpl } from './pipeline-engine';

export interface AICommandPipelineInput {
  readonly prompt: string;
  readonly context?: AICommandContext;
  readonly model?: string;
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export interface EnrichedAICommandState {
  readonly model: string;
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly context: AICommandContext;
}

function resolveContext(context?: AICommandContext): AICommandContext {
  return {
    shell: context?.shell ?? 'unknown',
    os: context?.os ?? 'unknown',
    cwd: context?.cwd ?? '/',
    ...(context?.recentCommands !== undefined && context.recentCommands.length > 0
      ? { recentCommands: context.recentCommands }
      : {}),
    ...(context?.recentOutput !== undefined && context.recentOutput !== ''
      ? { recentOutput: context.recentOutput }
      : {}),
  };
}

function buildSystemPrompt(ctx: AICommandContext): string {
  const lines: string[] = [
    'You translate the user request into a single shell command for their environment.',
    'Respond with only the command, or put the command inside one markdown fenced code block.',
    '',
    'Environment:',
    `- Shell: ${ctx.shell}`,
    `- Operating system: ${ctx.os}`,
    `- Current working directory: ${ctx.cwd}`,
  ];
  if (ctx.recentCommands?.length) {
    lines.push(`- Recent commands: ${ctx.recentCommands.map((c) => c.trim()).join('; ')}`);
  }
  if (ctx.recentOutput) {
    const truncated = ctx.recentOutput.length > 4000 ? `${ctx.recentOutput.slice(0, 4000)}…` : ctx.recentOutput;
    lines.push('- Recent terminal output:', truncated);
  }
  lines.push('', 'Output: executable command only when possible; no prose before or after unless using a code fence.');
  return lines.join('\n');
}

const buildEnrichedContextStep: PipelineStep<AICommandPipelineInput, EnrichedAICommandState> = {
  name: 'BuildEnrichedContext',
  async transform(input) {
    const context = resolveContext(input.context);
    return {
      model: input.model ?? DEFAULT_MODEL,
      systemPrompt: buildSystemPrompt(context),
      userMessage: input.prompt.trim(),
      context,
    };
  },
};

const buildProviderRequestStep: PipelineStep<EnrichedAICommandState, AICompletionRequest> = {
  name: 'BuildProviderRequest',
  async transform(state) {
    const messages: readonly AIMessage[] = [{ role: 'user', content: state.userMessage }];
    return {
      model: state.model,
      messages,
      systemPrompt: state.systemPrompt,
      context: state.context,
    };
  },
};

function callAIProviderStep(
  aiService: IAIProviderService
): PipelineStep<AICompletionRequest, AICompletionResponse> {
  return {
    name: 'CallAIProvider',
    async transform(request) {
      return aiService.complete(request);
    },
  };
}

/**
 * Strips markdown fences and returns the primary command string from model output.
 */
export function parseCommandFromAIResponse(content: string): AIGenerateCommandResult {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\r?\n([\s\S]*?)```/m);
  if (fenceMatch) {
    const body = fenceMatch[1].trim();
    return { command: body };
  }
  const inlineFence = trimmed.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
  if (inlineFence) {
    return { command: inlineFence[1].trim() };
  }
  const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
  return { command: firstLine };
}

const parseCommandStep: PipelineStep<AICompletionResponse, AIGenerateCommandResult> = {
  name: 'ParseCommand',
  async transform(response) {
    return parseCommandFromAIResponse(response.content);
  },
};

/**
 * Builds the fixed AI command-generation pipeline (enrich → request → complete → parse).
 */
export function createAICommandPipeline(
  aiService: IAIProviderService
): Pipeline<AICommandPipelineInput, AIGenerateCommandResult> {
  const engine = new PipelineEngineImpl();
  const steps = [
    buildEnrichedContextStep,
    buildProviderRequestStep,
    callAIProviderStep(aiService),
    parseCommandStep,
  ] as unknown as ReadonlyArray<PipelineStep<AICommandPipelineInput, AIGenerateCommandResult>>;
  return engine.pipe(steps, 'AICommandPipeline');
}
