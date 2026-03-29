import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

type MenuState = { x: number; y: number; connectionId: string } | null;

export function ConnectionTree(): React.ReactElement {
  const { t } = useTranslation();
  const connections = useConnectionStore((s) => s.connections);
  const searchQuery = useConnectionStore((s) => s.searchQuery);
  const selectedId = useConnectionStore((s) => s.selectedConnectionId);
  const selectConnection = useConnectionStore((s) => s.selectConnection);
  const openEditor = useConnectionStore((s) => s.openEditor);
  const refreshConnections = useConnectionStore((s) => s.refreshConnections);
  const bindSession = useConnectionStore((s) => s.bindSession);
  const unbindSession = useConnectionStore((s) => s.unbindSession);
  const profileSessionMap = useConnectionStore((s) => s.profileSessionMap);
  const addSSHTab = useTabStore((s) => s.addSSHTab);
  const tabs = useTabStore((s) => s.tabs);
  const removeTab = useTabStore((s) => s.removeTab);

  const [menu, setMenu] = useState<MenuState>(null);

  useEffect(() => {
    void refreshConnections();
    const off = window.api.ssh.onStatusChange(() => {
      void refreshConnections();
    });
    return () => off();
  }, [refreshConnections]);

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
        bindSession(conn.id, info.id);
        const termId = info.terminalSessionId;
        if (termId) {
          addSSHTab(termId, info.id, profile.name, conn.id);
        }
        await refreshConnections();
      } catch (e) {
        console.error('SSH connect failed:', e);
      }
    },
    [refreshConnections, bindSession, addSSHTab],
  );

  const handleDisconnect = useCallback(
    async (conn: ConnectionInfo) => {
      try {
        const sshSessionIds = new Set<string>();
        const boundId = profileSessionMap.get(conn.id);
        if (boundId) sshSessionIds.add(boundId);

        const matchingTabs = tabs.filter(
          (t) => t.connectionType === 'ssh' && t.connectionId === conn.id,
        );
        for (const mt of matchingTabs) {
          if (mt.sshSessionId) sshSessionIds.add(mt.sshSessionId);
        }

        if (sshSessionIds.size === 0 && conn.host && conn.username) {
          try {
            const sessions = await window.api.ssh.listSessions();
            for (const s of sessions) {
              if (
                s.status === 'connected' &&
                s.host === conn.host &&
                s.port === (conn.port ?? 22) &&
                s.username === conn.username
              ) {
                sshSessionIds.add(s.id);
              }
            }
          } catch { /* ignore */ }
        }

        for (const tab of matchingTabs) {
          await window.api.terminal.destroy(tab.terminalSessionId);
          removeTab(tab.id);
        }

        for (const sid of sshSessionIds) {
          const extraTabs = tabs.filter(
            (et) =>
              et.connectionType === 'ssh' &&
              et.sshSessionId === sid &&
              !matchingTabs.some((mt) => mt.id === et.id),
          );
          for (const et of extraTabs) {
            await window.api.terminal.destroy(et.terminalSessionId);
            removeTab(et.id);
          }
          try {
            await window.api.ssh.disconnect(sid);
          } catch { /* session may already be gone */ }
        }

        unbindSession(conn.id);
      } catch (e) {
        console.error('SSH disconnect failed:', e);
      } finally {
        await refreshConnections();
      }
    },
    [profileSessionMap, tabs, removeTab, unbindSession, refreshConnections],
  );

  const handleDelete = useCallback(
    async (conn: ConnectionInfo) => {
      if (!window.confirm(t('connections.tree.confirmRemove', { name: conn.name }))) return;
      await window.api.connections.remove(conn.id);
      await refreshConnections();
      if (selectedId === conn.id) selectConnection(null);
    },
    [refreshConnections, selectConnection, selectedId, t],
  );

  const toggleGroup = (g: string) => {
    setExpanded((prev) => ({ ...prev, [g]: !prev[g] }));
  };

  const displayGroupLabel = (g: string) => (g === UNGROUPED ? t('connections.tree.ungrouped') : g);

  const menuConnection = menu ? connections.find((c) => c.id === menu.connectionId) : null;

  return (
    <div className="connection-tree" onContextMenu={(e) => e.preventDefault()}>
      {grouped.length === 0 ? (
        <div className="sidebar-placeholder">{t('connections.tree.empty')}</div>
      ) : (
        grouped.map(({ group, items }) => (
          <div key={group} className="tree-group">
            <button
              type="button"
              className="tree-group-header"
              onClick={() => toggleGroup(group)}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                {expanded[group] ? 'expand_more' : 'chevron_right'}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayGroupLabel(group)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                {items.length}
              </span>
            </button>
            {expanded[group] ? (
              <ul className="connection-tree-list">
                {items.map((conn) => (
                  <li key={conn.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={`tree-item ${selectedId === conn.id ? 'active' : ''}`}
                      onClick={() => selectConnection(conn.id)}
                      onDoubleClick={() => void handleConnect(conn)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenu({ x: e.clientX, y: e.clientY, connectionId: conn.id });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectConnection(conn.id);
                        }
                      }}
                    >
                      <span
                        className={`status-dot ${conn.status === 'connected' ? 'connected' : 'disconnected'}`}
                        title={conn.status === 'connected' ? t('connections.tree.connected') : t('connections.tree.disconnected')}
                      />
                      <span
                        className="material-symbols-rounded"
                        style={{
                          color: conn.status === 'connected' ? 'var(--green)' : 'var(--text-dim)',
                          fontSize: 15,
                        }}
                      >
                        {conn.type === 'ssh' ? 'terminal' : 'laptop'}
                      </span>
                      <span className="item-label">{conn.name}</span>
                      <span className="item-meta">
                        {conn.type === 'ssh' && conn.host
                          ? `${conn.username ? `${conn.username}@` : ''}${conn.host}${conn.port && conn.port !== 22 ? `:${conn.port}` : ''}`
                          : conn.type === 'local'
                            ? t('common.local')
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

      {menu && menuConnection ? (
        <div
          className="sidebar-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {menuConnection.status === 'connected' ? (
            <button
              type="button"
              className="sidebar-context-menu-item danger"
              role="menuitem"
              onClick={() => {
                void handleDisconnect(menuConnection);
                closeMenu();
              }}
            >
              {t('connections.tree.disconnect')}
            </button>
          ) : (
            <button
              type="button"
              className="sidebar-context-menu-item"
              role="menuitem"
              onClick={() => {
                void handleConnect(menuConnection);
                closeMenu();
              }}
            >
              {t('connections.tree.connect')}
            </button>
          )}
          <button
            type="button"
            className="sidebar-context-menu-item"
            role="menuitem"
            onClick={() => {
              openEditor(menuConnection);
              closeMenu();
            }}
          >
            {t('connections.tree.edit')}
          </button>
          <button
            type="button"
            className="sidebar-context-menu-item danger"
            role="menuitem"
            onClick={() => {
              void handleDelete(menuConnection);
              closeMenu();
            }}
          >
            {t('connections.tree.delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
