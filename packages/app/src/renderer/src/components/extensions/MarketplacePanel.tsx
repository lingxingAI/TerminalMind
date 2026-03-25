import React, { useCallback, useEffect, useState } from 'react';
import type { InstallProgress, RegistryEntry } from '@terminalmind/api';
import { ExtensionDetailsView } from './ExtensionDetailsView';

function Spinner(): React.ReactElement {
  return <div className="marketplace-spinner" aria-hidden />;
}

export function MarketplacePanel(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly RegistryEntry[]>([]);
  const [detailsName, setDetailsName] = useState<string | null>(null);
  const [installedNames, setInstalledNames] = useState<ReadonlySet<string>>(new Set());
  const [progressByExt, setProgressByExt] = useState<Readonly<Record<string, InstallProgress>>>({});

  const refreshInstalledNames = useCallback(async () => {
    const list = await window.api.extensions.list();
    setInstalledNames(
      new Set(list.filter((e) => !e.isBuiltin).map((e) => e.manifest.name)),
    );
  }, []);

  useEffect(() => {
    void refreshInstalledNames();
  }, [refreshInstalledNames]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void window.api.marketplace
      .search(debounced, 1)
      .then((r) => {
        if (!cancelled) {
          setResults(r.entries);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message ?? 'Failed to load extensions');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    return window.api.marketplace.onInstallProgress((p) => {
      setProgressByExt((prev) => ({ ...prev, [p.extensionId]: p }));
      if (p.phase === 'done' || p.phase === 'error') {
        window.setTimeout(() => {
          setProgressByExt((prev) => {
            const next = { ...prev };
            delete next[p.extensionId];
            return next;
          });
        }, 2500);
        if (p.phase === 'done') {
          void refreshInstalledNames();
        }
      }
    });
  }, [refreshInstalledNames]);

  const activeProgress = Object.values(progressByExt);

  if (detailsName) {
    return (
      <div className="marketplace-panel">
        <ExtensionDetailsView
          packageName={detailsName}
          onBack={() => setDetailsName(null)}
          onInstalledChange={() => void refreshInstalledNames()}
        />
      </div>
    );
  }

  return (
    <div className="marketplace-panel">
      <div className="marketplace-search-row">
        <input
          type="search"
          className="marketplace-search-input"
          placeholder="Search extensions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search marketplace"
        />
      </div>

      {activeProgress.length > 0 ? (
        <div className="marketplace-progress-banner" role="status">
          {activeProgress.map((p) => (
            <div key={p.extensionId} className="marketplace-progress-line">
              <span className="marketplace-progress-label">
                {p.extensionId} — {p.phase}
                {p.error ? `: ${p.error}` : ''}
              </span>
              <div className="marketplace-progress-bar">
                <div className="marketplace-progress-fill" style={{ width: `${p.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="marketplace-center">
          <Spinner />
        </div>
      ) : error ? (
        <div className="marketplace-center marketplace-error">Failed to load extensions</div>
      ) : results.length === 0 ? (
        <div className="marketplace-center marketplace-muted">No extensions found</div>
      ) : (
        <ul className="marketplace-results">
          {results.map((e) => {
            const installed = installedNames.has(e.name);
            return (
              <li key={e.name} className="marketplace-card">
                <button
                  type="button"
                  className="marketplace-card-main"
                  onClick={() => setDetailsName(e.name)}
                >
                  <div className="marketplace-card-title-row">
                    <span className="marketplace-card-title">{e.displayName}</span>
                    <span className="marketplace-card-version">v{e.version}</span>
                  </div>
                  <div className="marketplace-card-sub">{e.name}</div>
                  <p className="marketplace-card-desc">{e.description}</p>
                  <div className="marketplace-card-footer">
                    <span>{e.author}</span>
                    <span>{(e.downloads ?? 0).toLocaleString()} downloads</span>
                  </div>
                </button>
                <div className="marketplace-card-actions">
                  {installed ? (
                    <span className="marketplace-badge">Installed</span>
                  ) : (
                    <button
                      type="button"
                      className="marketplace-btn small primary"
                      onClick={() => void window.api.marketplace.install(e.name, e.version)}
                    >
                      Install
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
