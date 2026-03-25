import React, { useCallback, useEffect, useState } from 'react';
import type { InstalledExtension } from '@terminalmind/api';

export function InstalledExtensionsPanel(): React.ReactElement {
  const [list, setList] = useState<InstalledExtension[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await window.api.extensions.list();
      setList(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list extensions');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return window.api.extensions.onExtensionStateChanged(() => void refresh());
  }, [refresh]);

  const openFolder = useCallback(() => {
    void window.api.commands.execute('extensions.openDirectory');
  }, []);

  const toggle = useCallback(
    async (ext: InstalledExtension) => {
      if (ext.isBuiltin) {
        return;
      }
      setBusyId(ext.id);
      try {
        if (ext.enabled) {
          await window.api.extensions.disable(ext.id);
        } else {
          await window.api.extensions.enable(ext.id);
        }
        await refresh();
      } catch (e) {
        console.error(e);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const uninstall = useCallback(
    async (ext: InstalledExtension) => {
      if (ext.isBuiltin) {
        return;
      }
      setBusyId(ext.id);
      try {
        await window.api.marketplace.uninstall(ext.manifest.name);
        await refresh();
      } catch (e) {
        console.error(e);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const checkUpdate = useCallback(
    async (ext: InstalledExtension) => {
      if (ext.isBuiltin) {
        return;
      }
      setBusyId(ext.id);
      try {
        await window.api.marketplace.update(ext.manifest.name);
        await refresh();
      } catch (e) {
        console.error(e);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const builtins = list.filter((x) => x.isBuiltin);
  const user = list.filter((x) => !x.isBuiltin);

  return (
    <div className="installed-extensions-panel">
      <div className="installed-extensions-toolbar">
        <button type="button" className="marketplace-link-btn" onClick={openFolder}>
          Open extensions folder
        </button>
      </div>
      {error ? <div className="marketplace-error installed-extensions-error">{error}</div> : null}

      <section className="installed-extensions-section">
        <h3 className="installed-extensions-section-title">Built-in</h3>
        <ul className="installed-extensions-list">
          {builtins.map((ext) => (
            <li key={ext.id} className="installed-extensions-row">
              <div className="installed-extensions-info">
                <div className="installed-extensions-name">{ext.manifest.displayName ?? ext.manifest.name}</div>
                <div className="installed-extensions-meta">
                  {ext.manifest.name} · v{ext.manifest.version}
                </div>
              </div>
              <span className="marketplace-badge muted">Built-in</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="installed-extensions-section">
        <h3 className="installed-extensions-section-title">Installed</h3>
        {user.length === 0 ? (
          <p className="marketplace-muted">No marketplace extensions installed.</p>
        ) : (
          <ul className="installed-extensions-list">
            {user.map((ext) => (
              <li key={ext.id} className="installed-extensions-row">
                <div className="installed-extensions-info">
                  <div className="installed-extensions-name">{ext.manifest.displayName ?? ext.manifest.name}</div>
                  <div className="installed-extensions-meta">
                    {ext.manifest.name} · v{ext.manifest.version}
                  </div>
                </div>
                <label className="installed-extensions-toggle">
                  <input
                    type="checkbox"
                    checked={ext.enabled}
                    disabled={busyId === ext.id}
                    onChange={() => void toggle(ext)}
                  />
                  <span>{ext.enabled ? 'On' : 'Off'}</span>
                </label>
                <button
                  type="button"
                  className="marketplace-btn small secondary"
                  disabled={busyId === ext.id}
                  onClick={() => void checkUpdate(ext)}
                >
                  Check updates
                </button>
                <button
                  type="button"
                  className="marketplace-btn small danger"
                  disabled={busyId === ext.id}
                  onClick={() => void uninstall(ext)}
                >
                  Uninstall
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
