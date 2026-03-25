import type { AICommandContext } from '@terminalmind/api';
import type { IShellDiscoveryAdapter } from '../terminal/shell-discovery';

export interface ContextCollectorInput {
  readonly cwd: string;
  readonly recentCommands: readonly string[];
  readonly recentOutput: string;
}

/**
 * Builds {@link AICommandContext} from the current OS, default shell, cwd, and caller-supplied history/output.
 * Command/output capture will be wired from {@link TerminalService} later.
 */
export class ContextCollector {
  constructor(private readonly shellDiscovery: IShellDiscoveryAdapter) {}

  async collect(input: Readonly<ContextCollectorInput>): Promise<AICommandContext> {
    const shell = await this.shellDiscovery.getDefaultShell();
    return {
      os: process.platform,
      shell: shell.path,
      cwd: input.cwd,
      recentCommands: input.recentCommands,
      recentOutput: input.recentOutput,
    };
  }
}
