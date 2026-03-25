import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBusImpl } from '@terminalmind/core';
import { PermissionManager } from '../permission-manager';

describe('PermissionManager', () => {
  let tmpDir: string;
  let eventBus: EventBusImpl;
  let permissionsPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tm-perm-'));
    permissionsPath = join(tmpDir, 'permissions.json');
    eventBus = new EventBusImpl();
  });

  it('grants builtin extension all permissions on check', () => {
    const mgr = new PermissionManager({
      permissionsFilePath: permissionsPath,
      eventBus,
    });
    mgr.registerBuiltin('ext-builtin');
    expect(mgr.check('ext-builtin', 'fs.read')).toBe(true);
    expect(mgr.check('ext-builtin', 'ai.invoke')).toBe(true);
  });

  it('denies third-party by default', () => {
    const mgr = new PermissionManager({
      permissionsFilePath: permissionsPath,
      eventBus,
    });
    expect(mgr.check('third-party', 'fs.read')).toBe(false);
  });

  it('persists grant and reloads', async () => {
    const notify = vi.fn();
    const mgr = new PermissionManager({
      permissionsFilePath: permissionsPath,
      eventBus,
      notifyPermissionPrompt: notify,
    });
    const p = mgr.request('tp-1', ['fs.read']);
    expect(notify).toHaveBeenCalledTimes(1);
    mgr.handlePromptResult('tp-1', true);
    const grants = await p;
    expect(grants[0]?.granted).toBe(true);

    const mgr2 = new PermissionManager({
      permissionsFilePath: permissionsPath,
      eventBus,
    });
    expect(mgr2.check('tp-1', 'fs.read')).toBe(true);
  });

  it('revoke removes grant', async () => {
    const mgr = new PermissionManager({
      permissionsFilePath: permissionsPath,
      eventBus,
    });
    const p = mgr.request('tp-2', ['fs.write']);
    mgr.handlePromptResult('tp-2', true);
    await p;
    expect(mgr.check('tp-2', 'fs.write')).toBe(true);
    mgr.revoke('tp-2', 'fs.write');
    expect(mgr.check('tp-2', 'fs.write')).toBe(false);
  });

  it('getGrants returns all grants for extension', async () => {
    const mgr = new PermissionManager({
      permissionsFilePath: permissionsPath,
      eventBus,
    });
    const p = mgr.request('tp-3', ['fs.read', 'fs.write']);
    mgr.handlePromptResult('tp-3', true);
    await p;
    const list = mgr.getGrants('tp-3');
    expect(list.length).toBe(2);
    expect(new Set(list.map((g) => g.permission))).toEqual(new Set(['fs.read', 'fs.write']));
  });

  it('round-trips permissions.json', () => {
    const doc = {
      version: 1 as const,
      grants: [
        {
          extensionId: 'tp-rt',
          permission: 'connections.read' as const,
          granted: true,
          timestamp: 1700000000000,
        },
      ],
    };
    writeFileSync(permissionsPath, JSON.stringify(doc), 'utf-8');

    const mgr = new PermissionManager({
      permissionsFilePath: permissionsPath,
      eventBus,
    });
    expect(mgr.check('tp-rt', 'connections.read')).toBe(true);

    mgr.revoke('tp-rt', 'connections.read');
    const raw = JSON.parse(readFileSync(permissionsPath, 'utf-8')) as { grants: unknown[] };
    expect(raw.grants).toEqual([]);
  });
});
