import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Fingerprint,
  Radio,
  Server,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAppStore } from '../store';
import { ZkDevice, ZkSyncLog } from '../types';
import { Card, Button, Skeleton } from './ui';
import { cn } from '../lib/utils';
import { authFetch } from '../lib/authSession';

interface PollingStatusSummary {
  enabled: boolean;
  intervalSeconds: number;
  intervalMinutes: number;
  isPollingNow: boolean;
  lastPollAt: string | null;
  totalPollsRun: number;
  deviceCount: number;
  enabledDeviceCount: number;
  onlineDeviceCount: number;
  punchCount: number;
  activeEmployeeCount: number;
  mappedUserCount: number;
  pendingUnmappedCount: number;
  latestPunchDatetime: string | null;
  lastSuccessfulSyncLog?: ZkSyncLog | null;
  latestSyncLog?: ZkSyncLog | null;
  averageLatencyMs?: number | null;
}

type LatencyTier = 'optimal' | 'good' | 'elevated' | 'high' | 'offline' | 'paused' | 'unknown';

interface LatencyEvaluation {
  ms: number | null;
  tier: LatencyTier;
  bars: 0 | 1 | 2 | 3 | 4;
  label: string;
  isTimeout: boolean;
}

function parseTimestampSafe(value?: string | null): Date | null {
  if (!value) return null;
  const iso = parseISO(value);
  if (isValid(iso)) return iso;
  const fallback = new Date(value);
  return isValid(fallback) ? fallback : null;
}

function formatSyncTimestamp(value?: string | null): { absolute: string; relative: string } | null {
  const dt = parseTimestampSafe(value);
  if (!dt) return null;
  return {
    absolute: format(dt, 'dd MMM yyyy, HH:mm:ss'),
    relative: formatDistanceToNow(dt, { addSuffix: true }),
  };
}

function formatShortError(err?: string): string {
  if (!err) return 'Device unreachable on configured port';
  const cleaned = err.replace(/\s+/g, ' ').trim();
  if (cleaned.toLowerCase().includes('timeout')) {
    return 'TCP/UDP connection timeout';
  }
  return cleaned.length > 68 ? `${cleaned.slice(0, 65)}...` : cleaned;
}

function evaluateDeviceLatency(
  device: ZkDevice,
  latestLog?: ZkSyncLog
): LatencyEvaluation {
  if (device.enabled === false) {
    return { ms: null, tier: 'paused', bars: 0, label: 'Paused', isTimeout: false };
  }

  const rawMs =
    typeof device.lastLatencyMs === 'number' && device.lastLatencyMs >= 0
      ? device.lastLatencyMs
      : typeof latestLog?.durationMs === 'number' && latestLog.durationMs >= 0
        ? latestLog.durationMs
        : null;

  if (device.status !== 'online') {
    return {
      ms: rawMs,
      tier: 'offline',
      bars: 0,
      label: rawMs !== null ? 'Timeout' : 'Unreachable',
      isTimeout: rawMs !== null,
    };
  }

  if (rawMs === null) {
    return { ms: null, tier: 'unknown', bars: 0, label: 'Unmeasured', isTimeout: false };
  }

  if (rawMs <= 150) {
    return { ms: rawMs, tier: 'optimal', bars: 4, label: 'Low', isTimeout: false };
  }
  if (rawMs <= 500) {
    return { ms: rawMs, tier: 'good', bars: 3, label: 'Normal', isTimeout: false };
  }
  if (rawMs <= 1500) {
    return { ms: rawMs, tier: 'elevated', bars: 2, label: 'Elevated', isTimeout: false };
  }
  return { ms: rawMs, tier: 'high', bars: 1, label: 'High', isTimeout: false };
}

function LatencySignalBars({
  bars,
  tier,
}: {
  bars: 0 | 1 | 2 | 3 | 4;
  tier: LatencyTier;
}) {
  const heights = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4'];
  const activeColor =
    tier === 'optimal'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : tier === 'good'
        ? 'bg-blue-500 dark:bg-blue-400'
        : tier === 'elevated'
          ? 'bg-amber-500 dark:bg-amber-400'
          : tier === 'high'
            ? 'bg-red-500 dark:bg-red-400'
            : tier === 'offline'
              ? 'bg-red-500/70'
              : 'bg-slate-400';

  return (
    <div
      className="inline-flex items-end gap-[3px] h-4 shrink-0"
      aria-label={`Signal strength ${bars} of 4`}
    >
      {heights.map((heightClass, idx) => {
        const isActive = idx < bars;
        return (
          <span
            key={idx}
            className={cn(
              'w-[3px] rounded-[1px] transition-colors',
              heightClass,
              isActive ? activeColor : 'bg-slate-200 dark:bg-slate-700'
            )}
          />
        );
      })}
    </div>
  );
}

export function BiometricHealth() {
  const {
    zkDevices,
    zkSyncLogs,
    zkUnmappedPunches,
    punches,
    isInitializing,
    canAccessModule,
  } = useAppStore();

  const [pollSummary, setPollSummary] = useState<PollingStatusSummary | null>(null);
  const [liveDevices, setLiveDevices] = useState<ZkDevice[] | null>(null);
  const [liveSyncLogs, setLiveSyncLogs] = useState<ZkSyncLog[] | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const fetchHealthTelemetry = useCallback(async () => {
    try {
      const [statusRes, devsRes, logsRes] = await Promise.all([
        authFetch('/api/zk/auto-poll/status'),
        authFetch('/api/local/data/zk_devices'),
        authFetch('/api/local/data/zk_sync_logs'),
      ]);

      if (statusRes.ok) {
        const summaryData = await statusRes.json();
        setPollSummary(summaryData);
      }
      if (devsRes.ok) {
        const devsData = await devsRes.json();
        if (Array.isArray(devsData)) {
          setLiveDevices(devsData);
        }
      }
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (Array.isArray(logsData)) {
          setLiveSyncLogs(logsData);
        }
      }
    } catch {
      // Retain last known SQLite state cleanly
    }
  }, []);

  useEffect(() => {
    fetchHealthTelemetry();
    const timer = setInterval(fetchHealthTelemetry, 20000);
    return () => clearInterval(timer);
  }, [fetchHealthTelemetry]);

  const devices = useMemo(() => {
    if (liveDevices && liveDevices.length > 0) return liveDevices;
    return zkDevices;
  }, [liveDevices, zkDevices]);

  const syncLogs = useMemo(() => {
    const source = liveSyncLogs && liveSyncLogs.length > 0 ? liveSyncLogs : zkSyncLogs;
    return [...source].sort((a, b) => {
      const ta = parseTimestampSafe(a.timestamp)?.getTime() || 0;
      const tb = parseTimestampSafe(b.timestamp)?.getTime() || 0;
      return tb - ta;
    });
  }, [liveSyncLogs, zkSyncLogs]);

  const handleProbeHealth = async () => {
    setIsProbing(true);
    setProbeError(null);
    try {
      const res = await authFetch('/api/zk/health/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 1500 }),
      });
      if (!res.ok) {
        throw new Error(`Probe request returned HTTP ${res.status}`);
      }
      await fetchHealthTelemetry();
    } catch (err: any) {
      setProbeError(err?.message || 'Unable to probe biometric terminals');
    } finally {
      setIsProbing(false);
    }
  };

  const deviceTelemetry = useMemo(() => {
    const punchLastSyncByDev = new Map<string, string>();
    for (const p of punches) {
      if (!p.deviceId || !p.syncTime) continue;
      const prev = punchLastSyncByDev.get(p.deviceId);
      if (!prev || p.syncTime > prev) {
        punchLastSyncByDev.set(p.deviceId, p.syncTime);
      }
    }

    return devices.map((dev) => {
      const logsForDev = syncLogs.filter(
        (l) =>
          l.deviceId === dev.id ||
          (dev.name && l.deviceName?.toLowerCase() === dev.name.toLowerCase())
      );
      const latestLog = logsForDev[0];
      const lastSuccessLog = logsForDev.find((l) => l.status === 'Success');

      // Determine verified last successful sync timestamp strictly from Success sync records
      const candidateTimestamps = [
        dev.lastSuccessfulSync,
        lastSuccessLog?.timestamp,
        punchLastSyncByDev.get(dev.id),
      ].filter(Boolean) as string[];

      // Only trust legacy dev.lastSync when device has no Failed log matching it
      if (
        dev.lastSync &&
        (!latestLog || latestLog.status === 'Success' || dev.lastSync !== latestLog.timestamp)
      ) {
        candidateTimestamps.push(dev.lastSync);
      }

      candidateTimestamps.sort((a, b) => {
        const ta = parseTimestampSafe(a)?.getTime() || 0;
        const tb = parseTimestampSafe(b)?.getTime() || 0;
        return tb - ta;
      });

      const lastSuccessTimestamp = candidateTimestamps[0] || null;
      const latency = evaluateDeviceLatency(dev, latestLog);

      return {
        device: dev,
        latestLog,
        lastSuccessLog,
        lastSuccessTimestamp,
        lastSuccessFormatted: formatSyncTimestamp(lastSuccessTimestamp),
        latency,
      };
    });
  }, [devices, syncLogs, punches]);

  const fleetStats = useMemo(() => {
    const totalDevices = devices.length;
    const enabledDevices = devices.filter((d) => d.enabled !== false);
    const onlineEnabled = enabledDevices.filter((d) => d.status === 'online');

    const latestSuccessLog =
      syncLogs.find((l) => l.status === 'Success') || pollSummary?.lastSuccessfulSyncLog || null;

    const allSuccessTimestamps = [
      latestSuccessLog?.timestamp,
      ...deviceTelemetry.map((d) => d.lastSuccessTimestamp),
    ].filter(Boolean) as string[];

    allSuccessTimestamps.sort((a, b) => {
      const ta = parseTimestampSafe(a)?.getTime() || 0;
      const tb = parseTimestampSafe(b)?.getTime() || 0;
      return tb - ta;
    });

    const mostRecentSuccessAt = allSuccessTimestamps[0] || null;
    const mostRecentSuccessFormatted = formatSyncTimestamp(mostRecentSuccessAt);

    // Online device latency average, or all probed enabled devices if offline timeouts exist
    const onlineLatencies = deviceTelemetry
      .filter((t) => t.device.status === 'online' && t.latency.ms !== null)
      .map((t) => t.latency.ms as number);

    const measuredLatencies =
      onlineLatencies.length > 0
        ? onlineLatencies
        : deviceTelemetry
            .filter((t) => t.device.enabled !== false && t.latency.ms !== null)
            .map((t) => t.latency.ms as number);

    const avgLatencyMs =
      measuredLatencies.length > 0
        ? Math.round(measuredLatencies.reduce((a, b) => a + b, 0) / measuredLatencies.length)
        : pollSummary?.averageLatencyMs ?? null;

    let fleetLatencyTier: LatencyTier = 'unknown';
    let fleetBars: 0 | 1 | 2 | 3 | 4 = 0;
    let fleetLatencyLabel = 'Awaiting probe';

    if (onlineEnabled.length === 0 && enabledDevices.length > 0) {
      fleetLatencyTier = 'offline';
      fleetBars = 0;
      fleetLatencyLabel = avgLatencyMs !== null ? 'LAN Timeout' : 'Offline';
    } else if (avgLatencyMs !== null) {
      if (avgLatencyMs <= 150) {
        fleetLatencyTier = 'optimal';
        fleetBars = 4;
        fleetLatencyLabel = 'Optimal';
      } else if (avgLatencyMs <= 500) {
        fleetLatencyTier = 'good';
        fleetBars = 3;
        fleetLatencyLabel = 'Healthy';
      } else if (avgLatencyMs <= 1500) {
        fleetLatencyTier = 'elevated';
        fleetBars = 2;
        fleetLatencyLabel = 'Elevated';
      } else {
        fleetLatencyTier = 'high';
        fleetBars = 1;
        fleetLatencyLabel = 'Degraded';
      }
    }

    let fleetHealthState: 'healthy' | 'degraded' | 'offline' | 'unconfigured' = 'unconfigured';
    let fleetHealthText = 'No Devices';
    if (totalDevices > 0) {
      if (enabledDevices.length === 0) {
        fleetHealthState = 'degraded';
        fleetHealthText = 'Polling Paused';
      } else if (onlineEnabled.length === enabledDevices.length) {
        fleetHealthState =
          fleetLatencyTier === 'elevated' || fleetLatencyTier === 'high' ? 'degraded' : 'healthy';
        fleetHealthText =
          fleetHealthState === 'healthy' ? 'Healthy' : 'High Latency';
      } else if (onlineEnabled.length > 0) {
        fleetHealthState = 'degraded';
        fleetHealthText = 'Degraded';
      } else {
        fleetHealthState = 'offline';
        fleetHealthText = 'Offline';
      }
    }

    const pendingUnmapped =
      typeof pollSummary?.pendingUnmappedCount === 'number'
        ? pollSummary.pendingUnmappedCount
        : zkUnmappedPunches.filter((u) => !u.status || u.status === 'pending').length;

    const latestPunchDt =
      pollSummary?.latestPunchDatetime ||
      punches.reduce<string | null>((max, p) => {
        if (!p.punchDatetime) return max;
        return !max || p.punchDatetime > max ? p.punchDatetime : max;
      }, null);

    return {
      totalDevices,
      enabledCount: enabledDevices.length,
      onlineCount: onlineEnabled.length,
      latestSuccessLog,
      mostRecentSuccessFormatted,
      avgLatencyMs,
      fleetLatencyTier,
      fleetBars,
      fleetLatencyLabel,
      fleetHealthState,
      fleetHealthText,
      pendingUnmapped,
      totalPunches: pollSummary?.punchCount ?? punches.length,
      latestPunchFormatted: formatSyncTimestamp(latestPunchDt),
    };
  }, [devices, syncLogs, pollSummary, deviceTelemetry, zkUnmappedPunches, punches]);

  const canManageDevices = canAccessModule('devices');

  const scheduleMins = pollSummary
    ? Math.max(1, Number(pollSummary.intervalMinutes || Math.round((pollSummary.intervalSeconds || 900) / 60)))
    : 15;

  return (
    <Card
      title="Biometric Health"
      subtitle={
        pollSummary
          ? `SQLite ingestion telemetry · Auto-fetch ${pollSummary.enabled ? `every ${scheduleMins} min` : 'paused'}`
          : 'External biometric terminal sync status and measured connection latency'
      }
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleProbeHealth}
            disabled={isProbing || devices.length === 0}
          >
            <Radio size={13} className={cn(isProbing && 'animate-pulse text-primary')} />
            {isProbing ? 'Checking...' : 'Check Health'}
          </Button>
          {canManageDevices && (
            <Link to="/devices">
              <Button variant="ghost" size="sm">
                Devices
                <ArrowUpRight size={13} />
              </Button>
            </Link>
          )}
        </div>
      }
    >
      {/* Fleet Summary Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 -mx-5 px-5 pb-4 mb-4">
        <div className="pb-3 sm:pb-0 sm:pr-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Connection Health
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold',
                fleetStats.fleetHealthState === 'healthy'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : fleetStats.fleetHealthState === 'degraded'
                    ? 'text-amber-600 dark:text-amber-400'
                    : fleetStats.fleetHealthState === 'offline'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500'
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  fleetStats.fleetHealthState === 'healthy'
                    ? 'bg-emerald-500'
                    : fleetStats.fleetHealthState === 'degraded'
                      ? 'bg-amber-500'
                      : fleetStats.fleetHealthState === 'offline'
                        ? 'bg-red-500'
                        : 'bg-slate-400'
                )}
              />
              {fleetStats.fleetHealthText}
            </span>
          </div>
          <p className="text-[20px] font-bold text-slate-900 dark:text-white mt-1.5 tabular-nums leading-none">
            {fleetStats.onlineCount} / {fleetStats.enabledCount}
            <span className="text-[12px] font-medium text-slate-500 ml-1.5">Online</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 truncate">
            {fleetStats.totalDevices} registered terminal{fleetStats.totalDevices === 1 ? '' : 's'}
          </p>
        </div>

        <div className="py-3 sm:py-0 sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Last Successful Sync
            </span>
            <CheckCircle2
              size={13}
              className={cn(
                fleetStats.mostRecentSuccessFormatted
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
              )}
            />
          </div>
          {fleetStats.mostRecentSuccessFormatted ? (
            <>
              <p className="text-[14px] font-bold text-slate-900 dark:text-white mt-1.5 tabular-nums leading-snug">
                {fleetStats.mostRecentSuccessFormatted.relative}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums truncate">
                {fleetStats.mostRecentSuccessFormatted.absolute}
                {fleetStats.latestSuccessLog
                  ? ` · ${fleetStats.latestSuccessLog.newRecords} new`
                  : ''}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5">
                No verified sync yet
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Use Download Logs in ZKTeco Devices
              </p>
            </>
          )}
        </div>

        <div className="py-3 sm:py-0 sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Network Latency
            </span>
            <span
              className={cn(
                'text-[11px] font-semibold',
                fleetStats.fleetLatencyTier === 'optimal'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : fleetStats.fleetLatencyTier === 'good'
                    ? 'text-blue-600 dark:text-blue-400'
                    : fleetStats.fleetLatencyTier === 'elevated'
                      ? 'text-amber-600 dark:text-amber-400'
                      : fleetStats.fleetLatencyTier === 'high' ||
                          fleetStats.fleetLatencyTier === 'offline'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-500'
              )}
            >
              {fleetStats.fleetLatencyLabel}
            </span>
          </div>
          <div className="flex items-center gap-2.5 mt-1.5">
            <LatencySignalBars
              bars={fleetStats.fleetBars}
              tier={fleetStats.fleetLatencyTier}
            />
            <p className="text-[20px] font-bold text-slate-900 dark:text-white font-mono tabular-nums leading-none">
              {fleetStats.avgLatencyMs !== null
                ? `${fleetStats.avgLatencyMs.toLocaleString()} ms`
                : '—'}
            </p>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 truncate">
            {fleetStats.onlineCount > 0
              ? 'Measured TCP/UDP/HTTP round-trip'
              : 'Measured hardware probe timeout'}
          </p>
        </div>

        <div className="pt-3 sm:pt-0 sm:pl-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Punch Ledger
            </span>
            <Fingerprint size={13} className="text-slate-400" />
          </div>
          <p className="text-[20px] font-bold text-slate-900 dark:text-white mt-1.5 tabular-nums leading-none">
            {fleetStats.totalPunches.toLocaleString()}
            <span className="text-[12px] font-medium text-slate-500 ml-1.5">Punches</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums truncate">
            {fleetStats.pendingUnmapped > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {fleetStats.pendingUnmapped} unmapped punch
                {fleetStats.pendingUnmapped === 1 ? '' : 'es'} queued
              </span>
            ) : fleetStats.latestPunchFormatted ? (
              `Latest punch ${fleetStats.latestPunchFormatted.absolute}`
            ) : (
              '0 pending unmapped'
            )}
          </p>
        </div>
      </div>

      {probeError && (
        <div className="mb-4 px-3 py-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 flex items-center gap-2 text-[12px] text-red-700 dark:text-red-300">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{probeError}</span>
        </div>
      )}

      {/* Per-Device Table */}
      {isInitializing && devices.length === 0 ? (
        <div className="space-y-3 py-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : devices.length === 0 ? (
        <div className="py-8 text-center">
          <Server size={24} className="mx-auto text-slate-400 mb-2" />
          <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            No Biometric Terminals Configured
          </p>
          <p className="text-[12px] text-slate-500 mt-1 mb-4">
            Register an external ZKTeco terminal to monitor punch syncs and connection health.
          </p>
          {canManageDevices && (
            <Link to="/devices">
              <Button variant="outline" size="sm">
                Configure Biometric Devices
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-5 pr-3">Device & Endpoint</th>
                <th className="py-2.5 px-3">Connection Health</th>
                <th className="py-2.5 px-3">Latency</th>
                <th className="py-2.5 pl-3 pr-5">Last Successful Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[13px]">
              {deviceTelemetry.map(
                ({
                  device,
                  latestLog,
                  lastSuccessLog,
                  lastSuccessFormatted,
                  latency,
                }) => {
                  const isDeviceOnline =
                    device.enabled !== false && device.status === 'online';
                  const isDevicePaused = device.enabled === false;

                  return (
                    <tr
                      key={device.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 pl-5 pr-3 align-middle">
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                          <div className="w-8 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                            {isDeviceOnline ? (
                              <Wifi size={15} className="text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <WifiOff size={15} className="text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white leading-tight truncate">
                              {device.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                              {device.ip}
                              {device.port ? `:${device.port}` : ''} · {device.model || 'ZKTeco'}
                              {device.serialNumber ? ` · ${device.serialNumber}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 align-middle">
                        <div className="min-w-[150px]">
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                'w-2 h-2 rounded-full shrink-0',
                                isDevicePaused
                                  ? 'bg-slate-400'
                                  : isDeviceOnline
                                    ? 'bg-emerald-500'
                                    : 'bg-red-500'
                              )}
                            />
                            <span
                              className={cn(
                                'font-semibold text-[12px]',
                                isDevicePaused
                                  ? 'text-slate-500'
                                  : isDeviceOnline
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-red-700 dark:text-red-400'
                              )}
                            >
                              {isDevicePaused
                                ? 'Paused'
                                : isDeviceOnline
                                  ? 'Online'
                                  : 'Offline'}
                            </span>
                            <span className="text-[11px] text-slate-400">·</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                              {device.lastProtocolUsed || device.protocolMode || 'Auto'}
                            </span>
                          </div>
                          {!isDeviceOnline && !isDevicePaused && device.lastError && (
                            <p
                              className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5 truncate max-w-[230px]"
                              title={device.lastError}
                            >
                              {formatShortError(device.lastError)}
                            </p>
                          )}
                          {isDeviceOnline && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                              {(device.logCount ?? 0).toLocaleString()} punches synced ·{' '}
                              {(device.deviceCapacityUsers ?? device.userCount ?? 0).toLocaleString()}{' '}
                              enrolled
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-middle">
                        <div className="flex items-center gap-2.5 min-w-[140px]">
                          <LatencySignalBars bars={latency.bars} tier={latency.tier} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  'font-mono text-[12px] font-semibold tabular-nums',
                                  latency.tier === 'optimal'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : latency.tier === 'good'
                                      ? 'text-blue-700 dark:text-blue-400'
                                      : latency.tier === 'elevated'
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : latency.tier === 'high' || latency.tier === 'offline'
                                          ? 'text-red-700 dark:text-red-400'
                                          : 'text-slate-500'
                                )}
                              >
                                {latency.ms !== null
                                  ? `${latency.ms.toLocaleString()} ms`
                                  : '—'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                              {latency.label}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pl-3 pr-5 align-middle">
                        <div className="min-w-[175px]">
                          {lastSuccessFormatted ? (
                            <>
                              <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-tight">
                                {lastSuccessFormatted.relative}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                                {lastSuccessFormatted.absolute}
                                {lastSuccessLog
                                  ? ` · ${lastSuccessLog.recordsRead} read / ${lastSuccessLog.newRecords} new`
                                  : ''}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                                No successful sync logged
                              </p>
                              {latestLog && (
                                <p className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                                  Last attempt failed ({formatSyncTimestamp(latestLog.timestamp)?.relative || 'recent'})
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
