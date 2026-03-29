import type { Permission } from '@terminalmind/api';

/** i18n keys under `extensions.permission.*` — use `t(PERMISSION_LABEL_KEYS[p])` */
export const PERMISSION_LABEL_KEYS: Record<Permission, string> = {
  'terminal.execute': 'extensions.permission.terminalExecute',
  'connections.read': 'extensions.permission.connectionsRead',
  'connections.write': 'extensions.permission.connectionsWrite',
  'fs.read': 'extensions.permission.fsRead',
  'fs.write': 'extensions.permission.fsWrite',
  'ai.invoke': 'extensions.permission.aiInvoke',
  'network.outbound': 'extensions.permission.networkOutbound',
};

export function permissionIcon(permission: Permission): string {
  switch (permission) {
    case 'terminal.execute':
      return '⌘';
    case 'connections.read':
    case 'connections.write':
      return '🔌';
    case 'fs.read':
    case 'fs.write':
      return '📄';
    case 'ai.invoke':
      return '✨';
    case 'network.outbound':
      return '🌐';
    default:
      return '🔒';
  }
}
