import React, { useCallback, useState } from 'react';
import type { ShellInfo } from '@terminalmind/api';
import { useTabStore } from '../../stores/tab-store';
import { ShellSelector } from '../terminal/ShellSelector';

export function TabBar(): React.ReactElement {
  const tabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const addTab = useTabStore((s) => s.addTab);
  const [shellPickerOpen, setShellPickerOpen] = useState(false);

  const handleNewTab = useCallback(() => {
    setShellPickerOpen(true);
  }, []);

  const handleShellSelected = useCallback(
    async (shell: ShellInfo) => {
      setShellPickerOpen(false);
      try {
        const session = await window.api.terminal.create({ shell: shell.path });
        addTab(session.id, session.title);
      } catch (err) {
        console.error('Failed to create terminal:', err);
      }
    },
    [addTab],
  );

  const handleShellPickerCancel = useCallback(() => {
    setShellPickerOpen(false);
  }, []);

  const handleCloseTab = useCallback(
    async (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        await window.api.terminal.destroy(tab.terminalSessionId);
      }
      removeTab(tabId);
    },
    [tabs, removeTab],
  );

  return (
    <>
      {shellPickerOpen && (
        <ShellSelector onSelect={handleShellSelected} onCancel={handleShellPickerCancel} />
      )}
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item ${tab.isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon" style={{ color: tab.iconColor }}>●</span>
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              onClick={(e) => handleCloseTab(e, tab.id)}
              aria-label="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="tab-new" onClick={handleNewTab} aria-label="New terminal">
        +
      </button>
    </div>
    </>
  );
}
