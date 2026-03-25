import type { ShellInfo } from '@terminalmind/api';
import type { IShellDiscoveryAdapter } from './shell-discovery';
import { existsSync } from 'fs';
import { join } from 'path';

export class Win32ShellDiscovery implements IShellDiscoveryAdapter {
  async discoverShells(): Promise<readonly ShellInfo[]> {
    const shells: ShellInfo[] = [];

    const comspec = process.env.COMSPEC ?? 'C:\\Windows\\System32\\cmd.exe';
    if (existsSync(comspec)) {
      shells.push({
        id: 'cmd',
        name: 'Command Prompt',
        path: comspec,
        args: [],
        platform: 'win32',
        isDefault: false,
      });
    }

    const ps5 = join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    if (existsSync(ps5)) {
      shells.push({
        id: 'powershell-5',
        name: 'Windows PowerShell',
        path: ps5,
        args: ['-NoLogo'],
        platform: 'win32',
        isDefault: false,
      });
    }

    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const pwshPath = join(programFiles, 'PowerShell', '7', 'pwsh.exe');
    if (existsSync(pwshPath)) {
      shells.push({
        id: 'powershell-7',
        name: 'PowerShell 7',
        path: pwshPath,
        args: ['-NoLogo'],
        platform: 'win32',
        isDefault: false,
      });
    }

    const gitBash = join(programFiles, 'Git', 'bin', 'bash.exe');
    if (existsSync(gitBash)) {
      shells.push({
        id: 'git-bash',
        name: 'Git Bash',
        path: gitBash,
        args: ['--login'],
        platform: 'win32',
        isDefault: false,
      });
    }

    if (shells.length > 0) {
      const defaultShell = shells.find((s) => s.id === 'powershell-7') ?? shells[0];
      const idx = shells.indexOf(defaultShell);
      shells[idx] = { ...defaultShell, isDefault: true };
    }

    return shells;
  }

  async getDefaultShell(): Promise<ShellInfo> {
    const shells = await this.discoverShells();
    const def = shells.find((s) => s.isDefault);
    if (!def) {
      return {
        id: 'cmd',
        name: 'Command Prompt',
        path: process.env.COMSPEC ?? 'C:\\Windows\\System32\\cmd.exe',
        args: [],
        platform: 'win32',
        isDefault: true,
      };
    }
    return def;
  }
}
