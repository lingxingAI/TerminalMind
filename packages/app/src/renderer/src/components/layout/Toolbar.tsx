import React from 'react';

export function Toolbar(): React.ReactElement {
  return (
    <div className="toolbar">
      <div className="app-brand">
        <span className="brand-text">Terminal</span><span className="brand-highlight">Mind</span><span className="brand-prompt">&gt;</span><span className="brand-cursor">_</span>
      </div>
      <div style={{ flex: 1 }} />
      <div className="toolbar-controls">
        <button className="window-control" onClick={() => window.api.commands.execute('window.minimize')}>
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>remove</span>
        </button>
        <button className="window-control" onClick={() => window.api.commands.execute('window.maximize')}>
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>crop_square</span>
        </button>
        <button className="window-control close" onClick={() => window.api.commands.execute('window.close')}>
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>
    </div>
  );
}
