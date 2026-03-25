import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '../config-service';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigService', () => {
  let tmpDir: string;
  let service: ConfigService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tmind-test-'));
    service = new ConfigService(tmpDir);
  });

  it('should return default value for missing key', () => {
    expect(service.get('nonexistent', 'fallback')).toBe('fallback');
  });

  it('should set and persist a value', async () => {
    await service.set('foo', 'bar');
    expect(service.get('foo', '')).toBe('bar');

    const fresh = new ConfigService(tmpDir);
    expect(fresh.get('foo', '')).toBe('bar');
  });

  it('should trigger onChange callback', async () => {
    const handler = vi.fn();
    service.onChange('key1', handler);
    await service.set('key1', 42);
    expect(handler).toHaveBeenCalledWith(42);
  });

  it('should stop calling handler after dispose', async () => {
    const handler = vi.fn();
    const disposable = service.onChange('key2', handler);
    disposable.dispose();
    await service.set('key2', 'ignored');
    expect(handler).not.toHaveBeenCalled();
  });
});
