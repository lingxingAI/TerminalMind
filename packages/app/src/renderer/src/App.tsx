import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTabStore } from './stores/tab-store';
import { useLayoutStore } from './stores/layout-store';
import { TabBar } from './components/layout/TabBar';
import { TerminalView } from './components/terminal/TerminalView';
import { ActivityBar } from './components/layout/ActivityBar';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { Toolbar } from './components/layout/Toolbar';
import { useGlobalKeybindings } from './hooks/useGlobalKeybindings';
import { useTransferIpcSync } from './hooks/useTransferIpcSync';
import { PermissionPromptModal } from './components/extensions/PermissionPromptModal';
import { MarketplaceView } from './components/extensions/MarketplaceView';
import { SettingsView } from './components/settings/SettingsView';
import { ConnectionEditor } from './components/connections/ConnectionEditor';
import { useConnectionStore } from './stores/connection-store';
import { useThemeStore } from './stores/theme-store';
import { useTerminalSettingsStore } from './stores/terminal-settings-store';
import { initI18nLanguage } from './i18n';
import type { PermissionPrompt } from '@terminalmind/api';

export function App(): React.ReactElement {
  const tabs = useTabStore((s) => s.tabs);
  const addTab = useTabStore((s) => s.addTab);
  const activeView = useLayoutStore((s) => s.activeActivityBarItem);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const isEditorOpen = useConnectionStore((s) => s.isEditorOpen);
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = useLayoutStore.getState().sidebarWidth;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        setSidebarWidth(startWidth + delta);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [setSidebarWidth],
  );

  useGlobalKeybindings();
  useTransferIpcSync();

  useEffect(() => {
    void useThemeStore.getState().initTheme();
    void useTerminalSettingsStore.getState().init();
    void initI18nLanguage();
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPrompt | null>(null);

  useEffect(() => {
    return window.api.extensions.onPermissionPrompt((p) => {
      setPermissionPrompt(p);
    });
  }, []);

  const initialCreatedRef = useRef(false);
  useEffect(() => {
    if (tabs.length === 0 && !initialCreatedRef.current) {
      initialCreatedRef.current = true;
      const defaultShell = useTerminalSettingsStore.getState().defaultShellPath;
      const opts = defaultShell ? { shell: defaultShell } : {};
      window.api.terminal
        .create(opts)
        .then((session) => {
          addTab(session.id, session.title);
        })
        .catch((err: Error) => {
          initialCreatedRef.current = false;
          console.error('Failed to create initial terminal:', err);
          setError(err.message ?? 'Failed to create terminal. Is node-pty built correctly?');
        });
    }
  }, []);

  const isFullPageView = activeView === 'extensions' || activeView === 'settings';

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="app-body">
        <ActivityBar />
        {!isFullPageView && sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth, flexShrink: 0 }}>
              <Sidebar />
            </div>
            <div className="resize-handle" onMouseDown={handleResizeStart} />
          </>
        )}
        <div className="main-area">
          {activeView === 'extensions' && <MarketplaceView />}
          {activeView === 'settings' && <SettingsView />}
          <div style={{ display: isFullPageView ? 'none' : 'contents' }}>
            <TabBar />
            <div className="terminal-area">
              {error ? (
                <div className="error-banner">
                  <p style={{ fontWeight: 600 }}>Terminal Error</p>
                  <p>{error}</p>
                  <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 8 }}>
                    Run <code>npx @electron/rebuild -w node-pty</code> to rebuild native modules.
                  </p>
                </div>
              ) : (
                tabs.map((tab) => (
                  <TerminalView
                    key={tab.terminalSessionId}
                    sessionId={tab.terminalSessionId}
                    visible={tab.isActive && !isFullPageView}
                    agentMode={tab.sessionMode === 'agent'}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      <StatusBar />
      <PermissionPromptModal prompt={permissionPrompt} onClose={() => setPermissionPrompt(null)} />
      {isEditorOpen && <ConnectionEditor />}
    </div>
  );
}
