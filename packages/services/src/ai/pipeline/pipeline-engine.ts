import type { Pipeline, PipelineEngine, PipelineStep } from '@terminalmind/core';

/**
 * Pipeline engine contract used by services (matches {@link PipelineEngine} from core).
 * Optional `name` on {@link pipe} is an extension for logging and diagnostics.
 */
export interface IPipelineEngine extends PipelineEngine {
  pipe<TIn, TOut>(
    steps: ReadonlyArray<PipelineStep<TIn, TOut>>,
    name?: string
  ): Pipeline<TIn, TOut>;
}

function wrapStepError(stepName: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  const wrapped = new Error(`Pipeline step "${stepName}" failed: ${message}`);
  if (err instanceof Error) {
    wrapped.cause = err;
  }
  return wrapped;
}

export class PipelineEngineImpl implements IPipelineEngine {
  pipe<TIn, TOut>(
    steps: ReadonlyArray<PipelineStep<TIn, TOut>>,
    name?: string
  ): Pipeline<TIn, TOut> {
    const base = { steps: [...steps] } as Pipeline<TIn, TOut> & { readonly name?: string };
    if (name !== undefined) {
      return { ...base, name } as Pipeline<TIn, TOut>;
    }
    return base as Pipeline<TIn, TOut>;
  }

  async execute<TIn, TOut>(
    pipeline: Readonly<Pipeline<TIn, TOut>>,
    input: Readonly<TIn>
  ): Promise<TOut> {
    let current: unknown = input;
    for (const step of pipeline.steps) {
      try {
        current = await step.transform(current as Readonly<TIn>);
      } catch (err) {
        throw wrapStepError(step.name, err);
      }
    }
    return current as TOut;
  }
}
