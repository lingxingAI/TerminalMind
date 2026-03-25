import type { Permission, IPermissionManager } from '@terminalmind/api';

export function requirePermission(
  isBuiltin: boolean,
  permissionManager: IPermissionManager | undefined,
  extensionId: string,
  permission: Permission
): void {
  if (isBuiltin) return;
  if (!permissionManager?.check(extensionId, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
