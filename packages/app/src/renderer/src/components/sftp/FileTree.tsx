import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SFTPFileEntry } from '@terminalmind/api';

const S_IFDIR = 0o040000;
const S_IFMT = 0o170000;

function isDirectory(attrs: SFTPFileEntry['attrs']): boolean {
  return (attrs.mode & S_IFMT) === S_IFDIR;
}

function joinRemote(dir: string, name: string): string {
  if (dir === '/' || dir === '') {
    return `/${name}`;
  }
  const d = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${d}/${name}`;
}

function parentPath(remotePath: string): string {
  const trimmed = remotePath.replace(/\/$/, '') || '/';
  if (trimmed === '/') {
    return '/';
  }
  const i = trimmed.lastIndexOf('/');
  return i <= 0 ? '/' : trimmed.slice(0, i);
}

/** Directory that CRUD / upload should apply to from the current context menu target. */
function contextTargetDir(
  menu: { path?: string; entry?: SFTPFileEntry } | null,
  rootPath: string,
): string {
  if (!menu || !menu.entry || !menu.path) {
    return rootPath === '/' ? '/' : rootPath;
  }
  if (isDirectory(menu.entry.attrs)) {
    return menu.path;
  }
  return parentPath(menu.path);
}

function shSingleQuoteRemote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

function formatBytes(n: number): string {
  if (n === 0) {
    return '0 B';
  }
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function formatMtime(mtime: number): string {
  const ms = mtime > 1e12 ? mtime : mtime * 1000;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms));
}

export interface FileTreeProps {
  readonly sshSessionId: string;
  readonly rootPath?: string;
  readonly onFileSelect?: (remotePath: string, entry: SFTPFileEntry) => void;
  readonly refreshToken?: number;
}

interface RowProps {
  readonly sshSessionId: string;
  readonly path: string;
  readonly entry: SFTPFileEntry;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly loadedChildren: ReadonlyMap<string, SFTPFileEntry[]>;
  readonly loadingPaths: ReadonlySet<string>;
  readonly onToggle: (path: string) => void;
  readonly onSelect: (path: string, entry: SFTPFileEntry) => void;
  readonly onRowDoubleClick: (path: string, entry: SFTPFileEntry) => void;
  readonly onContextMenu: (e: React.MouseEvent, path: string, entry: SFTPFileEntry) => void;
}

function TreeRow(props: RowProps): React.ReactElement {
  const {
    path,
    entry,
    depth,
    expanded,
    selectedPath,
    loadedChildren,
    loadingPaths,
    onToggle,
    onSelect,
    onRowDoubleClick,
    onContextMenu,
  } = props;

  const isDir = isDirectory(entry.attrs);
  const isExpanded = expanded.has(path);
  const children = loadedChildren.get(path);
  const loading = loadingPaths.has(path);
  const selected = selectedPath === path;

  return (
    <>
      <div
        role="row"
        className={`sftp-tree-row ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(path, entry)}
        onDoubleClick={() => onRowDoubleClick(path, entry)}
        onContextMenu={(e) => onContextMenu(e, path, entry)}
      >
        {isDir ? (
          <button
            type="button"
            className="sftp-tree-chevron"
            aria-expanded={isExpanded}
            onClick={(e) => {
              e.stopPropagation();
              void onToggle(path);
            }}
          >
            {loading ? '…' : isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="sftp-tree-chevron-spacer" />
        )}
        <span className="sftp-tree-icon">{isDir ? '📁' : '📄'}</span>
        <span className="sftp-tree-name">{entry.filename}</span>
        {!isDir && (
          <>
            <span className="sftp-tree-size">{formatBytes(entry.attrs.size)}</span>
            <span className="sftp-tree-mtime">{formatMtime(entry.attrs.mtime)}</span>
          </>
        )}
      </div>
      {isDir && isExpanded && children !== undefined
        ? children.map((ch) => {
            const childPath = joinRemote(path, ch.filename);
            return (
              <TreeRow
                key={childPath}
                sshSessionId={props.sshSessionId}
                path={childPath}
                entry={ch}
                depth={depth + 1}
                expanded={expanded}
                selectedPath={selectedPath}
                loadedChildren={loadedChildren}
                loadingPaths={loadingPaths}
                onToggle={onToggle}
                onSelect={onSelect}
                onRowDoubleClick={onRowDoubleClick}
                onContextMenu={onContextMenu}
              />
            );
          })
        : null}
    </>
  );
}

export function FileTree({
  sshSessionId,
  rootPath = '/',
  onFileSelect,
  refreshToken = 0,
}: FileTreeProps): React.ReactElement {
  const { t } = useTranslation();
  const [rootEntries, setRootEntries] = useState<SFTPFileEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadedChildren, setLoadedChildren] = useState<Map<string, SFTPFileEntry[]>>(() => new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    path?: string;
    entry?: SFTPFileEntry;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);
  const [promptState, setPromptState] = useState<{
    label: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const showInlinePrompt = useCallback(
    (label: string, defaultValue = ''): Promise<string | null> =>
      new Promise((resolve) => {
        setPromptState({ label, defaultValue, resolve });
      }),
    [],
  );
  const handlePromptSubmit = useCallback(() => {
    if (!promptState) return;
    const value = promptInputRef.current?.value?.trim() ?? '';
    promptState.resolve(value || null);
    setPromptState(null);
  }, [promptState]);
  const handlePromptCancel = useCallback(() => {
    if (!promptState) return;
    promptState.resolve(null);
    setPromptState(null);
  }, [promptState]);

  const menuRef = useRef<HTMLDivElement>(null);

  const loadDir = useCallback(
    async (path: string): Promise<SFTPFileEntry[]> => {
      setLoadingPaths((s) => new Set(s).add(path));
      setLoadError(null);
      try {
        const list = await window.api.sftp.list({ sessionId: sshSessionId, remotePath: path });
        const sorted = [...list].sort((a, b) => {
          const ad = isDirectory(a.attrs);
          const bd = isDirectory(b.attrs);
          if (ad !== bd) {
            return ad ? -1 : 1;
          }
          return a.filename.localeCompare(b.filename);
        });
        setLoadedChildren((m) => new Map(m).set(path, sorted));
        return sorted;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        return [];
      } finally {
        setLoadingPaths((s) => {
          const n = new Set(s);
          n.delete(path);
          return n;
        });
      }
    },
    [sshSessionId],
  );

  const refreshParent = useCallback(
    async (childPath: string) => {
      const parent = parentPath(childPath);
      await loadDir(parent);
      if (parent === rootPath) {
        const fresh = await window.api.sftp.list({ sessionId: sshSessionId, remotePath: rootPath });
        const sorted = [...fresh].sort((a, b) =>
          isDirectory(a.attrs) === isDirectory(b.attrs)
            ? a.filename.localeCompare(b.filename)
            : isDirectory(a.attrs)
              ? -1
              : 1,
        );
        setRootEntries(sorted);
        setLoadedChildren((m) => new Map(m).set(rootPath, sorted));
      }
    },
    [loadDir, rootPath, sshSessionId],
  );

  useEffect(() => {
    void (async () => {
      const list = await loadDir(rootPath);
      setRootEntries(list);
      setExpanded(new Set());
      setSelectedPath(null);
    })();
  }, [sshSessionId, rootPath, refreshToken, loadDir]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    if (menu) {
      document.addEventListener('mousedown', onDown);
    }
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const onToggle = useCallback(
    async (path: string) => {
      let shouldLoad = false;
      setExpanded((prev) => {
        const n = new Set(prev);
        const expanding = !n.has(path);
        if (expanding) {
          n.add(path);
          shouldLoad = !loadedChildren.has(path);
        } else {
          n.delete(path);
        }
        return n;
      });
      if (shouldLoad) {
        await loadDir(path);
      }
    },
    [loadDir, loadedChildren],
  );

  const onSelect = useCallback(
    (path: string, entry: SFTPFileEntry) => {
      setSelectedPath(path);
      onFileSelect?.(path, entry);
    },
    [onFileSelect],
  );

  const onRowDoubleClick = useCallback(
    async (path: string, entry: SFTPFileEntry) => {
      if (isDirectory(entry.attrs)) {
        await onToggle(path);
      } else {
        setSelectedPath(path);
        onFileSelect?.(path, entry);
      }
    },
    [onToggle, onFileSelect],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const onContextMenu = useCallback((e: React.MouseEvent, path: string, entry: SFTPFileEntry) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, path, entry });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!menu || !menu.entry || !menu.path || isDirectory(menu.entry.attrs)) {
      return;
    }
    const localPath = await window.api.dialog.saveFile(menu.entry.filename);
    if (!localPath) {
      closeMenu();
      return;
    }
    try {
      await window.api.sftp.download({
        sessionId: sshSessionId,
        localPath,
        remotePath: menu.path,
      });
      showToast(t('sftp.fileTree.downloadSuccess', { name: menu.entry.filename }));
    } catch (err) {
      console.error('Download failed:', err);
    }
    if (menu.path && menu.entry) onFileSelect?.(menu.path, menu.entry);
    closeMenu();
  }, [menu, sshSessionId, onFileSelect, closeMenu, showToast, t]);

  const handleDelete = useCallback(async () => {
    if (!menu || !menu.entry || !menu.path) {
      return;
    }
    const { path, entry } = menu;
    const isDir = isDirectory(entry.attrs);
    const msg = isDir
      ? t('sftp.fileTree.confirmDeleteFolder', { name: entry.filename })
      : t('sftp.fileTree.confirmDeleteFile', { name: entry.filename });
    if (!window.confirm(msg)) {
      closeMenu();
      return;
    }
    try {
      if (isDir) {
        const r = await window.api.ssh.exec(
          sshSessionId,
          `rm -rf ${shSingleQuoteRemote(path)}`,
        );
        if (r.exitCode !== 0) {
          console.error(r.stderr || r.stdout || 'rm -rf failed');
        }
      } else {
        await window.api.sftp.unlink({ sessionId: sshSessionId, remotePath: path });
      }
      await refreshParent(path);
    } catch (err) {
      console.error(err);
    }
    closeMenu();
  }, [menu, sshSessionId, closeMenu, refreshParent, t]);

  const handleRename = useCallback(async () => {
    if (!menu || !menu.entry || !menu.path) {
      return;
    }
    const oldName = menu.entry.filename;
    const oldPath = menu.path;
    closeMenu();
    const next = await showInlinePrompt(t('sftp.fileTree.newName'), oldName);
    if (!next || next === oldName) {
      return;
    }
    const parent = parentPath(oldPath);
    const newPath = joinRemote(parent === '/' ? '' : parent, next);
    const normalized = newPath.startsWith('/') ? newPath : `/${newPath}`;
    try {
      await window.api.sftp.rename({
        sessionId: sshSessionId,
        fromPath: oldPath,
        toPath: normalized,
      });
      await refreshParent(oldPath);
    } catch (err) {
      console.error(err);
    }
  }, [menu, sshSessionId, closeMenu, refreshParent, showInlinePrompt, t]);

  const refreshListingAt = useCallback(
    async (base: string) => {
      await loadDir(base);
      if (base === rootPath) {
        const list = await window.api.sftp.list({ sessionId: sshSessionId, remotePath: rootPath });
        setRootEntries(
          [...list].sort((a, b) =>
            isDirectory(a.attrs) === isDirectory(b.attrs)
              ? a.filename.localeCompare(b.filename)
              : isDirectory(a.attrs)
                ? -1
                : 1,
          ),
        );
      }
    },
    [loadDir, rootPath, sshSessionId],
  );

  const handleNewFile = useCallback(async () => {
    const base = contextTargetDir(menu, rootPath);
    closeMenu();
    const name = await showInlinePrompt(t('sftp.fileTree.fileName'));
    if (!name) {
      return;
    }
    const target = joinRemote(base === '/' ? '' : base, name);
    const normalized = target.startsWith('/') ? target : `/${target}`;
    try {
      const r = await window.api.ssh.exec(sshSessionId, `touch ${shSingleQuoteRemote(normalized)}`);
      if (r.exitCode !== 0) {
        console.error(r.stderr || r.stdout || 'touch failed');
      }
      await refreshListingAt(base);
    } catch (err) {
      console.error(err);
    }
  }, [menu, sshSessionId, rootPath, closeMenu, refreshListingAt, showInlinePrompt, t]);

  const handleUpload = useCallback(async () => {
    const base = contextTargetDir(menu, rootPath);
    closeMenu();
    const filePaths = await window.api.dialog.openFile({ multiple: true });
    if (!filePaths || filePaths.length === 0) {
      return;
    }
    const transferIds: string[] = [];
    const fileNames: string[] = [];
    for (const localPath of filePaths) {
      const fileName = localPath.split(/[\\/]/).pop() ?? localPath;
      fileNames.push(fileName);
      const remotePath = joinRemote(base === '/' ? '' : base, fileName);
      const normalized = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;
      try {
        const { transferId } = await window.api.sftp.upload({
          sessionId: sshSessionId,
          localPath,
          remotePath: normalized,
        });
        transferIds.push(transferId);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    if (transferIds.length > 0) {
      const waitOne = (tid: string) =>
        new Promise<void>((resolve) => {
          const off = window.api.sftp.onTransferComplete((r) => {
            if (r.transferId === tid) {
              off();
              resolve();
            }
          });
        });
      await Promise.all(transferIds.map(waitOne));
      showToast(t('sftp.fileTree.uploadSuccess', { count: fileNames.length }));
    }
    await refreshListingAt(base);
  }, [menu, rootPath, sshSessionId, closeMenu, refreshListingAt, showToast, t]);

  const handleNewFolder = useCallback(async () => {
    const base = contextTargetDir(menu, rootPath);
    closeMenu();
    const name = await showInlinePrompt(t('sftp.fileTree.folderName'));
    if (!name) {
      return;
    }
    const target = joinRemote(base === '/' ? '' : base, name);
    const normalized = target.startsWith('/') ? target : `/${target}`;
    try {
      await window.api.sftp.mkdir({ sessionId: sshSessionId, remotePath: normalized });
      await refreshListingAt(base);
    } catch (err) {
      console.error(err);
    }
  }, [menu, sshSessionId, rootPath, closeMenu, refreshListingAt, showInlinePrompt, t]);

  const handleDownloadFolder = useCallback(async () => {
    if (!menu || !menu.entry || !menu.path || !isDirectory(menu.entry.attrs)) {
      closeMenu();
      return;
    }
    const localDir = await window.api.dialog.openDirectory();
    if (!localDir) {
      closeMenu();
      return;
    }
    const remoteFolderPath = menu.path;
    const folderName = menu.entry.filename;
    const localBase = `${localDir.replace(/[/\\]+$/, '')}${localDir.includes('\\') ? '\\' : '/'}${folderName}`;

    try {
      const collectFiles = async (
        remoteDirPath: string,
      ): Promise<{ remotePath: string; relativePath: string }[]> => {
        const entries = await window.api.sftp.list({
          sessionId: sshSessionId,
          remotePath: remoteDirPath,
        });
        const results: { remotePath: string; relativePath: string }[] = [];
        for (const entry of entries) {
          const childRemote = joinRemote(remoteDirPath, entry.filename);
          const relative = childRemote.startsWith(remoteFolderPath)
            ? childRemote.slice(remoteFolderPath.length)
            : `/${entry.filename}`;
          if (isDirectory(entry.attrs)) {
            const children = await collectFiles(childRemote);
            results.push(...children);
          } else {
            results.push({ remotePath: childRemote, relativePath: relative });
          }
        }
        return results;
      };

      const files = await collectFiles(remoteFolderPath);
      const sep = localDir.includes('\\') ? '\\' : '/';

      const dirsToCreate = new Set<string>();
      for (const { relativePath } of files) {
        const normalizedRelative = relativePath.replace(/\//g, sep);
        const localFilePath = `${localBase}${normalizedRelative}`;
        const localFileDir = localFilePath.slice(0, localFilePath.lastIndexOf(sep));
        if (localFileDir) dirsToCreate.add(localFileDir);
      }
      for (const dir of dirsToCreate) {
        await window.api.local.mkdir(dir);
      }

      for (const { remotePath, relativePath } of files) {
        const normalizedRelative = relativePath.replace(/\//g, sep);
        const localFilePath = `${localBase}${normalizedRelative}`;
        try {
          await window.api.sftp.download({
            sessionId: sshSessionId,
            localPath: localFilePath,
            remotePath,
          });
        } catch (err) {
          console.error('Download failed:', remotePath, err);
        }
      }
      showToast(t('sftp.fileTree.folderDownloadSuccess', { name: folderName }));
    } catch (err) {
      console.error('Folder download failed:', err);
    }
    closeMenu();
  }, [menu, sshSessionId, closeMenu, showToast, t]);

  const handleUploadFolder = useCallback(async () => {
    const base = contextTargetDir(menu, rootPath);
    closeMenu();
    const localDir = await window.api.dialog.openDirectory();
    if (!localDir) {
      return;
    }
    const folderName = localDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? 'folder';
    const fileEntries = await window.api.local.listFilesRecursive(localDir);
    if (fileEntries.length === 0) {
      return;
    }
    const createdDirs = new Set<string>();
    const transferIds: string[] = [];
    const normalizedLocalDir = localDir.replace(/[\\/]+$/, '');

    for (const { relativePath } of fileEntries) {
      const localPath = `${normalizedLocalDir}/${relativePath}`;
      const remoteRelative = `${folderName}/${relativePath}`;
      const remotePath = joinRemote(base === '/' ? '' : base, remoteRelative);
      const normalized = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;

      const remoteDir = parentPath(normalized);
      if (remoteDir !== '/' && !createdDirs.has(remoteDir)) {
        try {
          await window.api.ssh.exec(
            sshSessionId,
            `mkdir -p ${shSingleQuoteRemote(remoteDir)}`,
          );
          createdDirs.add(remoteDir);
        } catch {
          /* may already exist */
        }
      }

      try {
        const { transferId } = await window.api.sftp.upload({
          sessionId: sshSessionId,
          localPath,
          remotePath: normalized,
        });
        transferIds.push(transferId);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }

    if (transferIds.length > 0) {
      const waitOne = (tid: string) =>
        new Promise<void>((resolve) => {
          const off = window.api.sftp.onTransferComplete((r) => {
            if (r.transferId === tid) {
              off();
              resolve();
            }
          });
        });
      await Promise.all(transferIds.map(waitOne));
      showToast(t('sftp.fileTree.folderUploadSuccess'));
    }
    await refreshListingAt(base);
  }, [menu, rootPath, sshSessionId, closeMenu, refreshListingAt, showToast, t]);

  return (
    <div className="sftp-file-tree">
      {loadError && <div className="sftp-tree-error">{loadError}</div>}
      <div className="sftp-tree-header">
        <span className="sftp-tree-h-name">{t('sftp.fileTree.name')}</span>
        <span className="sftp-tree-h-size">{t('sftp.fileTree.size')}</span>
        <span className="sftp-tree-h-mtime">{t('sftp.fileTree.modified')}</span>
      </div>
      <div
        className="sftp-tree-body"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {rootEntries.map((entry) => {
          const fullPath = joinRemote(rootPath === '/' ? '' : rootPath, entry.filename);
          const pathNorm = fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
          return (
            <TreeRow
              key={pathNorm}
              sshSessionId={sshSessionId}
              path={pathNorm}
              entry={entry}
              depth={0}
              expanded={expanded}
              selectedPath={selectedPath}
              loadedChildren={loadedChildren}
              loadingPaths={loadingPaths}
              onToggle={onToggle}
              onSelect={onSelect}
              onRowDoubleClick={onRowDoubleClick}
              onContextMenu={onContextMenu}
            />
          );
        })}
      </div>
      {menu && (
        <div
          ref={menuRef}
          className="sftp-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {menu.entry && (
            <>
              {!isDirectory(menu.entry.attrs) && (
                <button type="button" className="sftp-context-item" role="menuitem" onClick={handleDownload}>
                  {t('sftp.fileTree.download')}
                </button>
              )}
              {isDirectory(menu.entry.attrs) && (
                <button type="button" className="sftp-context-item" role="menuitem" onClick={handleDownloadFolder}>
                  {t('sftp.fileTree.downloadFolder')}
                </button>
              )}
              <button type="button" className="sftp-context-item" role="menuitem" onClick={handleDelete}>
                {t('sftp.fileTree.delete')}
              </button>
              <button type="button" className="sftp-context-item" role="menuitem" onClick={handleRename}>
                {t('sftp.fileTree.rename')}
              </button>
              <div className="sftp-context-divider" />
            </>
          )}
          <button type="button" className="sftp-context-item" role="menuitem" onClick={handleNewFile}>
            {t('sftp.fileTree.newFile')}
          </button>
          <button type="button" className="sftp-context-item" role="menuitem" onClick={handleNewFolder}>
            {t('sftp.fileTree.newFolder')}
          </button>
          <button type="button" className="sftp-context-item" role="menuitem" onClick={handleUpload}>
            {t('sftp.fileTree.uploadFile')}
          </button>
          <button type="button" className="sftp-context-item" role="menuitem" onClick={handleUploadFolder}>
            {t('sftp.fileTree.uploadFolder')}
          </button>
        </div>
      )}
      {toast && (
        <div className="sftp-toast">
          <span className="sftp-toast-icon">✓</span>
          <span>{toast}</span>
        </div>
      )}
      {promptState && (
        <div className="sftp-prompt-overlay" onClick={handlePromptCancel}>
          <div className="sftp-prompt-dialog" onClick={(e) => e.stopPropagation()}>
            <label className="sftp-prompt-label">{promptState.label}</label>
            <input
              ref={promptInputRef}
              className="sftp-prompt-input"
              defaultValue={promptState.defaultValue}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePromptSubmit();
                if (e.key === 'Escape') handlePromptCancel();
              }}
            />
            <div className="sftp-prompt-actions">
              <button type="button" className="sftp-prompt-btn sftp-prompt-ok" onClick={handlePromptSubmit}>
                {t('common.ok')}
              </button>
              <button type="button" className="sftp-prompt-btn" onClick={handlePromptCancel}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
