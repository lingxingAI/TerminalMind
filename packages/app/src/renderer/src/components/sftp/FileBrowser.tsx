import React, { useCallback, useEffect, useState } from 'react';
import type { LocalDirEntry, SFTPFileEntry } from '@terminalmind/api';
import { FileTree } from './FileTree';
import { useSftpBrowserStore } from '../../stores/sftp-browser-store';
import { useTransferStore } from '../../stores/transfer-store';

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
    if (!effectiveSessionId || !selectedRemotePath || !selectedRemoteEntry || entryIsDir(selectedRemoteEntry)) {
      return;
    }
    if (!localDir.trim()) {
      window.alert('Set a local directory path first.');
      return;
    }
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
  }, [effectiveSessionId, selectedRemotePath, selectedRemoteEntry, localDir, addTask, loadLocal]);

  const handleNewRemoteFolder = useCallback(async () => {
    if (!effectiveSessionId) {
      return;
    }
    const name = window.prompt('New folder name');
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
  }, [effectiveSessionId, remoteTargetDir, bumpRefresh]);

  const crumbs =
    remoteRoot === '/' || remoteRoot === ''
      ? ['']
      : ['', ...remoteRoot.replace(/^\/+/, '').split('/').filter(Boolean)];

  if (!effectiveSessionId) {
    return (
      <div className="sftp-file-browser sftp-browser-empty">
        <p>No SSH session selected.</p>
        <p className="sftp-browser-hint">Connect via SSH, then pick a session:</p>
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
        <div className="sftp-breadcrumbs" aria-label="Remote path">
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
        <button type="button" className="sftp-toolbar-btn" onClick={bumpRefresh}>
          Refresh
        </button>
        <button type="button" className="sftp-toolbar-btn" onClick={handleUpload} disabled={!selectedLocal}>
          Upload
        </button>
        <button
          type="button"
          className="sftp-toolbar-btn"
          onClick={handleDownload}
          disabled={!selectedRemotePath || !selectedRemoteEntry || entryIsDir(selectedRemoteEntry)}
        >
          Download
        </button>
        <button type="button" className="sftp-toolbar-btn" onClick={handleNewRemoteFolder}>
          New folder
        </button>
      </div>
      <div className="sftp-dual-panel">
        <div className="sftp-local-panel">
          <div className="sftp-panel-head">Local</div>
          <div className="sftp-path-row">
            <input
              className="sftp-path-input"
              value={localDir}
              onChange={(e) => setLocalDir(e.target.value)}
              placeholder="Absolute path (e.g. C:\Users\me\Downloads)"
            />
            <button type="button" className="sftp-toolbar-btn sftp-small" onClick={() => void loadLocal()}>
              Go
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
        <div className="sftp-remote-panel">
          <div className="sftp-panel-head">Remote</div>
          <FileTree
            sshSessionId={effectiveSessionId}
            rootPath={remoteRoot}
            onFileSelect={onRemoteSelect}
            refreshToken={refreshToken}
          />
        </div>
      </div>
    </div>
  );
}

function entryIsDir(entry: SFTPFileEntry): boolean {
  const mode = entry.attrs.mode;
  const S_IFDIR = 0o040000;
  const S_IFMT = 0o170000;
  return (mode & S_IFMT) === S_IFDIR;
}
