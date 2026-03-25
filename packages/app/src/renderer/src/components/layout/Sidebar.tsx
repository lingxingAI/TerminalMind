import React, { useEffect } from 'react';
import { useLayoutStore } from '../../stores/layout-store';
import { useTabStore } from '../../stores/tab-store';
import { useConnectionStore } from '../../stores/connection-store';
import { ConnectionSearch } from '../connections/ConnectionSearch';
import { ConnectionTree } from '../connections/ConnectionTree';
import { ConnectionEditor } from '../connections/ConnectionEditor';
import { FileBrowser } from '../sftp/FileBrowser';

export function Sidebar(): React.ReactElement {
  const view = useLayoutStore((s) => s.activeSidebarView);
  const width = useLayoutStore((s) => s.sidebarWidth);
  const visible = useLayoutStore((s) => s.sidebarVisible);
  const tabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const refreshConnections = useConnectionStore((s) => s.refreshConnections);
  const openEditor = useConnectionStore((s) => s.openEditor);
  const isEditorOpen = useConnectionStore((s) => s.isEditorOpen);

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

  const isFilesView = view === 'files' || view === 'sftp';

  const headerLabel =
    view === 'terminal' || view === 'terminal-list'
      ? 'TERMINALS'
      : view === 'connections'
        ? 'CONNECTIONS'
        : isFilesView
          ? 'FILES'
          : view.toUpperCase();

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-header sidebar-header-row">
        <span>{headerLabel}</span>
        {view === 'connections' ? (
          <button
            type="button"
            className="sidebar-header-action"
            title="New connection"
            onClick={() => openEditor()}
          >
            +
          </button>
        ) : null}
      </div>
      <div className="sidebar-content">
        {view === 'terminal' || view === 'terminal-list' ? (
          <div className="terminal-list">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`terminal-list-item ${tab.isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span style={{ color: tab.iconColor }}>●</span>
                <span>{tab.title}</span>
              </div>
            ))}
          </div>
        ) : view === 'connections' ? (
          <div className="connections-sidebar">
            <ConnectionSearch />
            <ConnectionTree />
          </div>
        ) : isFilesView ? (
          <div className="sidebar-sftp-wrap">
            <FileBrowser />
          </div>
        ) : (
          <div className="sidebar-placeholder">Coming soon</div>
        )}
      </div>
      {isEditorOpen ? <ConnectionEditor /> : null}
    </div>
  );
}
