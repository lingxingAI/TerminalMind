import React, { useState } from 'react';
import { MarketplacePanel } from './MarketplacePanel';
import { InstalledExtensionsPanel } from './InstalledExtensionsPanel';

type ExtTab = 'marketplace' | 'installed';

export function ExtensionsSidebarPanel(): React.ReactElement {
  const [tab, setTab] = useState<ExtTab>('marketplace');

  return (
    <div className="extensions-sidebar-panel">
      <div className="extensions-sidebar-top">
        <div className="extensions-sidebar-tabs">
          <button
            type="button"
            className={`extensions-sidebar-tab ${tab === 'marketplace' ? 'active' : ''}`}
            onClick={() => setTab('marketplace')}
          >
            Marketplace
          </button>
          <button
            type="button"
            className={`extensions-sidebar-tab ${tab === 'installed' ? 'active' : ''}`}
            onClick={() => setTab('installed')}
          >
            Installed
          </button>
        </div>
      </div>
      <div className="extensions-sidebar-content">
        {tab === 'marketplace' ? <MarketplacePanel /> : <InstalledExtensionsPanel />}
      </div>
    </div>
  );
}
