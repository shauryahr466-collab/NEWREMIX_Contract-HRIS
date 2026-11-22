import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { fetchLocalPollDigest } from '../lib/localClient';
import { authFetch } from '../lib/authSession';

/**
 * ZKTeco Hybrid Polling Hook:
 * - On the host machine (localhost / 127.0.0.1), optionally bridges the local Windows LAN Agent (127.0.0.1:4375).
 * - On company LAN clients (e.g. Caddy 10.12.10.54:844), uses a 200-byte digest check every 25s
 *   and only reloads punches from SQLite when new records arrive.
 */
export function useZkSync() {
  const { isAdmin, refreshPunchesFromSqlite } = useAppStore();
  const lastDigestRef = useRef<string>('');

  useEffect(() => {
    if (!isAdmin) return;

    const isLocalHostBrowser =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const runHybridZkCycle = async () => {
      if (isLocalHostBrowser) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1200);
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
              const syncRes = await authFetch('/api/zk/agent/sync', {
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
              if (syncRes.ok) pushedAny = true;
            }

            if (pushedAny) {
              await fetch('http://127.0.0.1:4375/bridge/ack', { method: 'POST' }).catch(() => {});
            }
          }
        } catch {
          // Local bridge not active on this host
        }
      }

      try {
        const digest = await fetchLocalPollDigest();
        if (digest) {
          const key = `${digest.punchCount}|${digest.latestPunch}`;
          if (lastDigestRef.current && lastDigestRef.current !== key) {
            await refreshPunchesFromSqlite(false);
          }
          lastDigestRef.current = key;
        }
      } catch {
        // Ignore transient network errors
      }
    };

    const initialTimer = setTimeout(runHybridZkCycle, 5000);
    const interval = setInterval(runHybridZkCycle, 25 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isAdmin, refreshPunchesFromSqlite]);
}
