import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFuzzySearch } from './use-fuzzy-search';

interface CommandPaletteProps {
  visible: boolean;
  onClose: () => void;
}

export function CommandPalette({ visible, onClose }: CommandPaletteProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useFuzzySearch(query);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const last = Math.max(0, results.length - 1);
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, last));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = results[selectedIndex];
        if (cmd) {
          window.api.commands.execute(cmd.id);
          onClose();
        }
      }
    },
    [results, selectedIndex, onClose],
  );

  if (!visible) return null;

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmd-palette-input">
          <span className="material-symbols-rounded">search</span>
          <input
            ref={inputRef}
            type="text"
            placeholder={t('commandPalette.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="cmd-palette-list">
          {results.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`cmd-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => {
                window.api.commands.execute(cmd.id);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="material-symbols-rounded">
                {cmd.category === 'SSH' ? 'cloud' : cmd.category === 'Terminal' ? 'terminal' : cmd.category === 'AI' ? 'smart_toy' : 'settings'}
              </span>
              <span className="cmd-label">{cmd.title}</span>
              <span className="cmd-category">{cmd.category}</span>
            </div>
          ))}
          {results.length === 0 && query && (
            <div className="sidebar-placeholder" style={{ padding: '20px 0' }}>
              {t('commandPalette.noResults')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
