import React from 'react';
import { useTabStore } from '../../stores/tab-store';
import { SSHStatusIndicator } from '../ssh/SSHStatusIndicator';

export function StatusBar(): React.ReactElement {
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.isActive));

  return (
    <div className="status-bar">
      <div className="status-left">
        {activeTab && (
          <>
            {activeTab.connectionType === 'ssh' && activeTab.sshSessionId ? (
              <SSHStatusIndicator
                sshSessionId={activeTab.sshSessionId}
                variant="statusBar"
                className="status-ssh-indicator"
              />
            ) : (
              <span className="status-item" style={{ color: 'var(--green)' }}>●</span>
            )}
            <span className="status-item">{activeTab.title}</span>
          </>
        )}
      </div>
      <div className="status-right">
        <span className="status-item">UTF-8</span>
        <span className="status-item">v0.1.0</span>
      </div>
    </div>
  );
}
