import type { ShellInfo } from '@terminalmind/api';

export interface IShellDiscoveryAdapter {
  discoverShells(): Promise<readonly ShellInfo[]>;
  getDefaultShell(): Promise<ShellInfo>;
}
