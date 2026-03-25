import React from 'react';
import { useLayoutStore } from '../../stores/layout-store';

const PANEL_TABS = ['AI Chat', 'Output', 'Problems'] as const;

export function PanelArea(): React.ReactElement {
  const visible = useLayoutStore((s) => s.panelVisible);
  const height = useLayoutStore((s) => s.panelHeight);

  if (!visible) return <></>;

  return (
    <div className="panel-area" style={{ height }}>
      <div className="panel-tabs">
        {PANEL_TABS.map((t, i) => (
          <button key={t} className={`panel-tab ${i === 0 ? 'active' : ''}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="panel-body">
        <span className="sidebar-placeholder">Panel content placeholder</span>
      </div>
    </div>
  );
}
