import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { constants } from 'fs';
import type { SFTPWrapper, Stats } from 'ssh2';
import { SFTPChannel, toFileStat } from '../sftp-channel';

function makeStats(overrides: Partial<Stats> = {}): Stats {
  const mode = constants.S_IFREG | 0o644;
  return {
    mode,
    uid: 1000,
    gid: 1000,
    size: 42,
    atime: 1,
    mtime: 2,
    isDirectory: () => false,
    isFile: () => true,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    ...overrides,
  };
}

describe('toFileStat', () => {
  it('maps Stats from ssh2', () => {
    const st = makeStats({ size: 10 });
    const fs = toFileStat(st);
    expect(fs).toMatchObject({
      size: 10,
      mode: st.mode,
      uid: 1000,
      gid: 1000,
      atime: 1,
      mtime: 2,
      isDirectory: false,
      isFile: true,
      isSymbolicLink: false,
    });
  });

  it('maps plain Attributes using mode bits', () => {
    const fs = toFileStat({
      mode: constants.S_IFDIR | 0o755,
      uid: 0,
      gid: 0,
      size: 4096,
      atime: 3,
      mtime: 4,
    });
    expect(fs.isDirectory).toBe(true);
    expect(fs.isFile).toBe(false);
    expect(fs.isSymbolicLink).toBe(false);
  });
});

describe('SFTPChannel', () => {
  let mockSftp: {
    readdir: ReturnType<typeof vi.fn>;
    stat: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
    rmdir: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    fastPut: ReturnType<typeof vi.fn>;
    fastGet: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  let channel: SFTPChannel;

  beforeEach(() => {
    mockSftp = {
      readdir: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn(),
      rmdir: vi.fn(),
      unlink: vi.fn(),
      rename: vi.fn(),
      fastPut: vi.fn(),
      fastGet: vi.fn(),
      end: vi.fn(),
    };
    channel = new SFTPChannel('sess-1', mockSftp as unknown as SFTPWrapper);
  });

  afterEach(() => {
    channel.close();
  });

  it('list() maps readdir to FileEntry array', async () => {
    const attrs = makeStats({ size: 5 });
    mockSftp.readdir.mockImplementation((_path: string, cb: (err: Error | undefined, list?: unknown) => void) => {
      cb(undefined, [
        { filename: 'a.txt', longname: '-rw-r--r-- 1 u g 5 a.txt', attrs },
      ]);
    });

    const entries = await channel.list('/remote');
    expect(mockSftp.readdir).toHaveBeenCalledWith('/remote', expect.any(Function));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      filename: 'a.txt',
      longname: '-rw-r--r-- 1 u g 5 a.txt',
      attrs: expect.objectContaining({ size: 5, isFile: true }),
    });
  });

  it('stat() returns FileStat', async () => {
    const st = makeStats({ size: 99 });
    mockSftp.stat.mockImplementation((_path: string, cb: (err: Error | undefined, stats?: Stats) => void) => {
      cb(undefined, st);
    });

    const fs = await channel.stat('/remote/f');
    expect(fs.size).toBe(99);
    expect(fs.isFile).toBe(true);
  });

  it('mkdir / rmdir / unlink / rename call sftp', async () => {
    mockSftp.mkdir.mockImplementation((_p: string, cb: (err?: Error | null) => void) => cb());
    mockSftp.rmdir.mockImplementation((_p: string, cb: (err?: Error | null) => void) => cb());
    mockSftp.unlink.mockImplementation((_p: string, cb: (err?: Error | null) => void) => cb());
    mockSftp.rename.mockImplementation((_a: string, _b: string, cb: (err?: Error | null) => void) => cb());

    await channel.mkdir('/d');
    await channel.rmdir('/d');
    await channel.unlink('/f');
    await channel.rename('/a', '/b');

    expect(mockSftp.mkdir).toHaveBeenCalledWith('/d', expect.any(Function));
    expect(mockSftp.rmdir).toHaveBeenCalledWith('/d', expect.any(Function));
    expect(mockSftp.unlink).toHaveBeenCalledWith('/f', expect.any(Function));
    expect(mockSftp.rename).toHaveBeenCalledWith('/a', '/b', expect.any(Function));
  });

  it('upload() uses fastPut and emits progress', async () => {
    const st = makeStats({ size: 1000 });
    mockSftp.fastPut.mockImplementation(
      (
        localPath: string,
        remotePath: string,
        opts: { step?: (total: number, nb: number, fsize: number) => void },
        cb: (err?: Error | null) => void,
      ) => {
        expect(localPath).toBe('C:\\local\\f.bin');
        expect(remotePath).toBe('/remote/f.bin');
        opts.step?.(500, 500, 1000);
        opts.step?.(1000, 500, 1000);
        cb();
      },
    );
    mockSftp.stat.mockImplementation((path: string, cb: (err: Error | undefined, stats?: Stats) => void) => {
      expect(path).toBe('/remote/f.bin');
      cb(undefined, st);
    });

    const progress = vi.fn();
    channel.onProgress(progress);

    const result = await channel.upload('C:\\local\\f.bin', '/remote/f.bin');
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(1000);
    expect(progress).toHaveBeenCalled();
    const first = progress.mock.calls[0][0];
    expect(first.direction).toBe('upload');
    expect(first.bytesTransferred).toBe(500);
    expect(first.totalBytes).toBe(1000);
    expect(first.percentage).toBe(50);
  });

  it('download() uses fastGet and emits progress', async () => {
    const st = makeStats({ size: 200 });
    mockSftp.fastGet.mockImplementation(
      (
        _remotePath: string,
        _localPath: string,
        opts: { step?: (total: number, nb: number, fsize: number) => void },
        cb: (err?: Error | null) => void,
      ) => {
        opts.step?.(200, 200, 200);
        cb();
      },
    );
    mockSftp.stat.mockImplementation((_path: string, cb: (err: Error | undefined, stats?: Stats) => void) => {
      cb(undefined, st);
    });

    const progress = vi.fn();
    channel.onProgress(progress);

    const result = await channel.download('/remote/x', 'C:\\local\\x');
    expect(result.success).toBe(true);
    expect(result.bytesTransferred).toBe(200);
    expect(progress.mock.calls[0][0].direction).toBe('download');
  });

  it('close() ends sftp and rejects further ops', async () => {
    channel.close();
    expect(mockSftp.end).toHaveBeenCalled();
    await expect(channel.stat('/x')).rejects.toThrow('closed');
  });
});
