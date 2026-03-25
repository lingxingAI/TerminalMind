import type { IPermissionManager, Permission } from '@terminalmind/api';

export class PermissionDeniedError extends Error {
  readonly extensionId: string;
  readonly permission: Permission;

  constructor(extensionId: string, permission: Permission) {
    super(`Permission denied: ${extensionId} → ${permission}`);
    this.name = 'PermissionDeniedError';
    this.extensionId = extensionId;
    this.permission = permission;
  }
}

export function withPermissionCheck<T extends (...args: never[]) => unknown>(
  permissionManager: IPermissionManager,
  extensionId: string,
  permission: Permission,
  fn: T,
): T {
  const wrapped = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    if (!permissionManager.check(extensionId, permission)) {
      throw new PermissionDeniedError(extensionId, permission);
    }
    return fn.apply(this, args) as ReturnType<T>;
  } as T;
  return wrapped;
}
