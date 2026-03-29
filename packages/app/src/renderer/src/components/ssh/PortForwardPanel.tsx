import type { PortForwardInfo } from '@terminalmind/api';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PortForwardPanelProps {
  readonly sshSessionId: string;
}

export function PortForwardPanel({ sshSessionId }: PortForwardPanelProps): React.ReactElement {
  const { t } = useTranslation();
  const [forwards, setForwards] = useState<readonly PortForwardInfo[]>([]);
  const [localPort, setLocalPort] = useState('');
  const [remoteHost, setRemoteHost] = useState('127.0.0.1');
  const [remotePort, setRemotePort] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void window.api.ssh.listForwards(sshSessionId).then(setForwards);
  }, [sshSessionId]);

  useEffect(() => {
    reload();
    return window.api.ssh.onStatusChange((p) => {
      if ('sessionId' in p && p.sessionId === sshSessionId) {
        reload();
      }
    });
  }, [sshSessionId, reload]);

  const addForward = useCallback(async () => {
    setFormError(null);
    const lp = Number.parseInt(localPort, 10);
    const rp = Number.parseInt(remotePort, 10);
    if (!Number.isFinite(lp) || lp < 1 || lp > 65535) {
      setFormError(t('ssh.portForward.errorLocalPort'));
      return;
    }
    if (!Number.isFinite(rp) || rp < 1 || rp > 65535) {
      setFormError(t('ssh.portForward.errorRemotePort'));
      return;
    }
    if (!remoteHost.trim()) {
      setFormError(t('ssh.portForward.errorRemoteHost'));
      return;
    }
    setBusy(true);
    try {
      await window.api.ssh.forwardPort({
        sessionId: sshSessionId,
        localHost: '127.0.0.1',
        localPort: lp,
        remoteHost: remoteHost.trim(),
        remotePort: rp,
      });
      setLocalPort('');
      setRemotePort('');
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sshSessionId, localPort, remoteHost, remotePort, reload, t]);

  const closeForward = useCallback(
    async (forwardId: string) => {
      setBusy(true);
      try {
        await window.api.ssh.closeForward(sshSessionId, forwardId);
        reload();
      } finally {
        setBusy(false);
      }
    },
    [sshSessionId, reload],
  );

  return (
    <div className="ssh-port-forward-panel">
      <div className="ssh-port-forward-header">{t('ssh.portForward.title')}</div>
      <ul className="ssh-port-forward-list">
        {forwards.length === 0 ? (
          <li className="ssh-port-forward-empty">{t('ssh.portForward.empty')}</li>
        ) : (
          forwards.map((f) => (
            <li key={f.id} className="ssh-port-forward-row">
              <span className="ssh-port-forward-desc">
                {f.localHost}:{f.localPort} → {f.remoteHost}:{f.remotePort}
              </span>
              <button
                type="button"
                className="ssh-port-forward-close"
                disabled={busy}
                onClick={() => void closeForward(f.id)}
                aria-label={t('ssh.portForward.closeAria')}
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="ssh-port-forward-form">
        <div className="ssh-port-forward-fields">
          <label className="ssh-port-forward-label">
            {t('ssh.portForward.local')}
            <input
              className="ssh-port-forward-input"
              type="number"
              placeholder={t('ssh.portForward.port')}
              value={localPort}
              onChange={(e) => setLocalPort(e.target.value)}
              min={1}
              max={65535}
            />
          </label>
          <span className="ssh-port-forward-arrow">→</span>
          <label className="ssh-port-forward-label">
            {t('ssh.portForward.remoteHost')}
            <input
              className="ssh-port-forward-input ssh-port-forward-input--host"
              type="text"
              value={remoteHost}
              onChange={(e) => setRemoteHost(e.target.value)}
            />
          </label>
          <label className="ssh-port-forward-label">
            {t('ssh.portForward.port')}
            <input
              className="ssh-port-forward-input"
              type="number"
              placeholder={t('ssh.portForward.port')}
              value={remotePort}
              onChange={(e) => setRemotePort(e.target.value)}
              min={1}
              max={65535}
            />
          </label>
        </div>
        {formError ? <div className="ssh-port-forward-error">{formError}</div> : null}
        <button type="button" className="ssh-port-forward-add" disabled={busy} onClick={() => void addForward()}>
          {t('ssh.portForward.add')}
        </button>
      </div>
    </div>
  );
}
