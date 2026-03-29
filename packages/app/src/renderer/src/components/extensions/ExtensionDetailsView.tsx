import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Permission, RegistryEntry } from '@terminalmind/api';
import { PERMISSION_LABEL_KEYS, permissionIcon } from './permission-labels';

interface ExtensionDetailsViewProps {
  readonly packageName: string;
  readonly onBack: () => void;
  readonly onInstalledChange: () => void;
}

type LoadErrorKind = 'not_found' | 'load_failed' | null;

export function ExtensionDetailsView(props: ExtensionDetailsViewProps): React.ReactElement {
  const { t } = useTranslation();
  const { packageName, onBack, onInstalledChange } = props;
  const [entry, setEntry] = useState<RegistryEntry | null | undefined>(undefined);
  const [loadErrorKind, setLoadErrorKind] = useState<LoadErrorKind>(null);
  const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installedId, setInstalledId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<readonly Permission[]>([]);

  const refreshInstalledMeta = useCallback(async () => {
    const list = await window.api.extensions.list();
    const inst = list.find((x) => x.manifest.name === packageName && !x.isBuiltin);
    setInstalledId(inst ? inst.id : null);
    setPermissions(inst?.manifest.terminalmind.permissions ?? []);
  }, [packageName]);

  useEffect(() => {
    let cancelled = false;
    setEntry(undefined);
    setLoadErrorKind(null);
    setLoadErrorDetail(null);
    void window.api.marketplace
      .getDetails(packageName)
      .then((e) => {
        if (!cancelled) {
          if (!e) {
            setEntry(null);
            setLoadErrorKind('not_found');
          } else {
            setEntry(e);
            setLoadErrorKind(null);
          }
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadErrorKind('load_failed');
          setLoadErrorDetail(err.message ?? null);
          setEntry(null);
        }
      });
    void refreshInstalledMeta();
    return () => {
      cancelled = true;
    };
  }, [packageName, refreshInstalledMeta]);

  const handleInstall = useCallback(async () => {
    if (!entry) {
      return;
    }
    setBusy(true);
    try {
      await window.api.marketplace.install(entry.name, entry.version);
      await refreshInstalledMeta();
      onInstalledChange();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, [entry, onInstalledChange, refreshInstalledMeta]);

  const handleUninstall = useCallback(async () => {
    if (!installedId) {
      return;
    }
    setBusy(true);
    try {
      await window.api.marketplace.uninstall(installedId);
      await refreshInstalledMeta();
      onInstalledChange();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, [installedId, onInstalledChange, refreshInstalledMeta]);

  const handleUpdate = useCallback(async () => {
    if (!installedId) {
      return;
    }
    setBusy(true);
    try {
      await window.api.marketplace.update(installedId);
      await refreshInstalledMeta();
      onInstalledChange();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, [installedId, onInstalledChange, refreshInstalledMeta]);

  const errorMessage =
    loadErrorKind === 'not_found'
      ? t('extensions.details.notFound')
      : loadErrorKind === 'load_failed'
        ? [t('extensions.details.loadError'), loadErrorDetail].filter(Boolean).join(': ')
        : t('extensions.details.notFoundShort');

  if (entry === undefined && !loadErrorKind) {
    return (
      <div className="extension-details">
        <button type="button" className="extension-details-back" onClick={onBack}>
          {t('common.back')}
        </button>
        <div className="marketplace-loading">{t('extensions.details.loading')}</div>
      </div>
    );
  }

  if (loadErrorKind || !entry) {
    return (
      <div className="extension-details">
        <button type="button" className="extension-details-back" onClick={onBack}>
          {t('common.back')}
        </button>
        <div className="marketplace-error">{errorMessage}</div>
      </div>
    );
  }

  return (
    <div className="extension-details">
      <button type="button" className="extension-details-back" onClick={onBack}>
        {t('common.back')}
      </button>
      <h2 className="extension-details-title">{entry.displayName}</h2>
      <div className="extension-details-meta">
        <span>{entry.name}</span>
        <span className="extension-details-version">v{entry.version}</span>
      </div>
      <p className="extension-details-author">{t('extensions.marketplace.byAuthor', { author: entry.author })}</p>
      <p className="extension-details-desc">{entry.description}</p>

      <section className="extension-details-section">
        <h3 className="extension-details-section-title">{t('extensions.details.currentVersion')}</h3>
        <p className="extension-details-version-line">{entry.version}</p>
      </section>

      <section className="extension-details-section">
        <h3 className="extension-details-section-title">{t('extensions.details.permissionsRequired')}</h3>
        {permissions.length === 0 ? (
          <p className="extension-details-muted">
            {installedId
              ? t('extensions.details.noPermissions')
              : t('extensions.details.installToSee')}
          </p>
        ) : (
          <ul className="extension-details-perms">
            {permissions.map((p) => (
              <li key={p} className="extension-details-perm">
                <span className="extension-details-perm-icon" aria-hidden>
                  {permissionIcon(p)}
                </span>
                <div>
                  <div className="extension-details-perm-id">{p}</div>
                  <div className="extension-details-perm-desc">{t(PERMISSION_LABEL_KEYS[p])}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="extension-details-actions">
        {installedId ? (
          <>
            <button type="button" className="marketplace-btn secondary" disabled={busy} onClick={handleUpdate}>
              {t('extensions.details.update')}
            </button>
            <button type="button" className="marketplace-btn danger" disabled={busy} onClick={handleUninstall}>
              {t('extensions.details.uninstall')}
            </button>
          </>
        ) : (
          <button type="button" className="marketplace-btn primary" disabled={busy} onClick={handleInstall}>
            {t('extensions.details.install')}
          </button>
        )}
      </div>
    </div>
  );
}
