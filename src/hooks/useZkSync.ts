import { useEffect } from 'react';
import { useAppStore } from '../store';

/**
 * ZKTeco Hybrid Polling Hook:
 * 1. Bridges local Windows LAN Agent (http://127.0.0.1:4375/bridge/pull) -> POST /api/zk/agent/sync -> SQLite
 * 2. Syncs UI punch state from SQLite ZKT polling engine every 20 seconds.
 */
export function useZkSync() {
  const { isAdmin, refreshPunchesFromSqlite } = useAppStore();

  useEffect(() => {
    if (!isAdmin) return;

    const runHybridZkCycle = async () => {
      // 1. Check optional Windows Local Browser Bridge (127.0.0.1:4375)
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);
        const bridgeRes = await fetch('http://127.0.0.1:4375/bridge/pull', {
          signal: controller.signal
        });
        clearTimeout(timer);

        if (bridgeRes.ok) {
          const payload = await bridgeRes.json();
          const devBatches = Array.isArray(payload?.devices) ? payload.devices : [];
          let pushedAny = false;

          for (const batch of devBatches) {
            if (!batch || !Array.isArray(batch.punches) || batch.punches.length === 0) continue;
            const syncRes = await fetch('/api/zk/agent/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceId: batch.deviceId,
                deviceName: batch.deviceName,
                deviceIP: batch.deviceIP,
                punches: batch.punches,
                mode: 'LAN Browser Bridge'
              })
            });
            if (syncRes.ok) {
              pushedAny = true;
            }
          }

          if (pushedAny) {
            await fetch('http://127.0.0.1:4375/bridge/ack', { method: 'POST' }).catch(() => {});
          }
        }
      } catch {
        // Local bridge not running on this browser host — ignore silently
      }

      // 2. Poll SQLite ZKT status & refresh punch records in store
      try {
        await fetch('/api/zk/auto-poll/status');
      } catch {
        // Ignore network errors
      }
      try {
        await refreshPunchesFromSqlite(false);
      } catch {
        // Ignore read errors
      }
    };

    runHybridZkCycle();
    const interval = setInterval(runHybridZkCycle, 20 * 1000);

    return () => clearInterval(interval);
  }, [isAdmin, refreshPunchesFromSqlite]);
}
