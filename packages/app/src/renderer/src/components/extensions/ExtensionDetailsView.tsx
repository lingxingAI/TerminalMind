import React, { useCallback, useEffect, useState } from 'react';
import type { Permission, RegistryEntry } from '@terminalmind/api';
import { PERMISSION_DESCRIPTIONS, permissionIcon } from './permission-labels';

interface ExtensionDetailsViewProps {
  readonly packageName: string;
  readonly onBack: () => void;
  readonly onInstalledChange: () => void;
}

export function ExtensionDetailsView(props: ExtensionDetailsViewProps): React.ReactElement {
  const { packageName, onBack, onInstalledChange } = props;
  const [entry, setEntry] = useState<RegistryEntry | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
    void window.api.marketplace
      .getDetails(packageName)
      .then((e) => {
        if (!cancelled) {
          setEntry(e);
          if (!e) {
            setLoadError('Extension not found');
          }
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message ?? 'Failed to load details');
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

  if (entry === undefined && !loadError) {
    return (
      <div className="extension-details">
        <button type="button" className="extension-details-back" onClick={onBack}>
          ← Back
        </button>
        <div className="marketplace-loading">Loading…</div>
      </div>
    );
  }

  if (loadError || !entry) {
    return (
      <div className="extension-details">
        <button type="button" className="extension-details-back" onClick={onBack}>
          ← Back
        </button>
        <div className="marketplace-error">{loadError ?? 'Not found'}</div>
      </div>
    );
  }

  return (
    <div className="extension-details">
      <button type="button" className="extension-details-back" onClick={onBack}>
        ← Back
      </button>
      <h2 className="extension-details-title">{entry.displayName}</h2>
      <div className="extension-details-meta">
        <span>{entry.name}</span>
        <span className="extension-details-version">v{entry.version}</span>
      </div>
      <p className="extension-details-author">by {entry.author}</p>
      <p className="extension-details-desc">{entry.description}</p>

      <section className="extension-details-section">
        <h3 className="extension-details-section-title">Current version</h3>
        <p className="extension-details-version-line">{entry.version}</p>
      </section>

      <section className="extension-details-section">
        <h3 className="extension-details-section-title">Permissions required</h3>
        {permissions.length === 0 ? (
          <p className="extension-details-muted">
            {installedId
              ? 'This extension does not declare permissions in its manifest.'
              : 'Install the extension to see declared permissions.'}
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
                  <div className="extension-details-perm-desc">{PERMISSION_DESCRIPTIONS[p]}</div>
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
              Update
            </button>
            <button type="button" className="marketplace-btn danger" disabled={busy} onClick={handleUninstall}>
              Uninstall
            </button>
          </>
        ) : (
          <button type="button" className="marketplace-btn primary" disabled={busy} onClick={handleInstall}>
            Install
          </button>
        )}
      </div>
    </div>
  );
}
