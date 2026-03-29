import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabStore } from '../../stores/tab-store';
import { useLayoutStore } from '../../stores/layout-store';
import { useSftpBrowserStore } from '../../stores/sftp-browser-store';
import { useRemoteMetrics } from '../../hooks/useRemoteMetrics';
import { useTransferStats, formatSpeed } from '../../hooks/useTransferSpeed';

function useAiModelName(): string {
  const [model, setModel] = useState('');
  useEffect(() => {
    let cancelled = false;
    window.api.ai.getSettings().then((s) => {
      if (!cancelled) setModel(s.defaultModel || '');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return model;
}

type SshLiveStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

function useSshLiveStatus(sshSessionId: string | undefined): SshLiveStatus {
  const [status, setStatus] = useState<SshLiveStatus>('disconnected');

  useEffect(() => {
    if (!sshSessionId) {
      setStatus('disconnected');
      return;
    }

    let cancelled = false;

    const refresh = () => {
      window.api.ssh.getSession(sshSessionId).then((s) => {
        if (!cancelled) setStatus(s?.status ?? 'disconnected');
      }).catch(() => {
        if (!cancelled) setStatus('disconnected');
      });
    };

    refresh();
    const off = window.api.ssh.onStatusChange(() => refresh());
    return () => { cancelled = true; off(); };
  }, [sshSessionId]);

  return status;
}

function useShellName(terminalSessionId: string | undefined): string {
  const [shell, setShell] = useState('');

  useEffect(() => {
    if (!terminalSessionId) {
      setShell('');
      return;
    }
    let cancelled = false;
    window.api.terminal.getSession(terminalSessionId).then((info) => {
      if (cancelled || !info) return;
      const path = info.shellPath || '';
      if (path.startsWith('ssh://')) {
        setShell('ssh');
        return;
      }
      const name = path.replace(/\\/g, '/').split('/').pop() || '';
      setShell(name.replace(/\.exe$/i, '') || 'shell');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [terminalSessionId]);

  return shell;
}

function useRemoteCharset(sshSessionId: string | undefined): string {
  const [charset, setCharset] = useState('UTF-8');
  const fetched = useRef(false);

  useEffect(() => {
    if (!sshSessionId) {
      setCharset('UTF-8');
      fetched.current = false;
      return;
    }
    if (fetched.current) return;
    fetched.current = true;

    window.api.ssh.exec(sshSessionId, 'locale charmap 2>/dev/null || echo UTF-8').then((r) => {
      const val = r.stdout.trim();
      if (val) setCharset(val);
    }).catch(() => {});
  }, [sshSessionId]);

  return charset;
}

function metricColor(value: number | null, warnAt = 70, critAt = 90): string {
  if (value === null) return '';
  if (value >= critAt) return 'red';
  if (value >= warnAt) return 'orange';
  return '';
}

const sshStatusConfig: Record<SshLiveStatus, { cls: string; icon: string; labelKey: string }> = {
  connected: { cls: 'green', icon: 'cloud_done', labelKey: 'statusBar.sshConnected' },
  connecting: { cls: 'orange', icon: 'cloud_sync', labelKey: 'statusBar.connecting' },
  disconnected: { cls: 'dim', icon: 'cloud_off', labelKey: 'statusBar.disconnected' },
  error: { cls: 'red', icon: 'error', labelKey: 'statusBar.sshError' },
};

function TerminalStatus(): React.ReactElement {
  const { t } = useTranslation();
  const activeTab = useTabStore((s) => s.tabs.find((tab) => tab.isActive));
  const sshSessionId = activeTab?.connectionType === 'ssh' ? activeTab.sshSessionId : undefined;
  const isSSH = activeTab?.connectionType === 'ssh';

  const sshStatus = useSshLiveStatus(sshSessionId);
  const shellName = useShellName(activeTab?.terminalSessionId);
  const charset = useRemoteCharset(sshSessionId);
  const metrics = useRemoteMetrics(sshSessionId);
  const aiModel = useAiModelName();

  const sc = isSSH ? sshStatusConfig[sshStatus] : null;

  return (
    <>
      <div className="sb-left">
        {isSSH && sc ? (
          <div className={`sb-item ${sc.cls}`}>
            <span className="material-symbols-rounded">{sc.icon}</span>
            {t(sc.labelKey)}
          </div>
        ) : (
          <div className="sb-item accent">
            <span className="material-symbols-rounded">laptop</span>
            {t('statusBar.local')}
          </div>
        )}
        {shellName && (
          <div className="sb-item">
            <span className="material-symbols-rounded">terminal</span>
            {shellName}
          </div>
        )}
        <div className="sb-item">
          <span className="material-symbols-rounded">straighten</span>
          {charset}
        </div>
      </div>
      <div className="sb-right">
        {aiModel && (
          <div className="sb-item accent">
            <span className="material-symbols-rounded">smart_toy</span>
            {aiModel}
          </div>
        )}
        {isSSH && metrics.cpu !== null && (
          <div className={`sb-item ${metricColor(metrics.cpu)}`}>
            <span className="material-symbols-rounded">memory</span>
            CPU {metrics.cpu.toFixed(1)}%
          </div>
        )}
        {isSSH && metrics.memory !== null && (
          <div className={`sb-item ${metricColor(metrics.memory)}`}>
            <span className="material-symbols-rounded">memory_alt</span>
            Mem {metrics.memory.toFixed(1)}%
          </div>
        )}
        {isSSH && metrics.disk !== null && (
          <div className={`sb-item ${metricColor(metrics.disk)}`}>
            <span className="material-symbols-rounded">storage</span>
            Disk {metrics.disk}%
          </div>
        )}
        {isSSH && sshStatus === 'connected' && metrics.cpu === null && metrics.memory === null && metrics.disk === null && (
          <div className="sb-item dim">
            <span className="material-symbols-rounded">hourglass_empty</span>
            {t('statusBar.fetchingMetrics')}
          </div>
        )}
      </div>
    </>
  );
}

interface SftpConnectionInfo {
  status: 'connected' | 'connecting' | 'disconnected';
  connectedCount: number;
  host: string;
}

function useSftpConnectionInfo(): SftpConnectionInfo {
  const storeSessionId = useSftpBrowserStore((s) => s.selectedSshSessionId);
  const [info, setInfo] = useState<SftpConnectionInfo>({ status: 'disconnected', connectedCount: 0, host: '' });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const sessions = await window.api.ssh.listSessions();
        if (cancelled) return;

        const connected = sessions.filter((s) => s.status === 'connected');
        const connecting = sessions.filter((s) => s.status === 'connecting');

        if (storeSessionId) {
          const selected = sessions.find((s) => s.id === storeSessionId);
          if (selected?.status === 'connected') {
            setInfo({ status: 'connected', connectedCount: connected.length, host: `${selected.username}@${selected.host}` });
            return;
          }
        }

        if (connected.length > 0) {
          const first = connected[0]!;
          setInfo({ status: 'connected', connectedCount: connected.length, host: `${first.username}@${first.host}` });
        } else if (connecting.length > 0) {
          setInfo({ status: 'connecting', connectedCount: 0, host: '' });
        } else {
          setInfo({ status: 'disconnected', connectedCount: 0, host: '' });
        }
      } catch {
        if (!cancelled) setInfo({ status: 'disconnected', connectedCount: 0, host: '' });
      }
    };

    void refresh();
    const off = window.api.ssh.onStatusChange(() => void refresh());
    return () => { cancelled = true; off(); };
  }, [storeSessionId]);

  return info;
}

function SftpStatus(): React.ReactElement {
  const { t } = useTranslation();
  const conn = useSftpConnectionInfo();
  const stats = useTransferStats();

  const isConnected = conn.status === 'connected';

  return (
    <>
      <div className="sb-left">
        {isConnected ? (
          <div className="sb-item green" title={conn.host}>
            <span className="material-symbols-rounded">cloud_done</span>
            {t('statusBar.sftpConnected')}
            {conn.connectedCount > 1 ? ` (${conn.connectedCount})` : ''}
          </div>
        ) : conn.status === 'connecting' ? (
          <div className="sb-item orange">
            <span className="material-symbols-rounded">cloud_sync</span>
            {t('statusBar.sftpConnecting')}
          </div>
        ) : (
          <div className="sb-item dim">
            <span className="material-symbols-rounded">cloud_off</span>
            {t('statusBar.sftpDisconnected')}
          </div>
        )}
        {stats.activeCount > 0 ? (
          <div className="sb-item accent">
            <span className="material-symbols-rounded">swap_horiz</span>
            {stats.activeCount}{' '}
            {stats.activeCount === 1 ? t('statusBar.transfer') : t('statusBar.transfers')}
          </div>
        ) : stats.completedCount > 0 || stats.failedCount > 0 ? (
          <div className="sb-item">
            <span className="material-symbols-rounded">check_circle</span>
            {stats.completedCount} {t('statusBar.done')}
            {stats.failedCount > 0 ? `, ${stats.failedCount} ${t('statusBar.failed')}` : ''}
          </div>
        ) : (
          <div className="sb-item dim">
            <span className="material-symbols-rounded">swap_horiz</span>
            {t('statusBar.noTransfers')}
          </div>
        )}
      </div>
      <div className="sb-right">
        {stats.activeCount > 0 && (
          <>
            <div className="sb-item">
              <span className="material-symbols-rounded">percent</span>
              {Math.round(stats.overallProgress)}%
            </div>
            <div className="sb-item accent">
              <span className="material-symbols-rounded">speed</span>
              {formatSpeed(stats.speedBytesPerSec)}
            </div>
          </>
        )}
        {stats.activeCount === 0 && stats.totalCount === 0 && (
          <div className="sb-item dim">
            <span className="material-symbols-rounded">speed</span>
            {t('statusBar.idle')}
          </div>
        )}
      </div>
    </>
  );
}

function MarketplaceStatus(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <div className="sb-left">
        <div className="sb-item">
          <span className="material-symbols-rounded">extension</span>
          {t('statusBar.extensionsInstalled', { count: 7 })}
        </div>
      </div>
      <div className="sb-right">
        <div className="sb-item green">
          <span className="material-symbols-rounded">update</span>
          {t('statusBar.updatesAvailable', { count: 2 })}
        </div>
      </div>
    </>
  );
}

function SettingsStatus(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <div className="sb-left">
        <div className="sb-item">
          <span className="material-symbols-rounded">settings</span>
          {t('statusBar.settings')}
        </div>
      </div>
      <div className="sb-right" />
    </>
  );
}

export function StatusBar(): React.ReactElement {
  const activeView = useLayoutStore((s) => s.activeActivityBarItem);

  const isTerminalView = activeView === 'connections';
  const isSftpView = activeView === 'files';
  const isMarketplace = activeView === 'extensions';
  const isSettings = activeView === 'settings';

  return (
    <div className="status-bar">
      {isTerminalView && <TerminalStatus />}
      {isSftpView && <SftpStatus />}
      {isMarketplace && <MarketplaceStatus />}
      {isSettings && <SettingsStatus />}
    </div>
  );
}
