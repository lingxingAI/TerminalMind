import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectionStore, type ConnectionInfo } from '../../stores/connection-store';
import { useTabStore } from '../../stores/tab-store';

const UNGROUPED = '__ungrouped__';

function matchesQuery(conn: ConnectionInfo, q: string): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  if (conn.name.toLowerCase().includes(n)) return true;
  if (conn.host?.toLowerCase().includes(n)) return true;
  if (conn.tags?.some((t) => t.toLowerCase().includes(n))) return true;
  return false;
}

type MenuState = { x: number; y: number; connection: ConnectionInfo } | null;

export function ConnectionTree(): React.ReactElement {
  const connections = useConnectionStore((s) => s.connections);
  const searchQuery = useConnectionStore((s) => s.searchQuery);
  const selectedId = useConnectionStore((s) => s.selectedConnectionId);
  const selectConnection = useConnectionStore((s) => s.selectConnection);
  const openEditor = useConnectionStore((s) => s.openEditor);
  const refreshConnections = useConnectionStore((s) => s.refreshConnections);
  const addSSHTab = useTabStore((s) => s.addSSHTab);

  const [menu, setMenu] = useState<MenuState>(null);

  const filtered = useMemo(
    () => connections.filter((c) => matchesQuery(c, searchQuery)),
    [connections, searchQuery],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ConnectionInfo[]>();
    for (const c of filtered) {
      const key = c.group?.trim() ? c.group.trim() : UNGROUPED;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    const keys = [...map.keys()].filter((k) => k !== UNGROUPED).sort((a, b) => a.localeCompare(b));
    if (map.has(UNGROUPED)) keys.push(UNGROUPED);
    return keys.map((k) => ({ group: k, items: map.get(k)! }));
  }, [filtered]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const { group } of grouped) {
        if (next[group] === undefined) next[group] = true;
      }
      return next;
    });
  }, [grouped]);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onDoc = () => closeMenu();
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [menu, closeMenu]);

  const handleConnect = useCallback(
    async (conn: ConnectionInfo) => {
      if (conn.type !== 'ssh') return;
      const profile = await window.api.connections.get(conn.id);
      if (!profile?.sshConfig) return;
      try {
        const info = await window.api.ssh.connect(profile.sshConfig);
        const termId = info.terminalSessionId;
        if (termId) {
          addSSHTab(termId, info.id, profile.name);
        }
        await refreshConnections();
      } catch (e) {
        console.error('SSH connect failed:', e);
      }
    },
    [refreshConnections, addSSHTab],
  );

  const handleDelete = useCallback(
    async (conn: ConnectionInfo) => {
      if (!window.confirm(`Remove connection "${conn.name}"?`)) return;
      await window.api.connections.remove(conn.id);
      await refreshConnections();
      if (selectedId === conn.id) selectConnection(null);
    },
    [refreshConnections, selectConnection, selectedId],
  );

  const toggleGroup = (g: string) => {
    setExpanded((prev) => ({ ...prev, [g]: !prev[g] }));
  };

  const displayGroupLabel = (g: string) => (g === UNGROUPED ? 'Ungrouped' : g);

  return (
    <div className="connection-tree" onContextMenu={(e) => e.preventDefault()}>
      {grouped.length === 0 ? (
        <div className="connection-tree-empty">No connections</div>
      ) : (
        grouped.map(({ group, items }) => (
          <div key={group} className="connection-tree-group">
            <button
              type="button"
              className="connection-tree-group-header"
              onClick={() => toggleGroup(group)}
            >
              <span className="connection-tree-chevron">{expanded[group] ? '▼' : '▶'}</span>
              <span>{displayGroupLabel(group)}</span>
              <span className="connection-tree-count">{items.length}</span>
            </button>
            {expanded[group] ? (
              <ul className="connection-tree-list">
                {items.map((conn) => (
                  <li key={conn.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={`connection-tree-row ${selectedId === conn.id ? 'selected' : ''}`}
                      onClick={() => selectConnection(conn.id)}
                      onDoubleClick={() => void handleConnect(conn)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenu({ x: e.clientX, y: e.clientY, connection: conn });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectConnection(conn.id);
                        }
                      }}
                    >
                      <span
                        className="connection-tree-status-dot"
                        style={{
                          color:
                            conn.status === 'connected' ? 'var(--green)' : 'var(--text-dim)',
                        }}
                        title={conn.status === 'connected' ? 'Connected' : 'Disconnected'}
                      >
                        ●
                      </span>
                      <span className="connection-tree-name">{conn.name}</span>
                      <span className="connection-tree-host">
                        {conn.type === 'ssh' && conn.host
                          ? `${conn.username ? `${conn.username}@` : ''}${conn.host}${conn.port && conn.port !== 22 ? `:${conn.port}` : ''}`
                          : conn.type === 'local'
                            ? 'local'
                            : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))
      )}

      {menu ? (
        <div
          className="connection-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => { void handleConnect(menu.connection); closeMenu(); }}>
            Connect
          </button>
          <button type="button" role="menuitem" onClick={() => { openEditor(menu.connection); closeMenu(); }}>
            Edit
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => { void handleDelete(menu.connection); closeMenu(); }}>
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
