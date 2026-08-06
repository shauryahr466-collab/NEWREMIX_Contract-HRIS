import { useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAppStore } from '../store';
import { normalizeEmployeeId } from '../lib/utils';
import type { Employee } from '../types';

export function useZkSync() {
  const { isAdmin, quotaExceeded, reportError } = useAppStore();

  useEffect(() => {
    if (!isAdmin || quotaExceeded) return;

    const q = query(collection(db, 'zkRawEvents'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const addedChanges = snapshot.docChanges().filter(c => c.type === 'added');
      if (addedChanges.length === 0) return;

      console.log('Processing ZK Raw Events...', addedChanges.length);

      const userMappings = new Map<string, string>();
      const empNormMap = new Map<string, string>();

      try {
        const mappingsSnap = await getDocs(collection(db, 'zkUserMappings'));
        mappingsSnap.forEach(dDoc => {
          const d = dDoc.data();
          if (d.deviceUserId && d.employeeId) {
            const cleanDevId = String(d.deviceUserId).trim();
            userMappings.set(cleanDevId, d.employeeId);
            const normDevId = normalizeEmployeeId(cleanDevId);
            if (normDevId) userMappings.set(normDevId, d.employeeId);
          }
        });

        const empSnap = await getDocs(collection(db, 'employees'));
        empSnap.forEach(dDoc => {
          const emp = dDoc.data() as Employee;
          if (!emp || !emp.id) return;
          const officialId = String(emp.id).trim();
          if (!officialId) return;

          empNormMap.set(officialId, officialId);
          empNormMap.set(officialId.toLowerCase(), officialId);

          const normId = normalizeEmployeeId(officialId);
          if (normId) {
            empNormMap.set(normId, officialId);
            empNormMap.set(`EMP${normId}`, officialId);
            empNormMap.set(`EMP-${normId}`, officialId);
          }
        });
      } catch (err) {
        console.error('Failed to pre-fetch mappings', err);
        return;
      }

      const BATCH_LIMIT = 400;
      let currentBatch = writeBatch(db);
      let batchCount = 0;

      let quotaHit = false;

      const commitBatch = async () => {
        if (batchCount > 0) {
          if (quotaExceeded || quotaHit) return;
          try {
            await currentBatch.commit();
          } catch (err: any) {
            console.warn('Batch commit in useZkSync note (quota limit):', err);
            quotaHit = true;
            reportError?.(err);
            return;
          }
          currentBatch = writeBatch(db);
          batchCount = 0;
        }
      };

      for (const change of addedChanges) {
        if (quotaExceeded || quotaHit) break;
        const eventId = change.doc.id;
        const eventData = change.doc.data();
        const eventType = eventData.type;

        try {
          if (eventType === 'device_connection') {
            const devRef = doc(db, 'zkDevices', `sn_${eventData.sn}`);
            currentBatch.set(devRef, { status: 'online', lastConnection: eventData.timestamp }, { merge: true });
            batchCount++;
          } else if (eventType === 'device_push' || eventType === 'agent_sync') {
            const sn = eventData.sn || eventData.deviceId || 'UNKNOWN';
            const punches = eventData.punches || [];
            
            for (const p of punches) {
              const deviceUserId = p.deviceUserId;
              const rawTime = p.punchDateTime || p.punchDatetime || p.time;
              if (!deviceUserId || !rawTime) continue;

              const punchDateTime = String(rawTime).replace(' ', 'T');

              const transactionId = `adms_${sn}_${deviceUserId}_${punchDateTime}`;
              const punchId = `zk_${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
              
              const rawDevId = String(deviceUserId).trim();
              const normDevId = normalizeEmployeeId(rawDevId);
              
              let employeeId = userMappings.get(rawDevId) || (normDevId ? userMappings.get(normDevId) : undefined);
              if (!employeeId) {
                employeeId = empNormMap.get(rawDevId) || 
                             (normDevId ? empNormMap.get(normDevId) : undefined) ||
                             empNormMap.get(`EMP${normDevId}`) ||
                             empNormMap.get(rawDevId.toLowerCase());
              }

              if (employeeId) {
                const pRef = doc(db, 'punches', punchId);
                currentBatch.set(pRef, {
                  id: punchId,
                  employeeId,
                  punchDatetime: punchDateTime,
                  source: 'biometric',
                  deviceId: sn,
                  syncStatus: 'synced',
                  createdAt: new Date().toISOString()
                });
                batchCount++;
              } else {
                const unmappedId = `unmapped_${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const uRef = doc(db, 'zkUnmappedPunches', unmappedId);
                currentBatch.set(uRef, {
                  id: unmappedId,
                  transactionId,
                  deviceId: sn,
                  deviceUserId,
                  punchDateTime,
                  status: 'pending',
                  syncTime: new Date().toISOString()
                });
                batchCount++;
              }

              if (batchCount >= BATCH_LIMIT) await commitBatch();
            }

            const logId = `synclog_${Date.now()}`;
            const logRef = doc(db, 'zkSyncLogs', logId);
            currentBatch.set(logRef, {
              id: logId,
              timestamp: eventData.timestamp,
              deviceId: sn,
              status: 'success',
              recordsSynced: punches.length
            });
            batchCount++;
            
            const devRef = doc(db, 'zkDevices', `sn_${sn}`);
            currentBatch.set(devRef, { status: 'online', lastConnection: eventData.timestamp, lastSync: eventData.timestamp }, { merge: true });
            batchCount++;
          }

          currentBatch.delete(doc(db, 'zkRawEvents', eventId));
          batchCount++;

          if (batchCount >= BATCH_LIMIT) await commitBatch();
          
        } catch (err) {
          console.error(`Error processing raw event ${eventId}:`, err);
          reportError?.(err);
        }
      }

      try {
        await commitBatch();
      } catch (err) {
        console.error('Error committing batch in useZkSync:', err);
        reportError?.(err);
      }
    }, (error) => {
      console.warn('zkRawEvents snapshot listener note (quota/network):', error?.message || error);
      if (error?.code === 'resource-exhausted' || String(error).toLowerCase().includes('quota')) {
        reportError?.(error);
      }
    });

    return () => unsubscribe();
  }, [isAdmin, quotaExceeded, reportError]);
}
