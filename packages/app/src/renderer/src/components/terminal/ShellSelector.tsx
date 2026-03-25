import React, { useEffect, useState, useCallback } from 'react';
import type { ShellInfo } from '@terminalmind/api';

interface ShellSelectorProps {
  onSelect: (shell: ShellInfo) => void;
  onCancel: () => void;
}

export function ShellSelector({ onSelect, onCancel }: ShellSelectorProps): React.ReactElement {
  const [shells, setShells] = useState<readonly ShellInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    window.api.shell.discover().then((found) => {
      setShells(found);
      const defIdx = found.findIndex((s) => s.isDefault);
      if (defIdx >= 0) setSelectedIndex(defIdx);
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const last = Math.max(0, shells.length - 1);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, last));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (shells[selectedIndex]) onSelect(shells[selectedIndex]);
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [shells, selectedIndex, onSelect, onCancel],
  );

  return (
    <div className="shell-selector-overlay" onKeyDown={handleKeyDown} tabIndex={0} autoFocus>
      <div className="shell-selector">
        <div className="shell-selector-header">Select Shell</div>
        <div className="shell-selector-list">
          {shells.map((shell, i) => (
            <div
              key={shell.id}
              className={`shell-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => onSelect(shell)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="shell-name">{shell.name}</span>
              <span className="shell-path">{shell.path}</span>
              {shell.isDefault && <span className="shell-default">default</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
