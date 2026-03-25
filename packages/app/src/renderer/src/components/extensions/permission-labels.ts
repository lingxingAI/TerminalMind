import type { Permission } from '@terminalmind/api';

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'terminal.execute': 'Execute commands in terminal',
  'connections.read': 'Read connection profiles',
  'connections.write': 'Modify connection profiles',
  'fs.read': 'Read files on your computer',
  'fs.write': 'Write files on your computer',
  'ai.invoke': 'Use AI features',
  'network.outbound': 'Make network requests',
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
