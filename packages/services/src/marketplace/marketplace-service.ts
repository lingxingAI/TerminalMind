import { readFileSync, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import semver from 'semver';
import type { InstalledExtension, InstallProgress, MarketplaceSearchResult, RegistryEntry } from '@terminalmind/api';
import type { IEventBus } from '@terminalmind/core';
import { ExtensionHost } from '../extension-host/extension-host';
import { parseExtensionManifestFromPackageJson } from '../extension-host/manifest';
import type { IRegistryClient } from './registry-client';
import { extensionInstallDirectory, isSafeTarExtractPath } from './path-utils';

export interface IMarketplaceService {
  search(query: string, page?: number, pageSize?: number): Promise<MarketplaceSearchResult>;
  getDetails(name: string): Promise<RegistryEntry | null>;
  install(name: string, version?: string): Promise<void>;
  uninstall(extensionId: string): Promise<void>;
  update(extensionId: string): Promise<void>;
  listInstalled(): InstalledExtension[];
  getInstalled(id: string): InstalledExtension | undefined;
  enable(extensionId: string): Promise<void>;
  disable(extensionId: string): Promise<void>;
}

export interface MarketplaceServiceDeps {
  readonly registryClient: IRegistryClient;
  readonly extensionHost: ExtensionHost;
  readonly eventBus: IEventBus;
  /** Default: ~/.terminalmind/extensions */
  readonly extensionsRoot?: string;
  readonly onInstallProgress?: (progress: InstallProgress) => void;
}

interface InstalledStoreFile {
  readonly version: 1;
  readonly extensions: InstalledExtension[];
}

const DEFAULT_PAGE_SIZE = 20;

function progressForPhase(phase: InstallProgress['phase']): number {
  switch (phase) {
    case 'downloading':
      return 15;
    case 'verifying':
      return 35;
    case 'extracting':
      return 55;
    case 'activating':
      return 85;
    case 'done':
      return 100;
    case 'error':
      return 0;
    default:
      return 0;
  }
}

function latestRegistryEntry(entries: RegistryEntry[], name: string): RegistryEntry | undefined {
  const matches = entries.filter((e) => e.name === name);
  if (matches.length === 0) {
    return undefined;
  }
  return matches.reduce((best, cur) => {
    const bv = semver.coerce(best.version);
    const cv = semver.coerce(cur.version);
    if (!bv) {
      return cur;
    }
    if (!cv) {
      return best;
    }
    return semver.gt(cv, bv) ? cur : best;
  });
}

function findEntryForInstall(entries: RegistryEntry[], name: string, version?: string): RegistryEntry | undefined {
  if (version !== undefined && version.length > 0) {
    return entries.find((e) => {
      if (e.name !== name) {
        return false;
      }
      if (e.version === version) {
        return true;
      }
      const ev = semver.coerce(e.version);
      const vv = semver.coerce(version);
      return ev !== null && vv !== null && semver.eq(ev, vv);
    });
  }
  return latestRegistryEntry(entries, name);
}

function entryMatchesQuery(e: RegistryEntry, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) {
    return true;
  }
  const parts = [e.name, e.displayName, e.description, ...e.tags].map((x) => x.toLowerCase());
  return parts.some((h) => h.includes(s));
}

function readInstalledStore(filePath: string): InstalledExtension[] {
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as InstalledStoreFile;
    if (data.version !== 1 || !Array.isArray(data.extensions)) {
      return [];
    }
    return [...data.extensions];
  } catch {
    return [];
  }
}

export class MarketplaceService implements IMarketplaceService {
  private readonly deps: MarketplaceServiceDeps;
  readonly extensionsRoot: string;
  private readonly installedPath: string;
  private indexCache: RegistryEntry[] | null = null;
  private installedExtensions: InstalledExtension[];

  constructor(deps: MarketplaceServiceDeps) {
    this.deps = deps;
    this.extensionsRoot = deps.extensionsRoot ?? path.join(os.homedir(), '.terminalmind', 'extensions');
    this.installedPath = path.join(this.extensionsRoot, 'installed.json');
    this.installedExtensions = readInstalledStore(this.installedPath);
  }

  private emitProgress(p: Omit<InstallProgress, 'progress'> & { progress?: number }): void {
    const progress: InstallProgress = {
      extensionId: p.extensionId,
      phase: p.phase,
      progress: p.progress ?? progressForPhase(p.phase),
      error: p.error,
    };
    this.deps.onInstallProgress?.(progress);
  }

  private async ensureIndex(): Promise<RegistryEntry[]> {
    if (!this.indexCache) {
      this.indexCache = await this.deps.registryClient.fetchIndex();
    }
    return this.indexCache;
  }

  private async saveInstalledStore(): Promise<void> {
    await mkdir(this.extensionsRoot, { recursive: true });
    const body: InstalledStoreFile = { version: 1, extensions: this.installedExtensions };
    await writeFile(this.installedPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  }

  async search(query: string, page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<MarketplaceSearchResult> {
    const index = await this.ensureIndex();
    const filtered = index.filter((e) => entryMatchesQuery(e, query));
    const total = filtered.length;
    const p = Math.max(1, page);
    const ps = Math.max(1, pageSize);
    const start = (p - 1) * ps;
    const entries = filtered.slice(start, start + ps);
    return { entries, total, page: p, pageSize: ps };
  }

  async getDetails(name: string): Promise<RegistryEntry | null> {
    const index = await this.ensureIndex();
    return latestRegistryEntry(index, name) ?? null;
  }

  async install(name: string, version?: string): Promise<void> {
    const index = await this.ensureIndex();
    const entry = findEntryForInstall(index, name, version);
    if (!entry) {
      throw new Error(`Extension "${name}"${version ? `@${version}` : ''} not found in registry`);
    }

    const extensionId = entry.name;

    const prior = this.installedExtensions.find((x) => x.id === entry.name);
    if (prior) {
      try {
        await this.deps.extensionHost.deactivateExtension(prior.id);
      } catch {
        /* not active in host */
      }
    }

    this.deps.eventBus.emit('marketplace.installStart', { extensionId });
    this.emitProgress({ extensionId, phase: 'downloading' });

    const tarballPath = path.join(
      os.tmpdir(),
      `tm-ext-${entry.name.replace(/[@/]/g, '-')}-${entry.version}-${Date.now()}.tgz`,
    );

    try {
      await this.deps.registryClient.downloadTarball(entry.tarballUrl, tarballPath, entry.sha512);

      this.emitProgress({ extensionId, phase: 'verifying' });

      const installDir = extensionInstallDirectory(this.extensionsRoot, entry.name);
      await rm(installDir, { recursive: true, force: true });
      await mkdir(installDir, { recursive: true });

      this.emitProgress({ extensionId, phase: 'extracting' });

      await tar.x({
        file: tarballPath,
        cwd: installDir,
        strip: 1,
        filter: (entryPath: string) => isSafeTarExtractPath(entryPath, installDir),
      });

      await rm(tarballPath, { force: true }).catch(() => undefined);

      const pkgRaw = await readFile(path.join(installDir, 'package.json'), 'utf8');
      const pkgJson: unknown = JSON.parse(pkgRaw);
      const manifest = parseExtensionManifestFromPackageJson(pkgJson);

      const now = Date.now();
      const record: InstalledExtension = {
        id: manifest.name,
        manifest,
        installPath: installDir,
        installedAt: now,
        updatedAt: now,
        enabled: true,
        isBuiltin: false,
      };

      this.installedExtensions = this.installedExtensions.filter((x) => x.id !== record.id);
      this.installedExtensions.push(record);
      await this.saveInstalledStore();

      this.emitProgress({ extensionId, phase: 'activating' });

      await this.deps.extensionHost.activateExtension(manifest.name, manifest, installDir);

      this.emitProgress({ extensionId, phase: 'done' });
      this.deps.eventBus.emit('extension.installed', { extensionId, version: manifest.version });
      this.deps.eventBus.emit('marketplace.installComplete', { extensionId, version: manifest.version });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitProgress({ extensionId, phase: 'error', error: message });
      this.deps.eventBus.emit('marketplace.installError', { extensionId, error: message });
      throw err;
    }
  }

  async uninstall(extensionId: string): Promise<void> {
    const ext = this.installedExtensions.find((x) => x.id === extensionId);
    if (!ext) {
      throw new Error(`Extension "${extensionId}" is not installed`);
    }

    try {
      await this.deps.extensionHost.deactivateExtension(extensionId);
    } catch {
      /* not registered in host */
    }

    await rm(ext.installPath, { recursive: true, force: true }).catch(() => undefined);

    this.installedExtensions = this.installedExtensions.filter((x) => x.id !== extensionId);
    await this.saveInstalledStore();

    this.deps.eventBus.emit('extension.uninstalled', { extensionId });
  }

  async update(extensionId: string): Promise<void> {
    const ext = this.installedExtensions.find((x) => x.id === extensionId);
    if (!ext) {
      throw new Error(`Extension "${extensionId}" is not installed`);
    }

    const index = await this.ensureIndex();
    const latest = latestRegistryEntry(index, ext.manifest.name);
    if (!latest) {
      throw new Error(`Extension "${ext.manifest.name}" not found in registry`);
    }

    const cur = semver.coerce(ext.manifest.version);
    const next = semver.coerce(latest.version);
    if (!cur || !next || !semver.gt(next, cur)) {
      return;
    }

    await this.uninstall(extensionId);
    await this.install(ext.manifest.name);
  }

  listInstalled(): InstalledExtension[] {
    return [...this.installedExtensions];
  }

  getInstalled(id: string): InstalledExtension | undefined {
    return this.installedExtensions.find((x) => x.id === id);
  }

  async enable(extensionId: string): Promise<void> {
    const idx = this.installedExtensions.findIndex((x) => x.id === extensionId);
    if (idx === -1) {
      throw new Error(`Extension "${extensionId}" is not installed`);
    }
    const ext = this.installedExtensions[idx]!;
    if (ext.enabled) {
      return;
    }

    const next: InstalledExtension = { ...ext, enabled: true, updatedAt: Date.now() };
    this.installedExtensions.splice(idx, 1, next);
    await this.saveInstalledStore();

    this.deps.eventBus.emit('extension.enabled', { extensionId });
    await this.deps.extensionHost.activateExtension(next.manifest.name, next.manifest, next.installPath);
  }

  async disable(extensionId: string): Promise<void> {
    const idx = this.installedExtensions.findIndex((x) => x.id === extensionId);
    if (idx === -1) {
      throw new Error(`Extension "${extensionId}" is not installed`);
    }
    const ext = this.installedExtensions[idx]!;
    if (!ext.enabled) {
      return;
    }

    try {
      await this.deps.extensionHost.deactivateExtension(extensionId);
    } catch {
      /* ignore */
    }

    const next: InstalledExtension = { ...ext, enabled: false, updatedAt: Date.now() };
    this.installedExtensions.splice(idx, 1, next);
    await this.saveInstalledStore();

    this.deps.eventBus.emit('extension.disabled', { extensionId });
  }
}
