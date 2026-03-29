import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShellInfo } from '@terminalmind/api';
import { useTabStore } from '../../stores/tab-store';
import type { SessionMode } from '../../stores/tab-store';
import { useTerminalSettingsStore } from '../../stores/terminal-settings-store';
import { ShellSelector } from '../terminal/ShellSelector';

function getTabIcon(connectionType?: string): { icon: string; className: string } {
  switch (connectionType) {
    case 'ssh':
      return { icon: 'terminal', className: 'tab-icon ssh' };
    case 'sftp':
      return { icon: 'folder_shared', className: 'tab-icon sftp' };
    default:
      return { icon: 'laptop', className: 'tab-icon local' };
  }
}

export function TabBar(): React.ReactElement {
  const { t } = useTranslation();
  const tabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const removeOtherTabs = useTabStore((s) => s.removeOtherTabs);
  const removeAllTabs = useTabStore((s) => s.removeAllTabs);
  const addTab = useTabStore((s) => s.addTab);
  const addSSHTab = useTabStore((s) => s.addSSHTab);
  const activatePrevTab = useTabStore((s) => s.activatePrevTab);
  const activateNextTab = useTabStore((s) => s.activateNextTab);
  const moveTab = useTabStore((s) => s.moveTab);
  const setSessionMode = useTabStore((s) => s.setSessionMode);
  const activeTab = tabs.find((t) => t.isActive);
  const sessionMode: SessionMode = activeTab?.sessionMode ?? 'agent';
  const [shellPickerOpen, setShellPickerOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const dragIndexRef = useRef<number>(-1);
  const [dropTargetIndex, setDropTargetIndex] = useState<number>(-1);

  useEffect(() => {
    if (!menu) return;
    const handler = () => setMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menu]);

  const handleNewTab = useCallback(async () => {
    const defaultShell = useTerminalSettingsStore.getState().defaultShellPath;
    if (defaultShell) {
      try {
        const session = await window.api.terminal.create({ shell: defaultShell });
        addTab(session.id, session.title);
      } catch (err) {
        console.error('Failed to create terminal:', err);
      }
    } else {
      setShellPickerOpen(true);
    }
  }, [addTab]);

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

  const closeTabById = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        await window.api.terminal.destroy(tab.terminalSessionId);
      }
      removeTab(tabId);
    },
    [tabs, removeTab],
  );

  const handleCloseTab = useCallback(
    async (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      await closeTabById(tabId);
    },
    [closeTabById],
  );

  const handleDuplicate = useCallback(async () => {
    if (!menu) return;
    const tab = tabs.find((t) => t.id === menu.tabId);
    if (!tab) return;
    let newTabId: string | undefined;
    try {
      if (tab.connectionType === 'ssh' && tab.connectionId) {
        const profile = await window.api.connections.get(tab.connectionId);
        if (profile?.sshConfig) {
          const info = await window.api.ssh.connect(profile.sshConfig);
          const termId = info.terminalSessionId;
          if (termId) {
            newTabId = addSSHTab(termId, info.id, tab.title, tab.connectionId);
          }
        }
      } else if (tab.connectionType === 'ssh') {
        console.warn('Cannot duplicate SSH tab without connectionId');
      } else {
        const existingSession = await window.api.terminal.getSession(tab.terminalSessionId);
        const shell = existingSession?.shellPath;
        const session = await window.api.terminal.create(shell ? { shell } : {});
        newTabId = addTab(session.id, tab.title);
      }
      if (newTabId && tab.sessionMode !== 'shell') {
        setSessionMode(newTabId, tab.sessionMode);
      }
    } catch (err) {
      console.error('Failed to duplicate tab:', err);
    }
    setMenu(null);
  }, [menu, tabs, addTab, addSSHTab, setSessionMode]);

  const handleCloseOthers = useCallback(async () => {
    if (!menu) return;
    const toDestroy = tabs.filter((t) => t.id !== menu.tabId);
    for (const t of toDestroy) {
      await window.api.terminal.destroy(t.terminalSessionId);
    }
    removeOtherTabs(menu.tabId);
    setMenu(null);
  }, [menu, tabs, removeOtherTabs]);

  const handleCloseAll = useCallback(async () => {
    for (const t of tabs) {
      await window.api.terminal.destroy(t.terminalSessionId);
    }
    removeAllTabs();
    setMenu(null);
  }, [tabs, removeAllTabs]);

  const handleModeSwitch = useCallback(
    (mode: SessionMode) => {
      if (activeTab) setSessionMode(activeTab.id, mode);
    },
    [activeTab, setSessionMode],
  );

  return (
    <>
      {shellPickerOpen && (
        <ShellSelector onSelect={handleShellSelected} onCancel={() => setShellPickerOpen(false)} />
      )}
      <div className="tab-bar">
        <div className="tab-nav-buttons">
          <button className="tab-nav-btn" title={t('layout.back')} onClick={activatePrevTab}>
            <span className="material-symbols-rounded">arrow_back</span>
          </button>
          <button className="tab-nav-btn" title={t('layout.forward')} onClick={activateNextTab}>
            <span className="material-symbols-rounded">arrow_forward</span>
          </button>
        </div>

        <div className="tab-mode-group">
          <button
            className={`tab-mode-btn ${sessionMode === 'shell' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('shell')}
          >
            <span className="material-symbols-rounded">terminal</span>
            {t('layout.shell')}
          </button>
          <button
            className={`tab-mode-btn ${sessionMode === 'agent' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('agent')}
          >
            <span className="material-symbols-rounded">smart_toy</span>
            {t('layout.agent')}
          </button>
        </div>

        <div className="tab-divider" />

        {tabs.map((tab, index) => {
          const { icon, className } = getTabIcon(tab.connectionType);
          return (
            <div
              key={tab.id}
              className={`tab ${tab.isActive ? 'active' : ''} ${dropTargetIndex === index ? 'drop-target' : ''}`}
              draggable
              onDragStart={(e) => {
                dragIndexRef.current = index;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragIndexRef.current !== index) {
                  setDropTargetIndex(index);
                }
              }}
              onDragLeave={() => setDropTargetIndex(-1)}
              onDrop={(e) => {
                e.preventDefault();
                setDropTargetIndex(-1);
                const from = dragIndexRef.current;
                if (from >= 0 && from !== index) {
                  moveTab(from, index);
                }
                dragIndexRef.current = -1;
              }}
              onDragEnd={() => {
                dragIndexRef.current = -1;
                setDropTargetIndex(-1);
              }}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
              }}
            >
              <span className={`material-symbols-rounded ${className}`}>{icon}</span>
              <span>{tab.title}</span>
              <span
                className="tab-close"
                role="button"
                tabIndex={0}
                onClick={(e) => handleCloseTab(e, tab.id)}
              >
                <span className="material-symbols-rounded">close</span>
              </span>
            </div>
          );
        })}
        <button
          className="tab-new"
          onClick={handleNewTab}
          title={t('layout.newTerminal')}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
        </button>

        <div className="tab-spacer" />
      </div>

      {menu && (
        <div
          className="tab-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" className="context-menu-item" onClick={handleDuplicate}>
            <span className="material-symbols-rounded">content_copy</span>
            {t('layout.duplicateSession')}
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              void closeTabById(menu.tabId);
              setMenu(null);
            }}
          >
            <span className="material-symbols-rounded">close</span>
            {t('common.close')}
          </button>
          <button type="button" className="context-menu-item" onClick={handleCloseOthers}>
            <span className="material-symbols-rounded">tab_close_right</span>
            {t('layout.closeOthers')}
          </button>
          <button type="button" className="context-menu-item" onClick={handleCloseAll}>
            <span className="material-symbols-rounded">delete_sweep</span>
            {t('layout.closeAll')}
          </button>
        </div>
      )}
    </>
  );
}
