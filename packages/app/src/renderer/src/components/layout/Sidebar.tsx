import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layout-store';
import { useTabStore } from '../../stores/tab-store';
import { useConnectionStore } from '../../stores/connection-store';
import { ConnectionSearch } from '../connections/ConnectionSearch';
import { ConnectionTree } from '../connections/ConnectionTree';
import { ExtensionsSidebarPanel } from '../extensions/ExtensionsSidebarPanel';
import { FileTree } from '../sftp/FileTree';

function RemoteFileTree(): React.ReactElement {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<{ id: string; label: string }[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadSessions = useCallback(async () => {
    const list = await window.api.ssh.listSessions();
    const mapped = list.map((s) => ({ id: s.id, label: `${s.username}@${s.host}` }));
    setSessions(mapped);
    setSelectedSessionId((prev) => {
      if (mapped.length === 0) {
        return null;
      }
      if (prev !== null && mapped.some((s) => s.id === prev)) {
        return prev;
      }
      return mapped[0].id;
    });
  }, []);

  useEffect(() => {
    void loadSessions();
    const off = window.api.ssh.onStatusChange(() => void loadSessions());
    return () => off();
  }, [loadSessions]);

  return (
    <>
      <div className="sidebar-header">
        <h2>{t('layout.files')}</h2>
        <div className="sb-actions">
          <button type="button" title={t('common.refresh')} onClick={() => setRefreshToken((n) => n + 1)}>
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
          </button>
        </div>
      </div>
      {sessions.length > 1 && (
        <div style={{ padding: '4px 8px' }}>
          <select
            className="form-select"
            style={{ fontSize: 11, padding: '4px 8px' }}
            value={selectedSessionId ?? ''}
            onChange={(e) => setSelectedSessionId(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="sidebar-body" style={{ overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {sessions.length === 0 ? (
          <div className="sidebar-placeholder">{t('layout.noSshSessions')}</div>
        ) : selectedSessionId ? (
          <FileTree sshSessionId={selectedSessionId} refreshToken={refreshToken} />
        ) : (
          <div className="sidebar-placeholder">{t('layout.selectSession')}</div>
        )}
      </div>
    </>
  );
}

export function Sidebar(): React.ReactElement {
  const { t } = useTranslation();
  const view = useLayoutStore((s) => s.activeSidebarView);
  const visible = useLayoutStore((s) => s.sidebarVisible);
  const tabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const refreshConnections = useConnectionStore((s) => s.refreshConnections);
  const openEditor = useConnectionStore((s) => s.openEditor);

  useEffect(() => {
    const unsub = window.api.connections.onChanged(() => {
      void useConnectionStore.getState().refreshConnections();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (visible && view === 'connections') {
      void refreshConnections();
    }
  }, [visible, view, refreshConnections]);

  if (!visible) return <></>;

  if (view === 'extensions') {
    return (
      <div className="sidebar">
        <ExtensionsSidebarPanel />
      </div>
    );
  }

  if (view === 'files' || view === 'sftp') {
    return (
      <div className="sidebar">
        <RemoteFileTree />
      </div>
    );
  }

  const headerLabel =
    view === 'terminal' || view === 'terminal-list'
      ? t('layout.terminals')
      : view === 'connections'
        ? t('layout.connections')
        : t(`layout.${view}`, { defaultValue: view.charAt(0).toUpperCase() + view.slice(1) });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>{headerLabel}</h2>
        <div className="sb-actions">
          {view === 'connections' ? (
            <button type="button" title={t('layout.newConnection')} onClick={() => openEditor()}>
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>add</span>
            </button>
          ) : null}
          <button type="button" title={t('common.refresh')}>
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span>
          </button>
          {view === 'connections' ? (
            <button type="button" title="More">
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>more_horiz</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="sidebar-body">
        {view === 'terminal' || view === 'terminal-list' ? (
          <div className="terminal-list">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tree-item ${tab.isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="status-dot connected" />
                <span className="material-symbols-rounded" style={{ color: tab.connectionType === 'ssh' ? 'var(--green)' : 'var(--accent)', fontSize: 15 }}>
                  {tab.connectionType === 'ssh' ? 'terminal' : 'laptop'}
                </span>
                <span className="item-label">{tab.title}</span>
                <span className="item-meta">{tab.connectionType === 'ssh' ? 'ssh' : 'local'}</span>
              </div>
            ))}
          </div>
        ) : view === 'connections' ? (
          <div className="connections-sidebar">
            <ConnectionSearch />
            <ConnectionTree />
          </div>
        ) : (
          <div className="sidebar-placeholder">{t('common.comingSoon')}</div>
        )}
      </div>
    </div>
  );
}
