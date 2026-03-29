import type { AICommandContext } from '@terminalmind/api';

export function guessLocalOs(): string {
  const p = navigator.platform ?? '';
  if (/^Win/i.test(p)) return 'win32';
  if (/^Mac/i.test(p)) return 'darwin';
  return 'linux';
}

export async function buildTerminalContext(
  sessionId: string,
  connectionType: 'local' | 'ssh',
  sshSessionId?: string,
): Promise<AICommandContext> {
  const session = await window.api.terminal.getSession(sessionId);
  if (connectionType === 'ssh' && sshSessionId) {
    const sshInfo = await window.api.ssh.getSession(sshSessionId);
    return {
      shell: '/bin/bash',
      os: 'linux',
      cwd: sshInfo ? `${sshInfo.username}@${sshInfo.host}` : '',
    };
  }
  return {
    shell: session?.shellPath ?? 'unknown',
    os: guessLocalOs(),
    cwd: '',
  };
}
