import React from 'react';
import { useLayoutStore } from '../../stores/layout-store';

const ITEMS = [
  { id: 'terminal', label: 'Terminal', icon: '>_' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'connections', label: 'Connections', icon: '🔌' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'ai', label: 'AI', icon: '✨' },
  { id: 'extensions', label: 'Extensions', icon: '🧩' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
] as const;

export function ActivityBar(): React.ReactElement {
  const activeItem = useLayoutStore((s) => s.activeActivityBarItem);
  const setActive = useLayoutStore((s) => s.setActiveActivityBarItem);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);

  const handleClick = (id: string) => {
    if (activeItem === id) {
      toggleSidebar();
    } else {
      setActive(id);
    }
  };

  return (
    <div className="activity-bar">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={`activity-bar-item ${activeItem === item.id ? 'active' : ''}`}
          onClick={() => handleClick(item.id)}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
