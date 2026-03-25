import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RegistryEntry } from '@terminalmind/api';

const DEFAULT_INDEX_URL =
  'https://raw.githubusercontent.com/terminalmind/extensions-registry/main/index.json';

export interface RegistryIndexFile {
  readonly version: number;
  readonly extensions: readonly RegistryEntry[];
}

export interface IRegistryClient {
  fetchIndex(): Promise<RegistryEntry[]>;
  /** Downloads a .tgz to destPath, verifies SHA-512 against expectedSha512, returns destPath. */
  downloadTarball(url: string, destPath: string, expectedSha512: string): Promise<string>;
}

export interface RegistryClientOptions {
  readonly indexUrl?: string;
  /** Injected for tests; defaults to global fetch. */
  readonly fetchFn?: typeof fetch;
}

function assertIndexPayload(data: unknown): RegistryEntry[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid registry index: expected object');
  }
  const rec = data as Record<string, unknown>;
  if (rec.version !== 1) {
    throw new Error(`Invalid registry index: unsupported version ${String(rec.version)}`);
  }
  if (!Array.isArray(rec.extensions)) {
    throw new Error('Invalid registry index: "extensions" must be an array');
  }
  return rec.extensions as RegistryEntry[];
}

function normalizeSha512Hex(digest: string): string {
  return digest.trim().toLowerCase();
}

async function sha512FileHex(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash('sha512').update(buf).digest('hex');
}

export class RegistryClient implements IRegistryClient {
  private readonly indexUrl: string;
  private readonly fetchFn: typeof fetch;

  private cachedIndex: RegistryEntry[] | null = null;
  private etag: string | undefined;
  private lastModified: string | undefined;

  constructor(options?: RegistryClientOptions) {
    this.indexUrl = options?.indexUrl ?? DEFAULT_INDEX_URL;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async fetchIndex(): Promise<RegistryEntry[]> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.etag) {
      headers['If-None-Match'] = this.etag;
    }
    if (this.lastModified) {
      headers['If-Modified-Since'] = this.lastModified;
    }

    const res = await this.fetchFn(this.indexUrl, { headers });

    if (res.status === 304 && this.cachedIndex) {
      return this.cachedIndex;
    }

    if (!res.ok) {
      throw new Error(`Registry index request failed: ${res.status} ${res.statusText}`);
    }

    const etag = res.headers.get('etag') ?? undefined;
    const lm = res.headers.get('last-modified') ?? undefined;
    if (etag) {
      this.etag = etag;
    }
    if (lm) {
      this.lastModified = lm;
    }

    const json: unknown = await res.json();
    const extensions = assertIndexPayload(json);
    this.cachedIndex = [...extensions];
    return this.cachedIndex;
  }

  async downloadTarball(url: string, destPath: string, expectedSha512: string): Promise<string> {
    const dir = path.dirname(destPath);
    await mkdir(dir, { recursive: true });
    const tmpPath = `${destPath}.part`;

    const res = await this.fetchFn(url);
    if (!res.ok) {
      throw new Error(`Tarball download failed: ${res.status} ${res.statusText}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(tmpPath, buf);

    const actual = normalizeSha512Hex(await sha512FileHex(tmpPath));
    const expected = normalizeSha512Hex(expectedSha512);
    if (actual !== expected) {
      await unlink(tmpPath).catch(() => undefined);
      throw new Error('Tarball SHA-512 mismatch (integrity check failed)');
    }

    await rename(tmpPath, destPath);
    return destPath;
  }
}
