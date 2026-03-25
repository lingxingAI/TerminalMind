import React from 'react';

interface ToolbarProps {
  onCommandPalette: () => void;
}

export function Toolbar({ onCommandPalette }: ToolbarProps): React.ReactElement {
  return (
    <div className="toolbar">
      <div className="toolbar-drag" />
      <button className="toolbar-search" onClick={onCommandPalette}>
        Search commands...
      </button>
      <div className="toolbar-controls">
        <button className="window-control" onClick={() => window.api.commands.execute('window.minimize')}>─</button>
        <button className="window-control" onClick={() => window.api.commands.execute('window.maximize')}>□</button>
        <button className="window-control close" onClick={() => window.api.commands.execute('window.close')}>×</button>
      </div>
    </div>
  );
}
