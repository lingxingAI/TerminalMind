export type { IShellDiscoveryAdapter } from './shell-discovery';
export { Win32ShellDiscovery } from './shell-discovery-win32';
export { UnixShellDiscovery } from './shell-discovery-unix';
export { createShellDiscovery } from './shell-discovery-factory';
export type { TerminalSession, ITerminalService } from './terminal-service';
export { TerminalService } from './terminal-service';
