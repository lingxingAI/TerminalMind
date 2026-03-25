/// <reference types="vitest/globals" />

import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import type { RegistryEntry } from '@terminalmind/api';
import { EventBusImpl } from '@terminalmind/core';
import { ExtensionHost } from '../../extension-host/extension-host';
import { MarketplaceService } from '../marketplace-service';
import { RegistryClient } from '../registry-client';
import type { IRegistryClient } from '../registry-client';
import { isSafeTarExtractPath } from '../path-utils';

function sampleEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    name: 'market-test-ext',
    displayName: 'Market Test',
    description: 'Alpha beta gamma tags',
    version: '1.0.0',
    author: 'test',
    repository: 'https://example.com/r',
    tarballUrl: 'https://example.com/pkg.tgz',
    sha512: '00'.repeat(64),
    downloads: 1,
    tags: ['alpha', 'ssh'],
    publishedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function buildExtensionTgz(dir: string): Promise<string> {
  const pkgRoot = join(dir, 'package');
  await mkdir(pkgRoot, { recursive: true });
  await writeFile(
    join(pkgRoot, 'package.json'),
    JSON.stringify({
      name: 'market-test-ext',
      version: '1.0.0',
      description: 'test',
      terminalmind: { entry: './index.js', activationEvents: ['*'] },
    }),
    'utf8',
  );
  const tgz = join(dir, 'ext.tgz');
  await tar.c({ file: tgz, gzip: true, cwd: dir }, ['package']);
  return tgz;
}

async function createService(opts: {
  registry: IRegistryClient;
  extensionsRoot: string;
  eventBus?: EventBusImpl;
  onInstallProgress?: (p: import('@terminalmind/api').InstallProgress) => void;
}) {
  const events = opts.eventBus ?? new EventBusImpl();
  const extensionHost = {
    activateExtension: vi.fn().mockResolvedValue(undefined),
    deactivateExtension: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExtensionHost;

  const svc = new MarketplaceService({
    registryClient: opts.registry,
    extensionHost,
    eventBus: events,
    extensionsRoot: opts.extensionsRoot,
    onInstallProgress: opts.onInstallProgress,
  });
  return { svc, events, extensionHost };
}

describe('MarketplaceService', () => {
  it('search filters by name, displayName, description, and tags', async () => {
    const entries: RegistryEntry[] = [
      sampleEntry({ name: 'a', displayName: 'Foo', description: 'no', tags: [] }),
      sampleEntry({
        name: 'b',
        displayName: 'Bar',
        description: 'has beta here',
        tags: ['gamma'],
      }),
    ];
    const registry: IRegistryClient = {
      fetchIndex: vi.fn().mockResolvedValue(entries),
      downloadTarball: vi.fn(),
    };
    const root = await mkdtemp(join(tmpdir(), 'tm-mkt-'));
    const { svc } = await createService({ registry, extensionsRoot: root });

    const r1 = await svc.search('beta');
    expect(r1.total).toBe(1);
    expect(r1.entries[0]!.name).toBe('b');

    const r2 = await svc.search('gamma');
    expect(r2.total).toBe(1);

    const r3 = await svc.search('foo');
    expect(r3.total).toBe(1);
    expect(r3.entries[0]!.name).toBe('a');
  });

  it('getDetails returns latest semver when multiple versions share a name', async () => {
    const entries: RegistryEntry[] = [
      sampleEntry({ name: 'x', version: '1.0.0' }),
      sampleEntry({ name: 'x', version: '2.0.0' }),
    ];
    const registry: IRegistryClient = {
      fetchIndex: vi.fn().mockResolvedValue(entries),
      downloadTarball: vi.fn(),
    };
    const root = await mkdtemp(join(tmpdir(), 'tm-mkt-'));
    const { svc } = await createService({ registry, extensionsRoot: root });
    const d = await svc.getDetails('x');
    expect(d?.version).toBe('2.0.0');
  });

  it('install extracts package, saves installed.json, activates, and emits progress', async () => {
    const work = await mkdtemp(join(tmpdir(), 'tm-mkt-'));
    const tgzPath = await buildExtensionTgz(work);
    const tgzBuf = await readFile(tgzPath);
    const sha512 = createHash('sha512').update(tgzBuf).digest('hex');

    const entry = sampleEntry({ sha512, tarballUrl: 'https://registry.test/ext.tgz' });
    const registry: IRegistryClient = {
      fetchIndex: vi.fn().mockResolvedValue([entry]),
      downloadTarball: vi.fn(async (_url, destPath) => {
        await writeFile(destPath, tgzBuf);
        return destPath;
      }),
    };

    const root = await mkdtemp(join(tmpdir(), 'tm-mkt-root-'));
    const progress: string[] = [];
    const { svc, extensionHost, events } = await createService({
      registry,
      extensionsRoot: root,
      onInstallProgress: (p) => progress.push(p.phase),
    });

    const installSpy = vi.spyOn(events, 'emit');

    await svc.install('market-test-ext');

    expect(registry.downloadTarball).toHaveBeenCalled();
    expect(extensionHost.activateExtension).toHaveBeenCalled();
    expect(progress).toEqual(['downloading', 'verifying', 'extracting', 'activating', 'done']);

    const installed = svc.listInstalled();
    expect(installed).toHaveLength(1);
    expect(installed[0]!.id).toBe('market-test-ext');
    expect(installed[0]!.manifest.version).toBe('1.0.0');

    expect(installSpy).toHaveBeenCalledWith('marketplace.installStart', { extensionId: 'market-test-ext' });
    expect(installSpy).toHaveBeenCalledWith('extension.installed', {
      extensionId: 'market-test-ext',
      version: '1.0.0',
    });
  });

  it('uninstall removes install dir and entry from installed store', async () => {
    const work = await mkdtemp(join(tmpdir(), 'tm-mkt-'));
    const tgzPath = await buildExtensionTgz(work);
    const tgzBuf = await readFile(tgzPath);
    const sha512 = createHash('sha512').update(tgzBuf).digest('hex');
    const entry = sampleEntry({ sha512 });

    const registry: IRegistryClient = {
      fetchIndex: vi.fn().mockResolvedValue([entry]),
      downloadTarball: vi.fn(async (_url, destPath) => {
        await writeFile(destPath, tgzBuf);
        return destPath;
      }),
    };
    const root = await mkdtemp(join(tmpdir(), 'tm-mkt-root-'));
    const { svc, events } = await createService({ registry, extensionsRoot: root });
    const spy = vi.spyOn(events, 'emit');

    await svc.install('market-test-ext');
    expect(svc.listInstalled()).toHaveLength(1);

    await svc.uninstall('market-test-ext');
    expect(svc.listInstalled()).toHaveLength(0);
    expect(spy).toHaveBeenCalledWith('extension.uninstalled', { extensionId: 'market-test-ext' });
  });
});

describe('RegistryClient', () => {
  it('throws when tarball SHA-512 does not match', async () => {
    const client = new RegistryClient({
      fetchFn: async () => new Response(Buffer.from('not-a-real-tar')),
    });
    const out = join(tmpdir(), `bad-${Date.now()}.tgz`);
    await expect(client.downloadTarball('http://example/x.tgz', out, 'ab'.repeat(64))).rejects.toThrow(
      'SHA-512 mismatch',
    );
  });
});

describe('zip-slip protection', () => {
  it('rejects paths that escape the destination directory', () => {
    const dest = join(tmpdir(), 'safe-root');
    expect(isSafeTarExtractPath('../outside', dest)).toBe(false);
    expect(isSafeTarExtractPath('ok/sub/file.txt', dest)).toBe(true);
  });
});
