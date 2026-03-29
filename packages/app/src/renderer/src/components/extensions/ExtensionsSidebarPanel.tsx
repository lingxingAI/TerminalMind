import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketplacePanel } from './MarketplacePanel';
import { InstalledExtensionsPanel } from './InstalledExtensionsPanel';

type ExtTab = 'marketplace' | 'installed';

export function ExtensionsSidebarPanel(): React.ReactElement {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ExtTab>('marketplace');

  return (
    <div className="extensions-sidebar">
      <div className="sidebar-header">
        <h2>{t('extensions.sidebar.title')}</h2>
      </div>
      <div className="extensions-tabs">
        <button
          type="button"
          className={`extensions-tab ${tab === 'marketplace' ? 'active' : ''}`}
          onClick={() => setTab('marketplace')}
        >
          {t('extensions.sidebar.marketplace')}
        </button>
        <button
          type="button"
          className={`extensions-tab ${tab === 'installed' ? 'active' : ''}`}
          onClick={() => setTab('installed')}
        >
          {t('extensions.sidebar.installed')}
        </button>
      </div>
      <div className="extensions-content">
        {tab === 'marketplace' ? <MarketplacePanel /> : <InstalledExtensionsPanel />}
      </div>
    </div>
  );
}
