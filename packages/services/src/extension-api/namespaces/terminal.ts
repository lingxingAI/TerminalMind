import type { TerminalNamespace } from '@terminalmind/api';
import type { ITerminalService } from '../../terminal/terminal-service.js';
import type { IPermissionManager } from '@terminalmind/api';
import { requirePermission } from '../permission.js';

export function createTerminalNamespace(
  terminalService: ITerminalService,
  extensionId: string,
  isBuiltin: boolean,
  permissionManager: IPermissionManager | undefined
): TerminalNamespace {
  return {
    async create(options?: { shell?: string; cwd?: string; title?: string }) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'terminal.execute');
      const session = await terminalService.create({
        shell: options?.shell,
        cwd: options?.cwd,
        title: options?.title,
      });
      return { id: session.id, title: session.title };
    },
    list() {
      requirePermission(isBuiltin, permissionManager, extensionId, 'terminal.execute');
      return terminalService.listSessions().map((s) => ({ id: s.id, title: s.title }));
    },
    sendInput(sessionId: string, data: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'terminal.execute');
      const session = terminalService.getSession(sessionId);
      session?.write(data);
    },
    async destroy(sessionId: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'terminal.execute');
      await terminalService.destroy(sessionId);
    },
    onData(sessionId: string, callback: (data: string) => void) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'terminal.execute');
      const session = terminalService.getSession(sessionId);
      if (!session) {
        return { dispose: () => {} };
      }
      return session.onData(callback);
    },
    onExit(sessionId: string, callback: (exitCode: number) => void) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'terminal.execute');
      const session = terminalService.getSession(sessionId);
      if (!session) {
        return { dispose: () => {} };
      }
      return session.onExit((e) => callback(e.exitCode));
    },
  };
}
