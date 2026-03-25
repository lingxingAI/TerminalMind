import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [rootEntries, setRootEntries] = useState<SFTPFileEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadedChildren, setLoadedChildren] = useState<Map<string, SFTPFileEntry[]>>(() => new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    path: string;
    entry: SFTPFileEntry;
  } | null>(null);
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

  const handleDownload = useCallback(() => {
    if (!menu || isDirectory(menu.entry.attrs)) {
      return;
    }
    onFileSelect?.(menu.path, menu.entry);
    closeMenu();
  }, [menu, onFileSelect, closeMenu]);

  const handleDelete = useCallback(async () => {
    if (!menu) {
      return;
    }
    const { path, entry } = menu;
    if (!window.confirm(`Delete ${entry.filename}?`)) {
      closeMenu();
      return;
    }
    try {
      if (isDirectory(entry.attrs)) {
        await window.api.sftp.rmdir({ sessionId: sshSessionId, remotePath: path });
      } else {
        await window.api.sftp.unlink({ sessionId: sshSessionId, remotePath: path });
      }
      await refreshParent(path);
    } catch (err) {
      console.error(err);
    }
    closeMenu();
  }, [menu, sshSessionId, closeMenu, refreshParent]);

  const handleRename = useCallback(async () => {
    if (!menu) {
      return;
    }
    const next = window.prompt('New name', menu.entry.filename);
    if (!next || next === menu.entry.filename) {
      closeMenu();
      return;
    }
    const parent = parentPath(menu.path);
    const newPath = joinRemote(parent === '/' ? '' : parent, next);
    const normalized = newPath.startsWith('/') ? newPath : `/${newPath}`;
    try {
      await window.api.sftp.rename({
        sessionId: sshSessionId,
        fromPath: menu.path,
        toPath: normalized,
      });
      await refreshParent(menu.path);
    } catch (err) {
      console.error(err);
    }
    closeMenu();
  }, [menu, sshSessionId, closeMenu, refreshParent]);

  const handleNewFolder = useCallback(async () => {
    const name = window.prompt('Folder name');
    if (!name) {
      closeMenu();
      return;
    }
    const base =
      menu?.path && isDirectory(menu.entry.attrs) ? menu.path : rootPath === '/' ? '/' : rootPath;
    const target = joinRemote(base === '/' ? '' : base, name);
    const normalized = target.startsWith('/') ? target : `/${target}`;
    try {
      await window.api.sftp.mkdir({ sessionId: sshSessionId, remotePath: normalized });
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
    } catch (err) {
      console.error(err);
    }
    closeMenu();
  }, [menu, sshSessionId, rootPath, closeMenu, loadDir]);

  return (
    <div className="sftp-file-tree">
      {loadError && <div className="sftp-tree-error">{loadError}</div>}
      <div className="sftp-tree-header">
        <span className="sftp-tree-h-name">Name</span>
        <span className="sftp-tree-h-size">Size</span>
        <span className="sftp-tree-h-mtime">Modified</span>
      </div>
      <div className="sftp-tree-body">
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
          {!isDirectory(menu.entry.attrs) && (
            <button type="button" className="sftp-context-item" role="menuitem" onClick={handleDownload}>
              Download
            </button>
          )}
          <button type="button" className="sftp-context-item" role="menuitem" onClick={handleDelete}>
            Delete
          </button>
          <button type="button" className="sftp-context-item" role="menuitem" onClick={handleRename}>
            Rename
          </button>
          <button type="button" className="sftp-context-item" role="menuitem" onClick={handleNewFolder}>
            New Folder
          </button>
        </div>
      )}
    </div>
  );
}
