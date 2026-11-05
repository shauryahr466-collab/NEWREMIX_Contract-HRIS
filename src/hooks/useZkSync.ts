import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

/**
 * Polls the SQLite backend & Local Windows PC Agent Bridge (http://127.0.0.1:4375)
 * to keep biometric devices, punches, sync logs, and unmapped punches
 * synchronized in real time into the SQLite database (E:\SHRM_HRIS\Database.db).
 * Strictly fetches ALL active-employee punches without slice caps and skips already-fetched duplicates.
 */
export function useZkSync() {
  const { isAdmin, recalculate } = useAppStore();
  const lastBridgeTimestamps = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!isAdmin) return;

    const syncWithSqliteAndBridge = async () => {
      try {
        await fetch('/api/zk/auto-poll/status');
      } catch {
        // Ignore network errors
      }

      // Check if the Local Windows PC Agent Bridge (zk-lan-connector.js on 127.0.0.1:4375) is running
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch('http://127.0.0.1:4375/bridge/pull', {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.devices) && data.devices.length > 0) {
            let anyNewSynced = false;
            const BATCH_SIZE = 5000;

            for (const devBatch of data.devices) {
              const prevTs = lastBridgeTimestamps.current[devBatch.deviceId];
              if (prevTs && prevTs === devBatch.updatedAt) continue;

              const punches = Array.isArray(devBatch.punches) ? devBatch.punches : [];
              if (punches.length > 0) {
                for (let i = 0; i < punches.length; i += BATCH_SIZE) {
                  const chunk = punches.slice(i, i + BATCH_SIZE);
                  const syncRes = await fetch('/api/zk/agent/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deviceId: devBatch.deviceId,
                      deviceName: devBatch.deviceName,
                      deviceIP: devBatch.deviceIP,
                      logCount: devBatch.logCount || punches.length,
                      punches: chunk,
                      autoFetch: false
                    })
                  });
                  if (syncRes.ok) {
                    const syncJson = await syncRes.json();
                    if (syncJson && syncJson.newRecords > 0) {
                      anyNewSynced = true;
                    }
                  }
                }
                lastBridgeTimestamps.current[devBatch.deviceId] = devBatch.updatedAt;
              }
            }

            if (anyNewSynced) {
              try {
                await fetch('http://127.0.0.1:4375/bridge/ack');
              } catch {}
              await recalculate();
            }
          }
        }
      } catch {
        // Local PC bridge not running on 127.0.0.1:4375 or unreachable — silent ignore
      }
    };

    syncWithSqliteAndBridge();
    const interval = setInterval(syncWithSqliteAndBridge, 20 * 1000);

    return () => clearInterval(interval);
  }, [isAdmin, recalculate]);
}
