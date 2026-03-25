import path from 'node:path';

/** True if resolved path is `root` or a path strictly inside `root`. */
export function isPathInsideDirectory(resolvedFile: string, resolvedRoot: string): boolean {
  const rel = path.relative(resolvedRoot, resolvedFile);
  if (rel === '') {
    return true;
  }
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Safe to extract under destDir when the entry path (relative to archive root after strip)
 * does not escape destDir (zip-slip).
 */
export function isSafeTarExtractPath(entryPath: string, destDir: string): boolean {
  if (!entryPath || entryPath === '.' || entryPath === './') {
    return true;
  }
  const resolved = path.resolve(destDir, entryPath);
  return isPathInsideDirectory(resolved, path.resolve(destDir));
}

export function extensionInstallDirectory(extensionsRoot: string, packageName: string): string {
  if (packageName.startsWith('@')) {
    const slash = packageName.indexOf('/');
    if (slash === -1) {
      return path.join(extensionsRoot, packageName);
    }
    const scope = packageName.slice(0, slash);
    const sub = packageName.slice(slash + 1);
    return path.join(extensionsRoot, scope, sub);
  }
  return path.join(extensionsRoot, packageName);
}
