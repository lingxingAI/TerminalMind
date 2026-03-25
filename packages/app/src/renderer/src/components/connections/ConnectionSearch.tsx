import React from 'react';
import { useConnectionStore } from '../../stores/connection-store';

export function ConnectionSearch(): React.ReactElement {
  const searchQuery = useConnectionStore((s) => s.searchQuery);
  const setSearchQuery = useConnectionStore((s) => s.setSearchQuery);

  return (
    <div className="connection-search">
      <input
        type="search"
        className="connection-search-input"
        placeholder="Search connections…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search connections"
      />
      {searchQuery.length > 0 ? (
        <button
          type="button"
          className="connection-search-clear"
          onClick={() => setSearchQuery('')}
          title="Clear"
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
