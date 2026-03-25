import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { ConnectionStore } from '../connection-store';
import { InMemorySecretStore } from '../secret-store';
import type { ConnectionProfile } from '../types';

describe('ConnectionStore', () => {
  let tmpDir: string;
  let secrets: InMemorySecretStore;
  let store: ConnectionStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tmind-conn-'));
    secrets = new InMemorySecretStore();
    store = new ConnectionStore(secrets, tmpDir);
  });

  afterEach(() => {
    store.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function sshProfile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
    const id = overrides.id ?? 'p1';
    const now = 1_700_000_000_000;
    return {
      id,
      name: 'Test',
      type: 'ssh',
      sshConfig: {
        host: 'example.com',
        port: 22,
        username: 'u',
        auth: { type: 'password', password: 'secret-pass' },
      },
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('CRUD: save, get, list, remove', async () => {
    const p = sshProfile({ id: 'a1', name: 'Alpha' });
    await store.save(p);

    const got = await store.get('a1');
    expect(got?.name).toBe('Alpha');
    expect(got?.sshConfig?.auth).toEqual({ type: 'password', password: 'secret-pass' });

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe('a1');

    await store.remove('a1');
    expect(await store.get('a1')).toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });

  it('does not write password or passphrase to connections.json', async () => {
    const id = 'sec1';
    await store.save(
      sshProfile({
        id,
        sshConfig: {
          host: 'h',
          port: 22,
          username: 'u',
          auth: { type: 'password', password: 'top-secret' },
        },
      })
    );

    const jsonPath = join(tmpDir, 'connections.json');
    const raw = readFileSync(jsonPath, 'utf-8');
    expect(raw).not.toContain('top-secret');
    expect(raw).toContain('"type": "password"');

    const pkProfile = sshProfile({
      id: 'sec2',
      sshConfig: {
        host: 'h',
        port: 22,
        username: 'u',
        auth: {
          type: 'publicKey',
          privateKeyPath: '/home/u/.ssh/id_ed25519',
          passphrase: 'pp-secret',
        },
      },
    });
    await store.save(pkProfile);
    const raw2 = readFileSync(jsonPath, 'utf-8');
    expect(raw2).not.toContain('pp-secret');
  });

  it('hydrates secrets from ISecretStore when loading connections.json from disk', async () => {
    const id = 'reload1';
    await store.save(sshProfile({ id, name: 'R' }));
    store.dispose();

    const emptySecrets = new InMemorySecretStore();
    const storeCold = new ConnectionStore(emptySecrets, tmpDir);
    const cold = await storeCold.get(id);
    expect(cold?.sshConfig?.auth).toEqual({ type: 'password', password: '' });
    storeCold.dispose();

    const storeWarm = new ConnectionStore(secrets, tmpDir);
    const warm = await storeWarm.get(id);
    expect(warm?.sshConfig?.auth).toEqual({ type: 'password', password: 'secret-pass' });
    storeWarm.dispose();
  });

  it('import assigns new ids and export returns stripped JSON for selected ids', async () => {
    await store.save(sshProfile({ id: 'orig', name: 'Keep' }));

    const blob = JSON.stringify({
      version: 1,
      profiles: [
        {
          id: 'will-be-replaced',
          name: 'Imported',
          type: 'ssh',
          createdAt: 100,
          updatedAt: 200,
          sshConfig: {
            host: 'imp.test',
            port: 2222,
            username: 'iu',
            auth: { type: 'password', password: 'inline-import' },
          },
        },
      ],
    });

    const imported = await store.import(blob, 'json');
    expect(imported).toHaveLength(1);
    const imp = imported[0]!;
    expect(imp.id).not.toBe('will-be-replaced');
    expect(imp.name).toBe('Imported');
    expect(imp.sshConfig?.auth).toEqual({ type: 'password', password: 'inline-import' });

    const exported = await store.export([imp.id], 'json');
    expect(exported).not.toContain('inline-import');
    const parsed = JSON.parse(exported) as { profiles: { id: string }[] };
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.profiles[0]!.id).toBe(imp.id);
  });

  it('fires onChange and stops after dispose', async () => {
    const fn = vi.fn();
    const sub = store.onChange(fn);

    await store.save(sshProfile({ id: 'e1' }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith({ type: 'added', profileId: 'e1' });

    await store.save(sshProfile({ id: 'e1', name: 'Updated' }));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith({ type: 'updated', profileId: 'e1' });

    await store.remove('e1');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenLastCalledWith({ type: 'removed', profileId: 'e1' });

    sub.dispose();
    await store.save(sshProfile({ id: 'e2' }));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('remove clears secret keys for the profile', async () => {
    const id = 'del-sec';
    await store.save(sshProfile({ id }));
    expect(await secrets.get(`connection:${id}:password`)).toBe('secret-pass');

    await store.remove(id);
    expect(await secrets.get(`connection:${id}:password`)).toBeNull();
    const jsonPath = join(tmpDir, 'connections.json');
    expect(existsSync(jsonPath)).toBe(true);
    const disk = JSON.parse(readFileSync(jsonPath, 'utf-8')) as { profiles: unknown[] };
    expect(disk.profiles).toHaveLength(0);
  });
});
