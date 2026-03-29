import { useEffect, useRef, useState } from 'react';

export interface RemoteMetrics {
  cpu: number | null;
  memory: number | null;
  disk: number | null;
}

const POLL_INTERVAL_MS = 5_000;

const METRICS_CMD = [
  "awk '/^cpu /{for(i=2;i<=NF;i++)s+=$i;print $2+$3+$4,s}' /proc/stat",
  "free 2>/dev/null|awk 'NR==2{printf \"%.1f\",$3*100/$2}'",
  "df / 2>/dev/null|awk 'NR==2{gsub(/%/,\"\");printf \"%s\",$5}'",
].join(' && echo "|" && ');

interface CpuSample {
  busy: number;
  total: number;
}

export function useRemoteMetrics(sshSessionId: string | undefined): RemoteMetrics {
  const [metrics, setMetrics] = useState<RemoteMetrics>({ cpu: null, memory: null, disk: null });
  const prevCpu = useRef<CpuSample | null>(null);

  useEffect(() => {
    if (!sshSessionId) {
      setMetrics({ cpu: null, memory: null, disk: null });
      prevCpu.current = null;
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const result = await window.api.ssh.exec(sshSessionId, METRICS_CMD);
        if (cancelled) return;

        const parts = result.stdout.split('|').map((s) => s.trim());

        const cpuRaw = parts[0];
        const memRaw = parts[1];
        const diskRaw = parts[2];

        let cpuPercent: number | null = null;
        if (cpuRaw) {
          const [busyStr, totalStr] = cpuRaw.split(/\s+/);
          const busy = parseFloat(busyStr ?? '');
          const total = parseFloat(totalStr ?? '');
          if (!isNaN(busy) && !isNaN(total)) {
            const prev = prevCpu.current;
            if (prev && total !== prev.total) {
              const dBusy = busy - prev.busy;
              const dTotal = total - prev.total;
              cpuPercent = Math.max(0, Math.min(100, (dBusy / dTotal) * 100));
            }
            prevCpu.current = { busy, total };
          }
        }

        const memPercent = memRaw ? parseFloat(memRaw) : null;
        const diskPercent = diskRaw ? parseFloat(diskRaw) : null;

        setMetrics({
          cpu: cpuPercent !== null && !isNaN(cpuPercent) ? Math.round(cpuPercent * 10) / 10 : null,
          memory: memPercent !== null && !isNaN(memPercent) ? memPercent : null,
          disk: diskPercent !== null && !isNaN(diskPercent) ? diskPercent : null,
        });
      } catch {
        if (!cancelled) {
          setMetrics({ cpu: null, memory: null, disk: null });
          prevCpu.current = null;
        }
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sshSessionId]);

  return metrics;
}
