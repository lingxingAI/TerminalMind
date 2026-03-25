import type { ConnectionsNamespace, StoredConnectionProfile } from '@terminalmind/api';
import type { IConnectionStore } from '../../connection/index.js';
import type { IPermissionManager } from '@terminalmind/api';
import { requirePermission } from '../permission.js';

export function createConnectionsNamespace(
  store: IConnectionStore,
  extensionId: string,
  isBuiltin: boolean,
  permissionManager: IPermissionManager | undefined
): ConnectionsNamespace {
  return {
    async list() {
      requirePermission(isBuiltin, permissionManager, extensionId, 'connections.read');
      const profiles = await store.list();
      return profiles.map((p) => ({ id: p.id, name: p.name, type: p.type }));
    },
    async get(id: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'connections.read');
      return (await store.get(id)) ?? null;
    },
    async save(profile: StoredConnectionProfile) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'connections.write');
      await store.save(profile);
    },
    async remove(id: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'connections.write');
      await store.remove(id);
    },
  };
}
