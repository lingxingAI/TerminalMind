export interface PipelineStep<TIn, TOut> {
  readonly name: string;
  readonly transform: (input: Readonly<TIn>) => Promise<TOut>;
}

export interface Pipeline<TIn, TOut> {
  readonly steps: readonly PipelineStep<TIn, TOut>[];
}

export interface PipelineEngine {
  pipe<TIn, TOut>(steps: ReadonlyArray<PipelineStep<TIn, TOut>>): Pipeline<TIn, TOut>;
  execute<TIn, TOut>(pipeline: Readonly<Pipeline<TIn, TOut>>, input: Readonly<TIn>): Promise<TOut>;
}

export class PipelineEngineStub implements PipelineEngine {
  pipe<TIn, TOut>(_steps: ReadonlyArray<PipelineStep<TIn, TOut>>): Pipeline<TIn, TOut> {
    throw new Error('PipelineEngine is not implemented in Phase 1');
  }

  execute<TIn, TOut>(_pipeline: Readonly<Pipeline<TIn, TOut>>, _input: Readonly<TIn>): Promise<TOut> {
    throw new Error('PipelineEngine is not implemented in Phase 1');
  }
}
