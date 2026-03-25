import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FSNamespace } from '@terminalmind/api';
import type { IPermissionManager } from '@terminalmind/api';
import { requirePermission } from '../permission.js';

function toAbsolute(p: string): string {
  return resolve(p);
}

export function createFSNamespace(
  extensionId: string,
  isBuiltin: boolean,
  permissionManager: IPermissionManager | undefined
): FSNamespace {
  return {
    async readFile(path: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'fs.read');
      return readFile(toAbsolute(path), 'utf-8');
    },
    async writeFile(path: string, content: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'fs.write');
      await writeFile(toAbsolute(path), content, 'utf-8');
    },
    async readDir(path: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'fs.read');
      const entries = await readdir(toAbsolute(path), { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    },
    async stat(path: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'fs.read');
      const s = await stat(toAbsolute(path));
      return {
        size: s.size,
        isDirectory: s.isDirectory(),
        modifiedAt: s.mtimeMs,
      };
    },
    async exists(path: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'fs.read');
      try {
        await stat(toAbsolute(path));
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(path: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'fs.write');
      await mkdir(toAbsolute(path), { recursive: true });
    },
    async remove(path: string) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'fs.write');
      await rm(toAbsolute(path), { recursive: true, force: true });
    },
  };
}
