import React, { useState } from 'react';
import { useLayoutStore } from '../../stores/layout-store';
import { TransferQueue } from '../sftp/TransferQueue';

const PANEL_TABS = ['AI Chat', 'Output', 'Problems', 'Transfers'] as const;

export function PanelArea(): React.ReactElement {
  const visible = useLayoutStore((s) => s.panelVisible);
  const height = useLayoutStore((s) => s.panelHeight);
  const [activeTab, setActiveTab] = useState(0);

  if (!visible) return <></>;

  return (
    <div className="panel-area" style={{ height }}>
      <div className="panel-tabs">
        {PANEL_TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            className={`panel-tab ${i === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {activeTab === 3 ? (
          <TransferQueue />
        ) : (
          <span className="sidebar-placeholder">Panel content placeholder</span>
        )}
      </div>
    </div>
  );
}
