import React, { useCallback, useEffect, useState } from 'react';
import { useTabStore } from './stores/tab-store';
import { TabBar } from './components/layout/TabBar';
import { TerminalView } from './components/terminal/TerminalView';
import { ActivityBar } from './components/layout/ActivityBar';
import { Sidebar } from './components/layout/Sidebar';
import { PanelArea } from './components/layout/PanelArea';
import { StatusBar } from './components/layout/StatusBar';
import { Toolbar } from './components/layout/Toolbar';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { useGlobalKeybindings } from './hooks/useGlobalKeybindings';

export function App(): React.ReactElement {
  const tabs = useTabStore((s) => s.tabs);
  const addTab = useTabStore((s) => s.addTab);
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);

  const openCommandPalette = useCallback(() => setCommandPaletteVisible(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteVisible(false), []);

  useGlobalKeybindings({ onCommandPalette: openCommandPalette });

  useEffect(() => {
    if (tabs.length === 0) {
      window.api.terminal.create({}).then((session) => {
        addTab(session.id, session.title);
      });
    }
  }, []);

  return (
    <div className="app-container">
      <div className="app-shell">
        <ActivityBar />
        <Sidebar />
        <div className="main-stack">
          <Toolbar onCommandPalette={openCommandPalette} />
          <TabBar />
          <div className="terminal-area">
            {tabs.map((tab) => (
              <TerminalView
                key={tab.terminalSessionId}
                sessionId={tab.terminalSessionId}
                visible={tab.isActive}
              />
            ))}
          </div>
          <PanelArea />
          <StatusBar />
        </div>
      </div>
      <CommandPalette visible={commandPaletteVisible} onClose={closeCommandPalette} />
    </div>
  );
}
