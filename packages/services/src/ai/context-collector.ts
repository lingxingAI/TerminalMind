import type { AICommandContext } from '@terminalmind/api';
import type { IShellDiscoveryAdapter } from '../terminal/shell-discovery';

export interface ContextCollectorInput {
  readonly cwd: string;
  readonly recentCommands: readonly string[];
  readonly recentOutput: string;
  readonly osOverride?: string;
  readonly shellOverride?: string;
}

/**
 * Builds {@link AICommandContext} from the current OS, default shell, cwd, and caller-supplied history/output.
 * When osOverride/shellOverride are provided (e.g. for SSH sessions), those take precedence.
 */
export class ContextCollector {
  constructor(private readonly shellDiscovery: IShellDiscoveryAdapter) {}

  async collect(input: Readonly<ContextCollectorInput>): Promise<AICommandContext> {
    const os = input.osOverride ?? process.platform;
    const shell = input.shellOverride ?? (await this.shellDiscovery.getDefaultShell()).path;
    return {
      os,
      shell,
      cwd: input.cwd,
      recentCommands: input.recentCommands,
      recentOutput: input.recentOutput,
    };
  }
}
