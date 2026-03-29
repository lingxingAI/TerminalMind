import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connection-store';

export function ConnectionSearch(): React.ReactElement {
  const { t } = useTranslation();
  const searchQuery = useConnectionStore((s) => s.searchQuery);
  const setSearchQuery = useConnectionStore((s) => s.setSearchQuery);

  return (
    <div className="connection-search">
      <input
        type="search"
        className="connection-search-input"
        placeholder={t('connections.search.placeholder')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label={t('connections.search.placeholder')}
      />
      {searchQuery.length > 0 ? (
        <button
          type="button"
          className="connection-search-clear"
          onClick={() => setSearchQuery('')}
          title={t('connections.search.clear')}
          aria-label={t('connections.search.clear')}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
