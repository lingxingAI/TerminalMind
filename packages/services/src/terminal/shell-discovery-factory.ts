import type { IShellDiscoveryAdapter } from './shell-discovery';
import { Win32ShellDiscovery } from './shell-discovery-win32';
import { UnixShellDiscovery } from './shell-discovery-unix';

export function createShellDiscovery(): IShellDiscoveryAdapter {
  if (process.platform === 'win32') {
    return new Win32ShellDiscovery();
  }
  return new UnixShellDiscovery();
}
