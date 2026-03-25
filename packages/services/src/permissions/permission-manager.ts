import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IPermissionManager, Permission, PermissionGrant, PermissionPrompt } from '@terminalmind/api';
import type { IEventBus } from '@terminalmind/core';

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set<Permission>([
  'terminal.execute',
  'connections.read',
  'connections.write',
  'fs.read',
  'fs.write',
  'ai.invoke',
  'network.outbound',
]);

interface PersistedPermissions {
  readonly version: 1;
  readonly grants: PermissionGrant[];
}

interface PendingEntry {
  readonly resolve: (grants: PermissionGrant[]) => void;
  readonly reject: (err: Error) => void;
  readonly permissions: readonly Permission[];
}

export interface PermissionManagerDeps {
  readonly permissionsFilePath: string;
  readonly eventBus: IEventBus;
  readonly notifyPermissionPrompt?: (prompt: PermissionPrompt) => void;
  readonly getExtensionDisplayName?: (extensionId: string) => string;
}

function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && KNOWN_PERMISSIONS.has(value);
}

function parseGrant(raw: unknown): PermissionGrant | undefined {
  if (raw === null || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const extensionId = o.extensionId;
  const permission = o.permission;
  const granted = o.granted;
  const timestamp = o.timestamp;
  if (
    typeof extensionId !== 'string' ||
    !isPermission(permission) ||
    typeof granted !== 'boolean' ||
    typeof timestamp !== 'number'
  ) {
    return undefined;
  }
  return { extensionId, permission, granted, timestamp };
}

export class PermissionManager implements IPermissionManager {
  private readonly grants: PermissionGrant[] = [];
  private readonly builtins = new Set<string>();
  private readonly pending = new Map<string, PendingEntry>();
  private readonly permissionsFilePath: string;
  private readonly eventBus: IEventBus;
  private readonly notifyPermissionPrompt?: (prompt: PermissionPrompt) => void;
  private readonly getExtensionDisplayName: (extensionId: string) => string;

  constructor(deps: Readonly<PermissionManagerDeps>) {
    this.permissionsFilePath = deps.permissionsFilePath;
    this.eventBus = deps.eventBus;
    this.notifyPermissionPrompt = deps.notifyPermissionPrompt;
    this.getExtensionDisplayName = deps.getExtensionDisplayName ?? ((id) => id);
    this.load();
  }

  check(extensionId: string, permission: Permission): boolean {
    if (this.builtins.has(extensionId)) {
      return true;
    }
    return this.grants.some(
      (g) => g.extensionId === extensionId && g.permission === permission && g.granted === true,
    );
  }

  async request(extensionId: string, permissions: readonly Permission[]): Promise<PermissionGrant[]> {
    if (permissions.length === 0) {
      return [];
    }

    if (this.builtins.has(extensionId)) {
      const ts = Date.now();
      const out = permissions.map(
        (permission): PermissionGrant => ({
          extensionId,
          permission,
          granted: true,
          timestamp: ts,
        }),
      );
      for (const permission of permissions) {
        this.eventBus.emit('permission.granted', { extensionId, permission });
      }
      return out;
    }

    if (permissions.every((p) => this.check(extensionId, p))) {
      return permissions.map((permission) => {
        const g = this.grants.find(
          (x) => x.extensionId === extensionId && x.permission === permission && x.granted,
        )!;
        return {
          extensionId,
          permission,
          granted: true,
          timestamp: g.timestamp,
        };
      });
    }

    const existing = this.pending.get(extensionId);
    if (existing) {
      existing.reject(new Error('Permission request superseded'));
      this.pending.delete(extensionId);
    }

    return new Promise<PermissionGrant[]>((resolve, reject) => {
      this.pending.set(extensionId, { resolve, reject, permissions });
      const prompt: PermissionPrompt = {
        extensionId,
        extensionName: this.getExtensionDisplayName(extensionId),
        permissions: [...permissions],
      };
      this.notifyPermissionPrompt?.(prompt);
    });
  }

  revoke(extensionId: string, permission: Permission): void {
    const before = this.grants.length;
    const next = this.grants.filter(
      (g) => !(g.extensionId === extensionId && g.permission === permission && g.granted),
    );
    if (next.length === before) {
      return;
    }
    this.grants.length = 0;
    this.grants.push(...next);
    this.save();
    this.eventBus.emit('permission.revoked', { extensionId, permission });
  }

  getGrants(extensionId: string): PermissionGrant[] {
    return this.grants.filter((g) => g.extensionId === extensionId && g.granted);
  }

  isBuiltin(extensionId: string): boolean {
    return this.builtins.has(extensionId);
  }

  registerBuiltin(extensionId: string): void {
    this.builtins.add(extensionId);
  }

  /** Resolves the pending `request()` for this extension (main IPC). */
  handlePromptResult(extensionId: string, granted: boolean): void {
    const entry = this.pending.get(extensionId);
    if (!entry) {
      return;
    }
    this.pending.delete(extensionId);
    const ts = Date.now();
    if (!granted) {
      const out = entry.permissions.map(
        (permission): PermissionGrant => ({
          extensionId,
          permission,
          granted: false,
          timestamp: ts,
        }),
      );
      for (const permission of entry.permissions) {
        this.eventBus.emit('permission.denied', { extensionId, permission });
      }
      entry.resolve(out);
      return;
    }

    for (const permission of entry.permissions) {
      this.upsertGrant(extensionId, permission, ts);
      this.eventBus.emit('permission.granted', { extensionId, permission });
    }
    this.save();
    const out = entry.permissions.map(
      (permission): PermissionGrant => ({
        extensionId,
        permission,
        granted: true,
        timestamp: ts,
      }),
    );
    entry.resolve(out);
  }

  private upsertGrant(extensionId: string, permission: Permission, timestamp: number): void {
    const idx = this.grants.findIndex(
      (g) => g.extensionId === extensionId && g.permission === permission,
    );
    const row: PermissionGrant = { extensionId, permission, granted: true, timestamp };
    if (idx >= 0) {
      this.grants[idx] = row;
    } else {
      this.grants.push(row);
    }
  }

  private load(): void {
    try {
      if (!existsSync(this.permissionsFilePath)) {
        return;
      }
      const raw = JSON.parse(readFileSync(this.permissionsFilePath, 'utf-8')) as unknown;
      if (raw === null || typeof raw !== 'object') {
        return;
      }
      const doc = raw as Partial<PersistedPermissions>;
      if (doc.version !== 1 || !Array.isArray(doc.grants)) {
        return;
      }
      for (const item of doc.grants) {
        const g = parseGrant(item);
        if (g && g.granted) {
          this.grants.push(g);
        }
      }
    } catch {
      /* ignore corrupt file */
    }
  }

  private save(): void {
    const dir = dirname(this.permissionsFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const doc: PersistedPermissions = {
      version: 1,
      grants: this.grants.filter((g) => g.granted),
    };
    writeFileSync(this.permissionsFilePath, JSON.stringify(doc, null, 2), 'utf-8');
  }
}
