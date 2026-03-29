import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SSHSessionInfo } from '@terminalmind/api';

export type SSHIndicatorState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SSHStatusIndicatorProps {
  readonly sshSessionId: string;
  readonly onReconnect?: () => void | Promise<void>;
  readonly className?: string;
  /** When set, shows host, username, and session duration (status bar). */
  readonly variant?: 'default' | 'statusBar';
}

function formatSessionDuration(connectedAt: number): string {
  const ms = Math.max(0, Date.now() - connectedAt);
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function SSHStatusIndicator({
  sshSessionId,
  onReconnect,
  className = '',
  variant = 'default',
}: SSHStatusIndicatorProps): React.ReactElement {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SSHIndicatorState>('connecting');
  const [session, setSession] = useState<SSHSessionInfo | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    void window.api.ssh.getSession(sshSessionId).then((s) => {
      if (!s) {
        setSession(null);
        setStatus('disconnected');
        return;
      }
      setSession(s);
      if (s.status === 'connected') setStatus('connected');
      else if (s.status === 'connecting') setStatus('connecting');
      else if (s.status === 'error') setStatus('error');
      else setStatus('disconnected');
    });
  }, [sshSessionId]);

  useEffect(() => {
    refresh();
    return window.api.ssh.onStatusChange((p) => {
      if ('sessionId' in p && p.sessionId === sshSessionId) {
        refresh();
      }
    });
  }, [sshSessionId, refresh]);

  useEffect(() => {
    if (variant !== 'statusBar' || status !== 'connected' || session?.connectedAt === undefined) {
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [variant, status, session?.connectedAt]);

  const dotClass =
    status === 'connected'
      ? 'ssh-status-dot ssh-status-dot--connected'
      : status === 'connecting'
        ? 'ssh-status-dot ssh-status-dot--connecting'
        : 'ssh-status-dot ssh-status-dot--disconnected';

  const hostLine = useMemo(() => {
    if (variant !== 'statusBar' || !session) return null;
    const { username, host, port } = session;
    const hostPart = port !== 22 ? `${host}:${port}` : host;
    const who = `${username}@${hostPart}`;
    if (status === 'connected' && session.connectedAt !== undefined) {
      return `${who} · ${formatSessionDuration(session.connectedAt)}`;
    }
    if (status === 'connecting') return `${who} · connecting`;
    if (status === 'error') return `${who} · error`;
    return who;
  }, [variant, session, status, tick]);

  return (
    <span className={`ssh-status-indicator ${className}`.trim()}>
      <span className={dotClass} title={t('ssh.status.title', { status })} aria-hidden />
      {variant === 'statusBar' && hostLine ? (
        <span className="ssh-status-detail">{hostLine}</span>
      ) : (
        <span className="ssh-status-label">{status}</span>
      )}
      {(status === 'disconnected' || status === 'error') && onReconnect ? (
        <button type="button" className="ssh-status-reconnect" onClick={() => void onReconnect()}>
          {t('ssh.status.reconnect')}
        </button>
      ) : null}
    </span>
  );
}
