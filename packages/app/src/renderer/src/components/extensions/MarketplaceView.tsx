import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstallProgress, RegistryEntry } from '@terminalmind/api';
import { ExtensionDetailsView } from './ExtensionDetailsView';

const TAG_IDS = ['all', 'devops', 'monitoring', 'themes', 'database', 'cloud', 'ai'] as const;
const TAG_SEARCH_TERMS: Record<string, string> = {
  all: '', devops: 'DevOps', monitoring: 'Monitoring', themes: 'Themes',
  database: 'Database', cloud: 'Cloud', ai: 'AI',
};

export function MarketplaceView(): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('all');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly RegistryEntry[]>([]);
  const [detailsName, setDetailsName] = useState<string | null>(null);
  const [installedNames, setInstalledNames] = useState<ReadonlySet<string>>(new Set());
  const [progressByExt, setProgressByExt] = useState<Readonly<Record<string, InstallProgress>>>({});

  const refreshInstalledNames = useCallback(async () => {
    try {
      const list = await window.api.extensions.list();
      setInstalledNames(new Set(list.filter((e) => !e.isBuiltin).map((e) => e.manifest.name)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { void refreshInstalledNames(); }, [refreshInstalledNames]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const tagTerm = TAG_SEARCH_TERMS[activeTag] ?? '';
    const searchQuery = tagTerm ? `${debounced} ${tagTerm}`.trim() : debounced;
    void window.api.marketplace
      .search(searchQuery, 1)
      .then((r) => { if (!cancelled) setResults(r.entries); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, activeTag]);

  useEffect(() => {
    return window.api.marketplace.onInstallProgress((p) => {
      setProgressByExt((prev) => ({ ...prev, [p.extensionId]: p }));
      if (p.phase === 'done' || p.phase === 'error') {
        window.setTimeout(() => {
          setProgressByExt((prev) => { const next = { ...prev }; delete next[p.extensionId]; return next; });
        }, 2500);
        if (p.phase === 'done') void refreshInstalledNames();
      }
    });
  }, [refreshInstalledNames]);

  if (detailsName) {
    return (
      <div className="marketplace" style={{ background: 'var(--bg-deep)' }}>
        <ExtensionDetailsView
          packageName={detailsName}
          onBack={() => setDetailsName(null)}
          onInstalledChange={() => void refreshInstalledNames()}
        />
      </div>
    );
  }

  return (
    <div className="marketplace">
      <h1>{t('extensions.marketplace.heroTitle')}</h1>
      <div className="mp-subtitle">{t('extensions.marketplace.heroSubtitle')}</div>
      <div className="mp-search">
        <input
          type="text"
          placeholder={t('extensions.marketplace.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="mp-tags">
        {TAG_IDS.map((tagId) => (
          <button
            key={tagId}
            className={`mp-tag ${activeTag === tagId ? 'active' : ''}`}
            onClick={() => setActiveTag(tagId)}
          >
            {t(`extensions.tags.${tagId}`)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="sidebar-placeholder" style={{ padding: '40px 0' }}>{t('extensions.marketplace.loading')}</div>
      ) : error ? (
        <div className="sidebar-placeholder" style={{ padding: '40px 0', color: 'var(--red)' }}>{error}</div>
      ) : results.length === 0 ? (
        <div className="sidebar-placeholder" style={{ padding: '40px 0' }}>{t('extensions.marketplace.empty')}</div>
      ) : (
        <div className="mp-grid">
          {results.map((ext) => {
            const installed = installedNames.has(ext.name);
            const progress = progressByExt[ext.name];
            return (
              <div key={ext.name} className="mp-card" onClick={() => setDetailsName(ext.name)}>
                <div className="mp-card-header">
                  <div className="mp-card-icon docker">
                    <span className="material-symbols-rounded">extension</span>
                  </div>
                  <div className="mp-card-info">
                    <h3>{ext.displayName}</h3>
                    <div className="author">{t('extensions.marketplace.byAuthor', { author: ext.author })}</div>
                  </div>
                </div>
                <div className="mp-card-desc">{ext.description}</div>
                <div className="mp-card-footer">
                  <div className="stats">
                    <span>
                      <span className="material-symbols-rounded">download</span>
                      {((ext.downloads ?? 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                  {progress ? (
                    <span style={{ fontSize: 11, color: 'var(--accent)' }}>{progress.phase}...</span>
                  ) : installed ? (
                    <button className="mp-install-btn installed" onClick={(e) => e.stopPropagation()}>{t('extensions.marketplace.installed')}</button>
                  ) : (
                    <button
                      className="mp-install-btn"
                      onClick={(e) => { e.stopPropagation(); void window.api.marketplace.install(ext.name, ext.version); }}
                    >
                      {t('extensions.marketplace.install')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
