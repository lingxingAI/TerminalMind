import { describe, it, expect, vi } from 'vitest';
import type { IAIProviderService } from '@terminalmind/api';
import type { PipelineStep } from '@terminalmind/core';

import { createAICommandPipeline, parseCommandFromAIResponse } from '../ai-command-pipeline';
import { PipelineEngineImpl } from '../pipeline-engine';

describe('PipelineEngineImpl', () => {
  it('pipe creates a pipeline with the given steps and optional name', () => {
    const engine = new PipelineEngineImpl();
    const steps: ReadonlyArray<PipelineStep<number, number>> = [
      { name: 'double', transform: async (n) => n * 2 },
    ];
    const p = engine.pipe(steps, 'math');
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0].name).toBe('double');
    expect((p as { name?: string }).name).toBe('math');
  });

  it('execute runs steps in order, passing each output to the next', async () => {
    const engine = new PipelineEngineImpl();
    const steps: ReadonlyArray<PipelineStep<number, number>> = [
      { name: 'add1', transform: async (n) => n + 1 },
      { name: 'mul3', transform: async (n) => n * 3 },
    ];
    const pipeline = engine.pipe(steps);
    await expect(engine.execute(pipeline, 4)).resolves.toBe(15);
  });

  it('error in a middle step stops the pipeline and includes the step name', async () => {
    const engine = new PipelineEngineImpl();
    const steps: ReadonlyArray<PipelineStep<number, number>> = [
      { name: 'ok', transform: async (n) => n + 1 },
      {
        name: 'boom',
        transform: async () => {
          throw new Error('intentional');
        },
      },
      { name: 'never', transform: async (n) => n * 10 },
    ];
    const pipeline = engine.pipe(steps);
    await expect(engine.execute(pipeline, 0)).rejects.toThrow(/Pipeline step "boom" failed/);
    await expect(engine.execute(pipeline, 0)).rejects.toThrow(/intentional/);
  });
});

describe('createAICommandPipeline', () => {
  it('runs end-to-end with a mock AI provider', async () => {
    const complete = vi.fn().mockResolvedValue({
      content: '```bash\nls -la\n```',
      model: 'test-model',
    });
    const stream = vi.fn().mockImplementation(async function* () {
      yield { content: '', done: true };
    });
    const aiService: IAIProviderService = {
      complete,
      stream,
      registerProvider: vi.fn(),
      listProviders: vi.fn().mockReturnValue([]),
      getActiveProvider: vi.fn(),
      setActiveProvider: vi.fn(),
    };
    const engine = new PipelineEngineImpl();
    const pipeline = createAICommandPipeline(aiService);
    const result = await engine.execute(pipeline, {
      prompt: 'list files in detail',
      context: { shell: 'bash', os: 'linux', cwd: '/tmp', recentCommands: ['pwd'] },
      model: 'custom/model',
    });
    expect(result.command).toBe('ls -la');
    expect(complete).toHaveBeenCalledTimes(1);
    const req = complete.mock.calls[0][0];
    expect(req.model).toBe('custom/model');
    expect(req.systemPrompt).toContain('bash');
    expect(req.systemPrompt).toContain('linux');
    expect(req.systemPrompt).toContain('/tmp');
    expect(req.systemPrompt).toContain('pwd');
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toBe('list files in detail');
    expect(req.context?.cwd).toBe('/tmp');
  });
});

describe('parseCommandFromAIResponse', () => {
  it('extracts bash fenced command', () => {
    expect(parseCommandFromAIResponse('```bash\nls -la\n```').command).toBe('ls -la');
  });

  it('extracts fenced command without language tag', () => {
    expect(parseCommandFromAIResponse('```\nwhoami\n```').command).toBe('whoami');
  });

  it('uses plain single-line text', () => {
    expect(parseCommandFromAIResponse('  git status  ').command).toBe('git status');
  });

  it('uses first non-empty line for multi-line plain text', () => {
    expect(parseCommandFromAIResponse('\n\nnpm test\nextra').command).toBe('npm test');
  });

  it('extracts fenced block after leading prose', () => {
    expect(parseCommandFromAIResponse('Here is the command:\n```sh\necho hi\n```').command).toBe('echo hi');
  });
});
