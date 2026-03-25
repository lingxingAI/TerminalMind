import React from 'react';
import { useLayoutStore } from '../../stores/layout-store';
import { useTabStore } from '../../stores/tab-store';

export function Sidebar(): React.ReactElement {
  const view = useLayoutStore((s) => s.activeSidebarView);
  const width = useLayoutStore((s) => s.sidebarWidth);
  const visible = useLayoutStore((s) => s.sidebarVisible);
  const tabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);

  if (!visible) return <></>;

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-header">
        {view === 'terminal' || view === 'terminal-list' ? 'TERMINALS' : view.toUpperCase()}
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
        ) : (
          <div className="sidebar-placeholder">Coming soon</div>
        )}
      </div>
    </div>
  );
}
