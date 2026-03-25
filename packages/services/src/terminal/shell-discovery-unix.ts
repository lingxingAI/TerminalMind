import type { ShellInfo } from '@terminalmind/api';
import type { IShellDiscoveryAdapter } from './shell-discovery';
import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';

export class UnixShellDiscovery implements IShellDiscoveryAdapter {
  async discoverShells(): Promise<readonly ShellInfo[]> {
    const shells: ShellInfo[] = [];
    const platform = process.platform === 'darwin' ? 'darwin' : 'linux';

    try {
      const content = readFileSync('/etc/shells', 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));

      for (const shellPath of lines) {
        if (!existsSync(shellPath)) continue;
        const name = basename(shellPath);
        shells.push({
          id: name,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          path: shellPath,
          args: [],
          platform,
          isDefault: false,
        });
      }
    } catch {
      // /etc/shells not readable, fall back
    }

    if (shells.length === 0) {
      shells.push({
        id: 'sh',
        name: 'sh',
        path: '/bin/sh',
        args: [],
        platform,
        isDefault: true,
      });
    }

    const envShell = process.env.SHELL;
    if (envShell) {
      const defIdx = shells.findIndex((s) => s.path === envShell);
      if (defIdx >= 0) {
        shells[defIdx] = { ...shells[defIdx], isDefault: true };
      }
    } else if (shells.length > 0) {
      shells[0] = { ...shells[0], isDefault: true };
    }

    return shells;
  }

  async getDefaultShell(): Promise<ShellInfo> {
    const shells = await this.discoverShells();
    return shells.find((s) => s.isDefault) ?? shells[0];
  }
}
