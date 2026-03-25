import type { Pipeline, PipelineStep } from '@terminalmind/core';
import type { PipelineNamespace } from '@terminalmind/api';
import type { IPipelineEngine } from '../../ai/pipeline/pipeline-engine.js';

export function createPipelineNamespace(engine: IPipelineEngine): PipelineNamespace {
  const registered = new Map<string, PipelineStep<unknown, unknown>>();

  return {
    registerStep(step: PipelineStep<unknown, unknown>) {
      registered.set(step.name, step);
      return {
        dispose: () => {
          registered.delete(step.name);
        },
      };
    },
    pipe(steps: PipelineStep<unknown, unknown>[], name?: string) {
      return engine.pipe(steps, name) as Pipeline<unknown, unknown>;
    },
    execute(pipeline: Pipeline<unknown, unknown>, input: unknown) {
      return engine.execute(pipeline, input as Readonly<unknown>);
    },
  };
}
