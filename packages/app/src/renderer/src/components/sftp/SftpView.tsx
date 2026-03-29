import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalDirEntry, SFTPFileEntry } from '@terminalmind/api';
import { useSftpBrowserStore } from '../../stores/sftp-browser-store';
import { useTransferStore } from '../../stores/transfer-store';

const S_IFDIR = 0o040000;
const S_IFMT = 0o170000;

function isDir(entry: SFTPFileEntry): boolean {
  return (entry.attrs.mode & S_IFMT) === S_IFDIR;
}

function joinLocal(dir: string, name: string): string {
  const d = dir.replace(/[/\\]+$/, '');
  const sep = dir.includes('\\') ? '\\' : '/';
  return d ? `${d}${sep}${name}` : name;
}

function joinRemote(dir: string, name: string): string {
  if (dir === '/' || dir === '') return `/${name}`;
  const d = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${d}/${name}`;
}

function parentRemote(p: string): string {
  const t = p.replace(/\/$/, '') || '/';
  if (t === '/') return '/';
  const i = t.lastIndexOf('/');
  return i <= 0 ? '/' : t.slice(0, i);
}

function baseName(p: string): string {
  const n = p.replace(/[/\\]+$/, '');
  const i = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\'));
  return i >= 0 ? n.slice(i + 1) : n;
}

function formatBytes(n: number): string {
  if (n === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function formatDate(mtime: number): string {
  const ms = mtime > 1e12 ? mtime : mtime * 1000;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
}

function fileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return 'folder';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'image';
  if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext)) return 'javascript';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (['json', 'yml', 'yaml', 'toml', 'ini', 'conf'].includes(ext)) return 'settings';
  return 'description';
}

export function SftpView(): React.ReactElement {
  const { t } = useTranslation();
  const effectiveSessionId = useSftpBrowserStore((s) => s.selectedSshSessionId);
  const setStoreSession = useSftpBrowserStore((s) => s.setSelectedSshSessionId);
  const addTask = useTransferStore((s) => s.addTask);

  const [sessions, setSessions] = useState<{ id: string; label: string; status: string }[]>([]);
  const [localDir, setLocalDir] = useState('');
  const [localEntries, setLocalEntries] = useState<LocalDirEntry[]>([]);
  const [remoteDir, setRemoteDir] = useState('/');
  const [remoteEntries, setRemoteEntries] = useState<SFTPFileEntry[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<Set<string>>(new Set());
  const [selectedRemote, setSelectedRemote] = useState<Set<string>>(new Set());
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const startX = e.clientX;
    const containerRect = container.getBoundingClientRect();
    const startRatio = splitRatio;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newRatio = startRatio + delta / containerRect.width;
      setSplitRatio(Math.max(0.2, Math.min(0.8, newRatio)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [splitRatio]);

  const loadSessions = useCallback(async () => {
    const list = await window.api.ssh.listSessions();
    setSessions(list.map((s) => ({
      id: s.id,
      label: `${s.username}@${s.host}:${s.port}`,
      status: s.status,
    })));
    const connected = list.filter((s) => s.status === 'connected');
    if (connected.length > 0 && !effectiveSessionId) {
      setStoreSession(connected[0]!.id);
    }
  }, [effectiveSessionId, setStoreSession]);

  useEffect(() => {
    void loadSessions();
    const off = window.api.ssh.onStatusChange(() => void loadSessions());
    return () => off();
  }, [loadSessions]);

  const loadLocal = useCallback(async () => {
    if (!localDir.trim()) { setLocalEntries([]); return; }
    setLoadingLocal(true);
    setLocalError(null);
    try {
      const entries = await window.api.local.readDirectory(localDir.trim());
      setLocalEntries([...entries].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
      setLocalEntries([]);
    } finally {
      setLoadingLocal(false);
    }
  }, [localDir]);

  useEffect(() => { void loadLocal(); }, [loadLocal]);

  const loadRemote = useCallback(async () => {
    if (!effectiveSessionId) { setRemoteEntries([]); return; }
    setLoadingRemote(true);
    setRemoteError(null);
    try {
      const list = await window.api.sftp.list({ sessionId: effectiveSessionId, remotePath: remoteDir });
      setRemoteEntries([...list].sort((a, b) => {
        const ad = isDir(a);
        const bd = isDir(b);
        if (ad !== bd) return ad ? -1 : 1;
        return a.filename.localeCompare(b.filename);
      }));
    } catch (e) {
      setRemoteError(e instanceof Error ? e.message : String(e));
      setRemoteEntries([]);
    } finally {
      setLoadingRemote(false);
    }
  }, [effectiveSessionId, remoteDir]);

  useEffect(() => { void loadRemote(); }, [loadRemote]);

  const navigateLocalUp = useCallback(() => {
    if (!localDir) return;
    const sep = localDir.includes('\\') ? '\\' : '/';
    const parts = localDir.split(sep).filter(Boolean);
    if (parts.length <= 1) {
      setLocalDir(localDir.includes('\\') ? `${parts[0]}\\` : '/');
    } else {
      parts.pop();
      setLocalDir(localDir.includes('\\') ? parts.join('\\') : `/${parts.join('/')}`);
    }
  }, [localDir]);

  const handleUpload = useCallback(async () => {
    if (!effectiveSessionId || selectedLocal.size === 0) return;
    for (const localPath of selectedLocal) {
      const fn = baseName(localPath);
      const remotePath = joinRemote(remoteDir, fn);
      try {
        const { transferId } = await window.api.sftp.upload({
          sessionId: effectiveSessionId, localPath, remotePath,
        });
        addTask({
          id: transferId, sshSessionId: effectiveSessionId,
          direction: 'upload', localPath, remotePath, filename: fn,
          status: 'queued', progress: 0, bytesTransferred: 0, totalBytes: 0,
        });
      } catch (e) { console.error(e); }
    }
  }, [effectiveSessionId, selectedLocal, remoteDir, addTask]);

  const handleDownload = useCallback(async () => {
    if (!effectiveSessionId || selectedRemote.size === 0 || !localDir.trim()) return;

    const collectRemoteFiles = async (
      remoteDirPath: string,
      baseLocalDir: string,
    ): Promise<{ remotePath: string; localPath: string; filename: string }[]> => {
      const entries = await window.api.sftp.list({ sessionId: effectiveSessionId, remotePath: remoteDirPath });
      const results: { remotePath: string; localPath: string; filename: string }[] = [];
      for (const entry of entries) {
        const childRemote = joinRemote(remoteDirPath, entry.filename);
        const childLocal = joinLocal(baseLocalDir, entry.filename);
        if (isDir(entry)) {
          await window.api.local.mkdir(childLocal);
          const children = await collectRemoteFiles(childRemote, childLocal);
          results.push(...children);
        } else {
          results.push({ remotePath: childRemote, localPath: childLocal, filename: entry.filename });
        }
      }
      return results;
    };

    for (const remotePath of selectedRemote) {
      const entry = remoteEntries.find((e) => joinRemote(remoteDir, e.filename) === remotePath);
      if (!entry) continue;

      if (isDir(entry)) {
        const folderLocalBase = joinLocal(localDir.trim(), entry.filename);
        try {
          await window.api.local.mkdir(folderLocalBase);
          const files = await collectRemoteFiles(remotePath, folderLocalBase);
          for (const file of files) {
            try {
              const { transferId } = await window.api.sftp.download({
                sessionId: effectiveSessionId, localPath: file.localPath, remotePath: file.remotePath,
              });
              addTask({
                id: transferId, sshSessionId: effectiveSessionId,
                direction: 'download', localPath: file.localPath, remotePath: file.remotePath,
                filename: file.filename, status: 'queued', progress: 0, bytesTransferred: 0, totalBytes: 0,
              });
            } catch (e) { console.error('Download failed:', file.remotePath, e); }
          }
        } catch (e) { console.error('Folder download failed:', remotePath, e); }
      } else {
        const fn = baseName(remotePath);
        const localPath = joinLocal(localDir.trim(), fn);
        try {
          const { transferId } = await window.api.sftp.download({
            sessionId: effectiveSessionId, localPath, remotePath,
          });
          addTask({
            id: transferId, sshSessionId: effectiveSessionId,
            direction: 'download', localPath, remotePath, filename: fn,
            status: 'queued', progress: 0, bytesTransferred: 0, totalBytes: 0,
          });
        } catch (e) { console.error(e); }
      }
    }
    void loadLocal();
  }, [effectiveSessionId, selectedRemote, remoteEntries, remoteDir, localDir, addTask, loadLocal]);

  const toggleLocalSelect = useCallback((path: string, ctrlKey: boolean) => {
    setSelectedLocal((prev) => {
      if (ctrlKey) {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      }
      return new Set([path]);
    });
  }, []);

  const toggleRemoteSelect = useCallback((path: string, ctrlKey: boolean) => {
    setSelectedRemote((prev) => {
      if (ctrlKey) {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      }
      return new Set([path]);
    });
  }, []);

  if (!effectiveSessionId) {
    return (
      <div className="sftp-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          <span className="material-symbols-rounded" style={{ fontSize: 48, marginBottom: 16, display: 'block' }}>folder_shared</span>
          <p style={{ fontSize: 14, marginBottom: 8 }}>{t('sftp.noSessionShort')}</p>
          <p style={{ fontSize: 12 }}>{t('sftp.connectHintFull')}</p>
          {sessions.length > 0 && (
            <select
              className="form-select"
              style={{ marginTop: 16, width: 240 }}
              value=""
              onChange={(e) => setStoreSession(e.target.value || null)}
            >
              <option value="">{t('sftp.selectSession')}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id} disabled={s.status !== 'connected'}>
                  {s.label} ({s.status})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="tab-bar">
        <div className="tab active">
          <span className="material-symbols-rounded tab-icon sftp">folder_shared</span>
          <span>
            {t('sftp.tabPrefix')}{' '}
            {sessions.find((s) => s.id === effectiveSessionId)?.label ?? t('sftp.remoteFallback')}
          </span>
          <span className="tab-close">
            <span className="material-symbols-rounded">close</span>
          </span>
        </div>
      </div>
      <div className="sftp-container" ref={containerRef}>
        {/* LOCAL Panel */}
        <div className="sftp-panel" style={{ flex: splitRatio }}>
          <div className="sftp-panel-header">
            <span className="label local">{t('sftp.localLabel')}</span>
            <input
              className="path-display"
              value={localDir}
              onChange={(e) => setLocalDir(e.target.value)}
              placeholder={t('sftp.enterLocalPath')}
              style={{ cursor: 'text' }}
            />
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={navigateLocalUp}
              title={t('sftp.goUp')}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_upward</span>
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => void loadLocal()}
              title={t('common.refresh')}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
            </button>
          </div>
          <div className="file-list">
            {localError && (
              <div style={{ padding: 12, color: 'var(--red)', fontSize: 12 }}>{localError}</div>
            )}
            {loadingLocal && (
              <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 12 }}>{t('common.loading')}</div>
            )}
            {!localDir.trim() && !loadingLocal && (
              <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 12 }}>{t('sftp.enterPathAbove')}</div>
            )}
            {localDir.trim() && (
              <div className="file-row" onDoubleClick={navigateLocalUp}>
                <span className="material-symbols-rounded file-icon folder">folder</span>
                <span className="file-name">..</span>
                <span className="file-size" />
                <span className="file-date" />
              </div>
            )}
            {localEntries.map((entry) => {
              const fullPath = joinLocal(localDir, entry.name);
              return (
                <div
                  key={entry.name}
                  className={`file-row ${selectedLocal.has(fullPath) ? 'selected' : ''}`}
                  onClick={(e) => toggleLocalSelect(fullPath, e.ctrlKey)}
                  onDoubleClick={() => {
                    if (entry.isDirectory) setLocalDir(fullPath);
                  }}
                >
                  <span className={`material-symbols-rounded file-icon ${entry.isDirectory ? 'folder' : 'file'}`}>
                    {fileIcon(entry.name, entry.isDirectory)}
                  </span>
                  <span className="file-name">{entry.name}</span>
                  <span className="file-size">{entry.isDirectory ? '—' : formatBytes(entry.size)}</span>
                  <span className="file-date" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Transfer buttons + resize handle */}
        <div className="sftp-transfer-buttons">
          <button
            className="btn btn-primary"
            style={{ padding: '6px 10px', fontSize: 11 }}
            title={t('sftp.uploadSelected')}
            onClick={() => void handleUpload()}
            disabled={selectedLocal.size === 0}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_forward</span>
          </button>
          <div
            className="sftp-resize-handle"
            onMouseDown={handleSplitDragStart}
          />
          <button
            className="btn btn-ghost"
            style={{ padding: '6px 10px', fontSize: 11 }}
            title={t('sftp.downloadSelected')}
            onClick={() => void handleDownload()}
            disabled={selectedRemote.size === 0}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_back</span>
          </button>
        </div>

        {/* REMOTE Panel */}
        <div className="sftp-panel" style={{ flex: 1 - splitRatio }}>
          <div className="sftp-panel-header">
            <span className="label remote">{t('sftp.remoteLabel')}</span>
            <div className="path-display">{remoteDir}</div>
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => setRemoteDir(parentRemote(remoteDir))}
              title={t('sftp.goUp')}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_upward</span>
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => void loadRemote()}
              title={t('common.refresh')}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
            </button>
          </div>
          <div className="file-list">
            {remoteError && (
              <div style={{ padding: 12, color: 'var(--red)', fontSize: 12 }}>{remoteError}</div>
            )}
            {loadingRemote && (
              <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 12 }}>{t('common.loading')}</div>
            )}
            <div
              className="file-row"
              onDoubleClick={() => setRemoteDir(parentRemote(remoteDir))}
            >
              <span className="material-symbols-rounded file-icon folder">folder</span>
              <span className="file-name">..</span>
              <span className="file-size" />
              <span className="file-date" />
            </div>
            {remoteEntries.map((entry) => {
              const fullPath = joinRemote(remoteDir, entry.filename);
              const dir = isDir(entry);
              return (
                <div
                  key={entry.filename}
                  className={`file-row ${selectedRemote.has(fullPath) ? 'selected' : ''}`}
                  onClick={(e) => toggleRemoteSelect(fullPath, e.ctrlKey)}
                  onDoubleClick={() => {
                    if (dir) setRemoteDir(fullPath);
                  }}
                >
                  <span className={`material-symbols-rounded file-icon ${dir ? 'folder' : 'file'}`}>
                    {fileIcon(entry.filename, dir)}
                  </span>
                  <span className="file-name">{entry.filename}</span>
                  <span className="file-size">{dir ? '—' : formatBytes(entry.attrs.size)}</span>
                  <span className="file-date">{formatDate(entry.attrs.mtime)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Transfer status bar */}
      <TransferStatusBar />
    </div>
  );
}

function TransferStatusBar(): React.ReactElement | null {
  const { t } = useTranslation();
  const tasks = useTransferStore((s) => s.tasks);
  const activeTasks = tasks.filter((task) => task.status === 'queued' || task.status === 'transferring');

  if (activeTasks.length === 0) return null;

  const totalProgress = activeTasks.length > 0
    ? activeTasks.reduce((sum, task) => sum + task.progress, 0) / activeTasks.length
    : 0;

  const totalBytes = activeTasks.reduce((sum, task) => sum + task.bytesTransferred, 0);
  const speed = totalBytes > 0 ? formatTransferBytes(totalBytes) : '';

  return (
    <div className="sftp-transfer-bar">
      <span className="material-symbols-rounded" style={{ fontSize: 14, color: 'var(--accent)' }}>cloud_upload</span>
      <span style={{ color: 'var(--text-secondary)' }}>
        {activeTasks.length === 1
          ? t('sftp.transferringOne')
          : t('sftp.transferringMany', { count: activeTasks.length })}
      </span>
      <div className="progress-bar">
        <div className="fill" style={{ width: `${Math.round(totalProgress)}%` }} />
      </div>
      <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {Math.round(totalProgress)}%{speed ? ` · ${speed}/s` : ''}
      </span>
    </div>
  );
}

function formatTransferBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
