import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalDirEntry, SFTPFileEntry } from '@terminalmind/api';
import { FileTree } from './FileTree';
import { useSftpBrowserStore } from '../../stores/sftp-browser-store';
import { useTransferStore } from '../../stores/transfer-store';
import { useTransferIpcSync } from '../../hooks/useTransferIpcSync';

function joinLocal(dir: string, name: string): string {
  const d = dir.replace(/[/\\]+$/, '');
  const sep = dir.includes('\\') ? '\\' : '/';
  return d ? `${d}${sep}${name}` : name;
}

function baseName(p: string): string {
  const n = p.replace(/[/\\]+$/, '');
  const i = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\'));
  return i >= 0 ? n.slice(i + 1) : n;
}

function parentRemote(remotePath: string): string {
  const t = remotePath.replace(/\/$/, '') || '/';
  if (t === '/') {
    return '/';
  }
  const i = t.lastIndexOf('/');
  return i <= 0 ? '/' : t.slice(0, i);
}

function joinRemoteDir(dir: string, name: string): string {
  if (dir === '/' || dir === '') {
    return `/${name}`;
  }
  const d = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${d}/${name}`;
}

function formatBytes(n: number): string {
  if (n === 0) {
    return '0 B';
  }
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export interface FileBrowserProps {
  readonly sshSessionId?: string | null;
}

export function FileBrowser({ sshSessionId: sshSessionIdProp }: FileBrowserProps): React.ReactElement {
  const { t } = useTranslation();
  const storeSession = useSftpBrowserStore((s) => s.selectedSshSessionId);
  const setStoreSession = useSftpBrowserStore((s) => s.setSelectedSshSessionId);

  const [sessions, setSessions] = useState<{ id: string; label: string; status: string }[]>([]);
  const [localDir, setLocalDir] = useState('');
  const [localEntries, setLocalEntries] = useState<LocalDirEntry[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<string | null>(null);
  const [remoteRoot, setRemoteRoot] = useState('/');
  const [selectedRemotePath, setSelectedRemotePath] = useState<string | null>(null);
  const [selectedRemoteEntry, setSelectedRemoteEntry] = useState<SFTPFileEntry | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const addTask = useTransferStore((s) => s.addTask);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const dualPanelRef = useRef<HTMLDivElement>(null);

  const handleSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = dualPanelRef.current;
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

  useTransferIpcSync();
  const transferTasks = useTransferStore((s) => s.tasks);
  const activeTasks = transferTasks.filter(
    (t) => t.status === 'queued' || t.status === 'transferring',
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const completedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const justFinished = transferTasks.filter((t) => t.status === 'completed');
    if (justFinished.length > 0 && activeTasks.length === 0) {
      setShowCompleted(true);
      if (completedRef.current) clearTimeout(completedRef.current);
      completedRef.current = setTimeout(() => setShowCompleted(false), 2000);
    }
    if (activeTasks.length > 0) {
      setShowCompleted(false);
      if (completedRef.current) clearTimeout(completedRef.current);
    }
  }, [activeTasks.length, transferTasks]);

  const effectiveSessionId = sshSessionIdProp ?? storeSession;

  const loadSessions = useCallback(async () => {
    const list = await window.api.ssh.listSessions();
    setSessions(
      list.map((s) => ({
        id: s.id,
        label: `${s.username}@${s.host}:${s.port}`,
        status: s.status,
      })),
    );
    const connected = list.filter((s) => s.status === 'connected');
    if (connected.length > 0 && !storeSession && sshSessionIdProp === undefined) {
      setStoreSession(connected[0]!.id);
    }
  }, [sshSessionIdProp, storeSession, setStoreSession]);

  useEffect(() => {
    void loadSessions();
    const off = window.api.ssh.onStatusChange(() => {
      void loadSessions();
    });
    return () => off();
  }, [loadSessions]);

  const loadLocal = useCallback(async () => {
    if (!localDir.trim()) {
      setLocalEntries([]);
      return;
    }
    setLocalError(null);
    try {
      const entries = await window.api.local.readDirectory(localDir.trim());
      setLocalEntries([...entries]);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
      setLocalEntries([]);
    }
  }, [localDir]);

  useEffect(() => {
    void loadLocal();
  }, [localDir, loadLocal]);

  const onRemoteSelect = useCallback((remotePath: string, entry: SFTPFileEntry) => {
    setSelectedRemotePath(remotePath);
    setSelectedRemoteEntry(entry);
  }, []);

  const remoteTargetDir = selectedRemoteEntry
    ? (entryIsDir(selectedRemoteEntry)
        ? selectedRemotePath!
        : parentRemote(selectedRemotePath!))
    : remoteRoot;

  const bumpRefresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const handleUpload = useCallback(async () => {
    if (!effectiveSessionId || !selectedLocal) {
      return;
    }
    const fn = baseName(selectedLocal);
    const remotePath = joinRemoteDir(remoteTargetDir, fn);
    try {
      const { transferId } = await window.api.sftp.upload({
        sessionId: effectiveSessionId,
        localPath: selectedLocal,
        remotePath,
      });
      addTask({
        id: transferId,
        sshSessionId: effectiveSessionId,
        direction: 'upload',
        localPath: selectedLocal,
        remotePath,
        filename: fn,
        status: 'queued',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: 0,
      });
    } catch (e) {
      console.error(e);
    }
  }, [effectiveSessionId, selectedLocal, remoteTargetDir, addTask]);

  const handleDownload = useCallback(async () => {
    if (!effectiveSessionId || !selectedRemotePath || !selectedRemoteEntry) {
      return;
    }
    if (!localDir.trim()) {
      window.alert(t('sftp.setLocalPath'));
      return;
    }

    if (entryIsDir(selectedRemoteEntry)) {
      const folderName = baseName(selectedRemotePath);
      const localBase = joinLocal(localDir.trim(), folderName);

      const collectFiles = async (
        remoteDirPath: string,
        localDirPath: string,
      ): Promise<{ remotePath: string; localPath: string; filename: string }[]> => {
        const entries = await window.api.sftp.list({
          sessionId: effectiveSessionId,
          remotePath: remoteDirPath,
        });
        const results: { remotePath: string; localPath: string; filename: string }[] = [];
        for (const entry of entries) {
          const childRemote = joinRemoteDir(remoteDirPath, entry.filename);
          const childLocal = joinLocal(localDirPath, entry.filename);
          if (entryIsDir(entry)) {
            await window.api.local.mkdir(childLocal);
            const children = await collectFiles(childRemote, childLocal);
            results.push(...children);
          } else {
            results.push({ remotePath: childRemote, localPath: childLocal, filename: entry.filename });
          }
        }
        return results;
      };

      try {
        await window.api.local.mkdir(localBase);
        const files = await collectFiles(selectedRemotePath, localBase);
        for (const file of files) {
          try {
            const { transferId } = await window.api.sftp.download({
              sessionId: effectiveSessionId,
              localPath: file.localPath,
              remotePath: file.remotePath,
            });
            addTask({
              id: transferId,
              sshSessionId: effectiveSessionId,
              direction: 'download',
              localPath: file.localPath,
              remotePath: file.remotePath,
              filename: file.filename,
              status: 'queued',
              progress: 0,
              bytesTransferred: 0,
              totalBytes: 0,
            });
          } catch (e) {
            console.error('Download failed:', file.remotePath, e);
          }
        }
        void loadLocal();
      } catch (e) {
        console.error('Folder download failed:', e);
      }
    } else {
      const fn = baseName(selectedRemotePath);
      const localPath = joinLocal(localDir.trim(), fn);
      try {
        const { transferId } = await window.api.sftp.download({
          sessionId: effectiveSessionId,
          localPath,
          remotePath: selectedRemotePath,
        });
        addTask({
          id: transferId,
          sshSessionId: effectiveSessionId,
          direction: 'download',
          localPath,
          remotePath: selectedRemotePath,
          filename: fn,
          status: 'queued',
          progress: 0,
          bytesTransferred: 0,
          totalBytes: 0,
        });
        void loadLocal();
      } catch (e) {
        console.error(e);
      }
    }
  }, [effectiveSessionId, selectedRemotePath, selectedRemoteEntry, localDir, addTask, loadLocal, t]);

  const handleNewRemoteFolder = useCallback(async () => {
    if (!effectiveSessionId) {
      return;
    }
    const name = window.prompt(t('sftp.newFolderPrompt'));
    if (!name) {
      return;
    }
    const target = joinRemoteDir(remoteTargetDir, name);
    try {
      await window.api.sftp.mkdir({ sessionId: effectiveSessionId, remotePath: target });
      bumpRefresh();
    } catch (e) {
      console.error(e);
    }
  }, [effectiveSessionId, remoteTargetDir, bumpRefresh, t]);

  const crumbs =
    remoteRoot === '/' || remoteRoot === ''
      ? ['']
      : ['', ...remoteRoot.replace(/^\/+/, '').split('/').filter(Boolean)];

  if (!effectiveSessionId) {
    return (
      <div className="sftp-file-browser sftp-browser-empty">
        <p>{t('sftp.noSession')}</p>
        <p className="sftp-browser-hint">{t('sftp.connectHint')}</p>
        <select
          className="sftp-session-select"
          value=""
          onChange={(e) => setStoreSession(e.target.value || null)}
        >
          <option value="">—</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id} disabled={s.status !== 'connected'}>
              {s.label} ({s.status})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="sftp-file-browser">
      <div className="sftp-browser-toolbar">
        <select
          className="sftp-session-select"
          value={effectiveSessionId}
          onChange={(e) => setStoreSession(e.target.value || null)}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id} disabled={s.status !== 'connected'}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="sftp-breadcrumbs" aria-label={t('sftp.remotePathAria')}>
          {crumbs.map((seg, i) => (
            <React.Fragment key={`${i}-${seg || 'root'}`}>
              {i > 0 && <span className="sftp-crumb-sep">/</span>}
              <button
                type="button"
                className="sftp-crumb"
                onClick={() => {
                  const path = i === 0 ? '/' : `/${crumbs.slice(1, i + 1).join('/')}`;
                  setRemoteRoot(path);
                }}
              >
                {seg || '/'}
              </button>
            </React.Fragment>
          ))}
        </div>
        <button
          type="button"
          className="sftp-toolbar-btn"
          onClick={() => setRemoteRoot(parentRemote(remoteRoot))}
          disabled={remoteRoot === '/'}
          title={t('sftp.parentDir')}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_upward</span>
        </button>
        <button type="button" className="sftp-toolbar-btn" onClick={bumpRefresh} title={t('common.refresh')}>
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
        </button>
        <button type="button" className="sftp-toolbar-btn" onClick={handleUpload} disabled={!selectedLocal}>
          {t('sftp.upload')}
        </button>
        <button
          type="button"
          className="sftp-toolbar-btn"
          onClick={handleDownload}
          disabled={!selectedRemotePath || !selectedRemoteEntry}
        >
          {t('sftp.download')}
        </button>
        <button type="button" className="sftp-toolbar-btn" onClick={handleNewRemoteFolder}>
          {t('sftp.newFolder')}
        </button>
      </div>
      <div className="sftp-dual-panel" ref={dualPanelRef}>
        <div className="sftp-local-panel" style={{ flex: splitRatio }}>
          <div className="sftp-panel-head">{t('common.local')}</div>
          <div className="sftp-path-row">
            <input
              className="sftp-path-input"
              value={localDir}
              onChange={(e) => setLocalDir(e.target.value)}
              placeholder={t('sftp.localPathPlaceholder')}
            />
            <button type="button" className="sftp-toolbar-btn sftp-small" onClick={() => void loadLocal()}>
              {t('sftp.go')}
            </button>
          </div>
          {localError && <div className="sftp-tree-error">{localError}</div>}
          <div className="sftp-local-list">
            {localEntries.map((e) => (
              <div
                key={e.name}
                role="button"
                tabIndex={0}
                className={`sftp-local-row ${selectedLocal === joinLocal(localDir, e.name) ? 'selected' : ''}`}
                onClick={() => setSelectedLocal(joinLocal(localDir, e.name))}
                onDoubleClick={() => {
                  if (e.isDirectory) {
                    setLocalDir(joinLocal(localDir, e.name));
                  }
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') {
                    setSelectedLocal(joinLocal(localDir, e.name));
                  }
                }}
              >
                <span>{e.isDirectory ? '📁' : '📄'}</span>
                <span className="sftp-local-name">{e.name}</span>
                {!e.isDirectory && <span className="sftp-local-meta">{formatBytes(e.size)}</span>}
              </div>
            ))}
          </div>
        </div>
        <div
          className="sftp-resize-handle"
          onMouseDown={handleSplitDragStart}
        />
        <div className="sftp-remote-panel" style={{ flex: 1 - splitRatio }}>
          <div className="sftp-panel-head">{t('common.remote')}</div>
          <FileTree
            sshSessionId={effectiveSessionId}
            rootPath={remoteRoot}
            onFileSelect={onRemoteSelect}
            refreshToken={refreshToken}
          />
        </div>
      </div>
      {(activeTasks.length > 0 || showCompleted) && (
        <div className="sftp-download-progress">
          {activeTasks.length > 0 ? (
            activeTasks.map((task) => (
              <div key={task.id} className="sftp-dp-item">
                <span className="sftp-dp-icon">{task.direction === 'upload' ? '↑' : '↓'}</span>
                <span className="sftp-dp-name" title={task.remotePath || task.localPath}>{task.filename}</span>
                <div className="sftp-dp-bar-wrap">
                  <div className="sftp-dp-bar" style={{ width: `${Math.min(100, task.progress)}%` }} />
                </div>
                <span className="sftp-dp-pct">{Math.round(task.progress)}%</span>
              </div>
            ))
          ) : (
            <div className="sftp-dp-item sftp-dp-done">
              <span className="sftp-dp-icon">✓</span>
              <span className="sftp-dp-name">{t('sftp.transferComplete')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function entryIsDir(entry: SFTPFileEntry): boolean {
  const mode = entry.attrs.mode;
  const S_IFDIR = 0o040000;
  const S_IFMT = 0o170000;
  return (mode & S_IFMT) === S_IFDIR;
}
