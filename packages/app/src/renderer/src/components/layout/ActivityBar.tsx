import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layout-store';

const ITEMS = [
  { id: 'connections', labelKey: 'layout.connections', icon: 'dns' },
  { id: 'files', labelKey: 'layout.files', icon: 'folder' },
  { id: 'extensions', labelKey: 'layout.extensions', icon: 'extension' },
] as const;

export function ActivityBar(): React.ReactElement {
  const { t } = useTranslation();
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
          className={`ab-btn ${activeItem === item.id ? 'active' : ''}`}
          onClick={() => handleClick(item.id)}
          title={t(item.labelKey)}
        >
          <span className="material-symbols-rounded">{item.icon}</span>
        </button>
      ))}
      <div className="ab-spacer" />
      <button
        className={`ab-btn ${activeItem === 'settings' ? 'active' : ''}`}
        onClick={() => handleClick('settings')}
        title={t('layout.settings')}
      >
        <span className="material-symbols-rounded">settings</span>
      </button>
    </div>
  );
}
